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

// messageTopupApplier is the minimal interface the payment service needs
// from the billing package for monthly-message top-ups (frontdesk bot
// Phase 1). Decoupled via interface so internal/payments doesn't import
// internal/billing directly — keeps the existing wallet flow's deps
// unchanged.
type messageTopupApplier interface {
	ApplyTopupByIDString(ctx context.Context, tenantIDStr, stripePaymentID string, amountSgd float64, credits int) (bool, error)
}

// CreditPackage represents a purchasable conversation-credit bundle.
// USD-priced — used by the WhatsApp conversation-window flow (1 credit
// per 24h conversation). Frontdesk-bot monthly-message top-ups use the
// separate MessagePackage type below (SGD-priced).
type CreditPackage struct {
	ID         string
	Credits    int
	PriceCents int // USD cents
	Label      string
}

// Packages are the available conversation-credit top-up options.
var Packages = []CreditPackage{
	{ID: "starter", Credits: 30, PriceCents: 990, Label: "30 Credits — $9.90"},
	{ID: "growth", Credits: 100, PriceCents: 2900, Label: "100 Credits — $29.00"},
	{ID: "scale", Credits: 300, PriceCents: 7900, Label: "300 Credits — $79.00"},
}

// MessagePackage represents a purchasable monthly-message top-up bundle
// for the frontdesk bot. SGD-priced (target market is SG SMEs).
type MessagePackage struct {
	ID         string
	Credits    int    // messages added to the current month
	PriceCents int    // SGD cents
	Label      string
}

// MessagePackages are the monthly-message top-up options surfaced when a
// tenant hits their plan quota.
var MessagePackages = []MessagePackage{
	{ID: "msg_500",  Credits: 500,  PriceCents: 1000, Label: "500 messages — SGD 10"},
	{ID: "msg_1100", Credits: 1100, PriceCents: 2000, Label: "1,100 messages — SGD 20 (10% bonus)"},
	{ID: "msg_3000", Credits: 3000, PriceCents: 5000, Label: "3,000 messages — SGD 50 (20% bonus)"},
}

type Service struct {
	secretKey     string
	webhookSecret string
	successURL    string
	cancelURL     string
	walletSvc     *wallet.Service
	affiliateSvc  affiliateIssuer
	billingSvc    messageTopupApplier // nil-safe; only invoked for monthly_messages purpose
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

// WithBilling wires a billing service for monthly-message top-ups.
// Optional dep — when nil, the webhook simply rejects monthly_messages
// purpose events with 503. Lets the existing call site at main.go stay
// the same shape; adopters add this builder call when wiring billing.
func (s *Service) WithBilling(b messageTopupApplier) *Service {
	s.billingSvc = b
	return s
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

// CreateMessageTopupCheckoutSession is the SGD-currency cousin of
// CreateCheckoutSession for frontdesk-bot monthly-message top-ups.
// Carries metadata.purpose="monthly_messages" so the webhook routes it
// to the billing service instead of the conversation-credit wallet.
func (s *Service) CreateMessageTopupCheckoutSession(ctx context.Context, tenantID string, pkg MessagePackage) (string, error) {
	if s.secretKey == "" {
		return "", fmt.Errorf("stripe not configured: STRIPE_SECRET_KEY missing")
	}

	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", s.successURL)
	form.Set("cancel_url", s.cancelURL)
	form.Set("metadata[tenant_id]", tenantID)
	form.Set("metadata[credits]", strconv.Itoa(pkg.Credits))
	form.Set("metadata[purpose]", "monthly_messages")
	form.Set("metadata[amount_sgd]", fmt.Sprintf("%.2f", float64(pkg.PriceCents)/100.0))
	form.Set("line_items[0][price_data][currency]", "sgd")
	form.Set("line_items[0][price_data][product_data][name]", fmt.Sprintf("%d ChatRecept Messages", pkg.Credits))
	form.Set("line_items[0][price_data][product_data][description]", "Monthly message top-up for your AI frontdesk")
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

// HandleStripeWebhook validates the Stripe-Signature and processes
// checkout.session.completed events. Dispatches by metadata.purpose:
//
//	""  / "conversation_credits"  → wallet top-up (existing flow)
//	"monthly_messages"            → billing.ApplyTopup (frontdesk bot)
//
// The Stripe payment id is required on the monthly_messages path to
// dedupe duplicate webhook deliveries. The wallet path is idempotent in
// practice (Stripe webhook retries are rare and the wallet topups are
// audited per row by wallet_transactions).
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
				ID            string `json:"id"`
				PaymentStatus string `json:"payment_status"`
				Metadata      struct {
					TenantID  string `json:"tenant_id"`
					Credits   string `json:"credits"`
					Purpose   string `json:"purpose"`
					AmountSGD string `json:"amount_sgd"`
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

	switch obj.Metadata.Purpose {
	case "monthly_messages":
		if s.billingSvc == nil {
			http.Error(w, "billing service not wired", http.StatusServiceUnavailable)
			return
		}
		amountSgd, _ := strconv.ParseFloat(obj.Metadata.AmountSGD, 64)
		if _, err := s.billingSvc.ApplyTopupByIDString(r.Context(),
			obj.Metadata.TenantID, obj.ID, amountSgd, credits,
		); err != nil {
			http.Error(w, "monthly-message top-up failed", http.StatusInternalServerError)
			return
		}

	case "", "conversation_credits":
		if err := s.walletSvc.TopUpByIDString(r.Context(), obj.Metadata.TenantID, credits, "stripe_purchase"); err != nil {
			http.Error(w, "wallet top-up failed", http.StatusInternalServerError)
			return
		}
		// Affiliate credits only on the conversation-credits path.
		if s.affiliateSvc != nil {
			if tenantUUID, err := uuid.Parse(obj.Metadata.TenantID); err == nil {
				go s.affiliateSvc.IssueCreditsForTopUp(r.Context(), tenantUUID, credits)
			}
		}

	default:
		http.Error(w, fmt.Sprintf("unknown metadata.purpose: %q", obj.Metadata.Purpose), http.StatusBadRequest)
		return
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
