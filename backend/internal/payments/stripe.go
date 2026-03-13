// Package payments implements Stripe payment integration using raw HTTP.
// No external Stripe SDK — avoids adding a new Go dependency.
package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/wallet"
)

// affiliateIssuer is the minimal interface the payment service needs from the affiliate package.
type affiliateIssuer interface {
	IssueCreditsForTopUp(ctx context.Context, sourceTenantID uuid.UUID, topupCredits int)
}

// CreditPackage represents a purchasable credit bundle.
type CreditPackage struct {
	ID         string
	Credits    int
	PriceCents int // USD cents
	Label      string
}

// Packages are the available top-up options surfaced in the dashboard.
var Packages = []CreditPackage{
	{ID: "starter", Credits: 30, PriceCents: 990, Label: "30 Credits — $9.90"},
	{ID: "growth", Credits: 100, PriceCents: 2900, Label: "100 Credits — $29.00"},
	{ID: "scale", Credits: 300, PriceCents: 7900, Label: "300 Credits — $79.00"},
}

type Service struct {
	secretKey     string
	webhookSecret string
	successURL    string
	cancelURL     string
	walletSvc     *wallet.Service
	affiliateSvc  affiliateIssuer
	httpClient    *http.Client
}

func NewService(secretKey, webhookSecret, successURL, cancelURL string, walletSvc *wallet.Service, affiliateSvc affiliateIssuer) *Service {
	return &Service{
		secretKey:     secretKey,
		webhookSecret: webhookSecret,
		successURL:    successURL,
		cancelURL:     cancelURL,
		walletSvc:     walletSvc,
		affiliateSvc:  affiliateSvc,
		httpClient:    &http.Client{Timeout: 15 * time.Second},
	}
}

// CreateCheckoutSession creates a Stripe Checkout session and returns the redirect URL.
func (s *Service) CreateCheckoutSession(ctx context.Context, tenantID string, pkg CreditPackage) (string, error) {
	if s.secretKey == "" {
		return "", fmt.Errorf("stripe not configured: STRIPE_SECRET_KEY missing")
	}

	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", s.successURL)
	form.Set("cancel_url", s.cancelURL)
	form.Set("metadata[tenant_id]", tenantID)
	form.Set("metadata[credits]", strconv.Itoa(pkg.Credits))
	form.Set("line_items[0][price_data][currency]", "usd")
	form.Set("line_items[0][price_data][product_data][name]", fmt.Sprintf("%d Conversation Credits", pkg.Credits))
	form.Set("line_items[0][price_data][product_data][description]", "PABot AI Receptionist — prepaid conversation credits")
	form.Set("line_items[0][price_data][unit_amount]", strconv.Itoa(pkg.PriceCents))
	form.Set("line_items[0][quantity]", "1")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.stripe.com/v1/checkout/sessions",
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.secretKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("stripe request: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("stripe error %d: %s", resp.StatusCode, string(body))
	}

	var session struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &session); err != nil {
		return "", fmt.Errorf("stripe response parse: %w", err)
	}
	return session.URL, nil
}

// HandleStripeWebhook validates the Stripe-Signature and processes checkout.session.completed events.
func (s *Service) HandleStripeWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}

	if !s.verifySignature(body, r.Header.Get("Stripe-Signature")) {
		http.Error(w, "invalid signature", http.StatusUnauthorized)
		return
	}

	var event struct {
		Type string `json:"type"`
		Data struct {
			Object struct {
				PaymentStatus string `json:"payment_status"`
				Metadata      struct {
					TenantID string `json:"tenant_id"`
					Credits  string `json:"credits"`
				} `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		http.Error(w, "parse error", http.StatusBadRequest)
		return
	}

	// Acknowledge all event types — only act on completed payments
	if event.Type != "checkout.session.completed" || event.Data.Object.PaymentStatus != "paid" {
		w.WriteHeader(http.StatusOK)
		return
	}

	obj := event.Data.Object
	credits, err := strconv.Atoi(obj.Metadata.Credits)
	if err != nil || credits <= 0 || obj.Metadata.TenantID == "" {
		http.Error(w, "invalid metadata", http.StatusBadRequest)
		return
	}

	if err := s.walletSvc.TopUpByIDString(r.Context(), obj.Metadata.TenantID, credits, "stripe_purchase"); err != nil {
		http.Error(w, "wallet top-up failed", http.StatusInternalServerError)
		return
	}

	// Issue affiliate credits asynchronously — never block the Stripe webhook response
	if s.affiliateSvc != nil {
		if tenantUUID, err := uuid.Parse(obj.Metadata.TenantID); err == nil {
			go s.affiliateSvc.IssueCreditsForTopUp(r.Context(), tenantUUID, credits)
		}
	}

	w.WriteHeader(http.StatusOK)
}

// verifySignature validates the Stripe-Signature header (HMAC-SHA256 + replay protection).
func (s *Service) verifySignature(payload []byte, header string) bool {
	if s.webhookSecret == "" || header == "" {
		return false
	}

	var timestamp, v1 string
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			if v1 == "" {
				v1 = kv[1]
			}
		}
	}
	if timestamp == "" || v1 == "" {
		return false
	}

	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || time.Now().Unix()-ts > 300 { // reject if >5 min old
		return false
	}

	mac := hmac.New(sha256.New, []byte(s.webhookSecret))
	mac.Write([]byte(timestamp + "." + string(payload)))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(v1))
}
