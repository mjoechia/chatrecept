// Package frontdesk handles the public chat API for the AI frontdesk bot.
// End customers on a tenant's website POST to /frontdesk/{tenantID}/chat.
// There is no JWT on this path — the tenant ID in the URL serves as the
// public identifier, and the bot only responds using data owned by that
// tenant.  Billing is tracked via the monthly_usage table (not wallet credits).
package frontdesk

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jc/pabot/internal/assistant"
	"github.com/jc/pabot/internal/billing"
	"github.com/jc/pabot/internal/conversations"
	"github.com/jc/pabot/internal/db"
	"github.com/jc/pabot/internal/messages"
)

// Handler serves POST /frontdesk/{tenantID}/chat.
type Handler struct {
	db           *db.DB
	assistantSvc *assistant.Service
	billingSvc   *billing.Service
	convSvc      *conversations.Service
	msgSvc       *messages.Service
}

// NewHandler constructs a frontdesk Handler.
func NewHandler(
	database *db.DB,
	assistantSvc *assistant.Service,
	billingSvc *billing.Service,
	convSvc *conversations.Service,
	msgSvc *messages.Service,
) *Handler {
	return &Handler{
		db:           database,
		assistantSvc: assistantSvc,
		billingSvc:   billingSvc,
		convSvc:      convSvc,
		msgSvc:       msgSvc,
	}
}

// CORSMiddleware allows any origin — the widget is embedded on third-party sites.
func (h *Handler) CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type chatRequest struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

type chatResponse struct {
	Reply         string  `json:"reply"`
	Confidence    float64 `json:"confidence"`
	Escalated     bool    `json:"escalated"`
	QuotaExceeded bool    `json:"quota_exceeded,omitempty"`
}

// Chat handles POST /frontdesk/{tenantID}/chat.
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	tenantID, err := uuid.Parse(chi.URLParam(r, "tenantID"))
	if err != nil {
		http.Error(w, "invalid tenant id", http.StatusBadRequest)
		return
	}

	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		http.Error(w, "message required", http.StatusBadRequest)
		return
	}
	if req.SessionID == "" {
		req.SessionID = uuid.New().String()
	}

	ctx := r.Context()

	// Fetch tenant fields (also validates the tenant exists and is active).
	var companyName, systemPrompt string
	var threshold float64
	if err := h.db.Pool.QueryRow(ctx, db.QueryGetTenantForFrontdesk, tenantID).Scan(
		&companyName, &systemPrompt, &threshold,
	); err != nil {
		http.Error(w, "tenant not found", http.StatusNotFound)
		return
	}

	// Monthly quota check — refuse to call Claude if the tenant is over cap.
	if err := h.billingSvc.CheckMonthlyQuota(ctx, tenantID); err != nil {
		if errors.Is(err, billing.ErrQuotaExceeded) {
			writeJSON(w, chatResponse{
				Reply:         "Thank you for your message. We're briefly at capacity — your enquiry has been noted and the team will follow up shortly.",
				QuotaExceeded: true,
			})
			return
		}
		// Billing read error: log and continue so end customers aren't blocked.
		slog.Warn("frontdesk: quota check error", "tenant", tenantID, "err", err)
	}

	// Upsert a pseudo-user so we can tie the conversation to a users row.
	phone := sessionPhone(req.SessionID)
	var (
		userID          uuid.UUID
		_tenantID       uuid.UUID
		_phone, _name   *string
		_lastMessageAt  *time.Time
	)
	if err := h.db.Pool.QueryRow(ctx, db.QueryUpsertUser, tenantID, phone, "").Scan(
		&userID, &_tenantID, &_phone, &_name, &_lastMessageAt,
	); err != nil {
		slog.Error("frontdesk: upsert user", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Get or create a conversation window (no wallet deduction for frontdesk).
	conv, err := h.convSvc.GetOrCreateForWeb(ctx, tenantID, userID)
	if err != nil {
		slog.Error("frontdesk: get/create conversation", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Load recent message history for conversational context.
	history, err := h.convSvc.GetRecentMessages(ctx, conv.ID)
	if err != nil {
		history = nil // stateless answer is better than an error
	}

	// Generate answer with KB retrieval.
	result, err := h.assistantSvc.Answer(ctx, tenantID, companyName, systemPrompt, threshold, req.Message, history)
	if err != nil {
		slog.Error("frontdesk: assistant answer", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Persist user message + bot reply.
	saveMsg := func(sender, content string) {
		_, _ = h.msgSvc.Store(ctx, messages.Record{
			TenantID:       tenantID,
			ConversationID: conv.ID,
			Sender:         sender,
			Content:        content,
		})
	}
	saveMsg("user", req.Message)
	saveMsg("bot", result.Answer)

	// Increment monthly usage (1 user + 1 bot = 2 messages per round trip).
	if _, err := h.billingSvc.IncrementUsage(ctx, tenantID, 2); err != nil {
		slog.Warn("frontdesk: increment usage", "tenant", tenantID, "err", err)
	}

	writeJSON(w, chatResponse{
		Reply:      result.Answer,
		Confidence: result.Confidence,
		Escalated:  result.Escalate,
	})
}

// sessionPhone maps a session ID to a stable pseudo-phone-number used to
// identify the web visitor in the users table.
func sessionPhone(sessionID string) string {
	s := "web:" + sessionID
	if len(s) > 30 {
		s = s[:30]
	}
	return s
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// BillingUsageHandler handles GET /api/tenants/{id}/billing/usage.
// Returns the current-month usage snapshot for the owner dashboard.
func BillingUsageHandler(billingSvc *billing.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}
		snap, err := billingSvc.CurrentUsage(r.Context(), tenantID)
		if err != nil {
			http.Error(w, "usage query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(snap)
	}
}
