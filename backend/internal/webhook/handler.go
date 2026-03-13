package webhook

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/ai"
	"github.com/jc/pabot/internal/conversations"
	"github.com/jc/pabot/internal/db"
	"github.com/jc/pabot/internal/leads"
	"github.com/jc/pabot/internal/messages"
	"github.com/jc/pabot/internal/tenants"
	"github.com/jc/pabot/internal/wallet"
	"github.com/jc/pabot/internal/whatsapp"
)

// ── Meta webhook payload structures ──────────────────────────────────────────

type inboundPayload struct {
	Object string        `json:"object"`
	Entry  []entryObject `json:"entry"`
}

type entryObject struct {
	ID      string         `json:"id"`
	Changes []changeObject `json:"changes"`
}

type changeObject struct {
	Field string      `json:"field"`
	Value changeValue `json:"value"`
}

type changeValue struct {
	MessagingProduct string          `json:"messaging_product"`
	Metadata         messageMetadata `json:"metadata"`
	Messages         []waMessage     `json:"messages"`
	Contacts         []waContact     `json:"contacts"`
}

type messageMetadata struct {
	DisplayPhoneNumber string `json:"display_phone_number"`
	PhoneNumberID      string `json:"phone_number_id"`
}

type waMessage struct {
	ID        string   `json:"id"`
	From      string   `json:"from"`
	Timestamp string   `json:"timestamp"`
	Type      string   `json:"type"`
	Text      *waText  `json:"text,omitempty"`
}

type waText struct {
	Body string `json:"body"`
}

type waContact struct {
	Profile struct {
		Name string `json:"name"`
	} `json:"profile"`
	WaID string `json:"wa_id"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

type Handler struct {
	appSecret string
	database  *db.DB
	tenantSvc *tenants.Service
	convSvc   *conversations.Service
	aiSvc     ai.Provider   // set per-call by router; kept for lead detection fallback
	aiRouter  *ai.Router
	waSvc     *whatsapp.Client
	msgSvc    *messages.Service
	leadSvc   *leads.Service
}

type HandlerDeps struct {
	AppSecret string
	Database  *db.DB
	TenantSvc *tenants.Service
	ConvSvc   *conversations.Service
	AISvc     ai.Provider
	AIRouter  *ai.Router
	WASvc     *whatsapp.Client
	MsgSvc    *messages.Service
	LeadSvc   *leads.Service
}

func NewHandler(deps HandlerDeps) *Handler {
	return &Handler{
		appSecret: deps.AppSecret,
		database:  deps.Database,
		tenantSvc: deps.TenantSvc,
		convSvc:   deps.ConvSvc,
		aiSvc:     deps.AISvc,
		aiRouter:  deps.AIRouter,
		waSvc:     deps.WASvc,
		msgSvc:    deps.MsgSvc,
		leadSvc:   deps.LeadSvc,
	}
}

// HandleInbound processes incoming WhatsApp messages.
// Responds 200 immediately then processes asynchronously.
func (h *Handler) HandleInbound(w http.ResponseWriter, r *http.Request) {
	// 1. Validate Meta HMAC-SHA256 signature
	body, err := ValidateSignature(r, h.appSecret)
	if err != nil {
		slog.Warn("webhook signature invalid", "err", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// 2. Parse payload
	var payload inboundPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		slog.Error("webhook parse error", "err", err)
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// 3. Acknowledge immediately — Meta requires 200 within 20s
	w.WriteHeader(http.StatusOK)

	// 4. Process each message in a goroutine (detached from request context)
	for _, entry := range payload.Entry {
		for _, change := range entry.Changes {
			if change.Field != "messages" {
				continue
			}
			cv := change.Value
			for i, msg := range cv.Messages {
				if msg.Type != "text" || msg.Text == nil {
					continue
				}
				senderName := ""
				if i < len(cv.Contacts) {
					senderName = cv.Contacts[i].Profile.Name
				}
				go h.processMessage(cv.Metadata.PhoneNumberID, msg.ID, msg.From, senderName, msg.Text.Body)
			}
		}
	}
}

// processMessage runs the full message handling pipeline.
// Must not use the HTTP request context (it will be cancelled after the handler returns).
func (h *Handler) processMessage(phoneNumberID, msgID, from, senderName, text string) {
	ctx := context.Background()
	logger := slog.With("phone_number_id", phoneNumberID, "from", from)

	// 1. Look up tenant
	tenant, err := h.tenantSvc.GetByPhoneNumberID(ctx, phoneNumberID)
	if err != nil {
		logger.Error("tenant lookup failed", "err", err)
		return
	}
	logger = logger.With("tenant_id", tenant.ID)

	// Access token for WA API — Phase 2: decrypt properly
	accessToken := tenant.MetaAccessTokenEncrypted

	// 2. Upsert user (get or create by phone number)
	userID, err := h.upsertUser(ctx, tenant.ID, from, senderName)
	if err != nil {
		logger.Error("upsert user failed", "err", err)
		return
	}

	// 3. Get or create 24h conversation window
	conv, creditDeducted, err := h.convSvc.GetOrCreateWindow(ctx, tenant.ID, userID)
	if err != nil {
		if errors.Is(err, wallet.ErrInsufficientBalance) {
			logger.Warn("wallet balance empty — conversation blocked")
			// Phase 2: send admin alert
			return
		}
		logger.Error("conversation window error", "err", err)
		return
	}
	if creditDeducted {
		logger.Info("new conversation window, credit deducted")
	}

	// 4. Store inbound customer message
	_, _ = h.msgSvc.Store(ctx, messages.Record{
		TenantID:       tenant.ID,
		ConversationID: conv.ID,
		Sender:         "customer",
		Content:        text,
	})

	// 5. Get recent message history for AI context
	history, err := h.convSvc.GetRecentMessages(ctx, conv.ID)
	if err != nil {
		logger.Warn("could not load history, proceeding without", "err", err)
		history = nil
	}

	// 6. Generate AI response — route to Claude (en) or GLM (zh) by tenant language
	provider := h.aiRouter.For(tenant.Language)
	aiResp, err := provider.GenerateResponse(ctx, tenant.SystemPrompt, history, text)
	if err != nil {
		logger.Error("ai generation failed", "err", err)
		// Retry once
		aiResp, err = provider.GenerateResponse(ctx, tenant.SystemPrompt, history, text)
		if err != nil {
			logger.Error("ai generation retry failed", "err", err)
			_ = h.waSvc.SendTextMessage(ctx, phoneNumberID, accessToken, from,
				"I'm sorry, I'm having a technical issue. A team member will follow up with you shortly.")
			return
		}
	}

	// 7. Send reply via WhatsApp
	if err := h.waSvc.SendTextMessage(ctx, phoneNumberID, accessToken, from, aiResp.Text); err != nil {
		logger.Error("whatsapp send failed", "err", err)
		return
	}

	// 8. Store bot response with cost metadata
	_, _ = h.msgSvc.Store(ctx, messages.Record{
		TenantID:       tenant.ID,
		ConversationID: conv.ID,
		Sender:         "bot",
		Content:        aiResp.Text,
		TokenInput:     aiResp.InputTokens,
		TokenOutput:    aiResp.OutputTokens,
		ModelUsed:      aiResp.Model,
		EstimatedCost:  aiResp.Cost,
	})

	// 9. Mark incoming message as read
	_ = h.waSvc.MarkRead(ctx, phoneNumberID, accessToken, msgID)

	// 10. Async lead detection (Phase 1: no-op)
	_ = h.leadSvc.DetectAndUpsert(ctx, tenant.ID, userID, text)

	logger.Info("message handled",
		"conv_id", conv.ID,
		"tokens_in", aiResp.InputTokens,
		"tokens_out", aiResp.OutputTokens,
		"cost", fmt.Sprintf("$%.6f", aiResp.Cost),
	)
}

// upsertUser gets or creates a user record by phone number. Returns the user ID.
func (h *Handler) upsertUser(ctx context.Context, tenantID uuid.UUID, phone, name string) (uuid.UUID, error) {
	var userID, tenantIDOut uuid.UUID
	var phoneOut string
	var nameOut *string       // nullable
	var lastMsgAt interface{} // nullable timestamptz

	err := h.database.Pool.QueryRow(ctx, db.QueryUpsertUser, tenantID, phone, name).
		Scan(&userID, &tenantIDOut, &phoneOut, &nameOut, &lastMsgAt)
	if err != nil {
		return uuid.Nil, fmt.Errorf("upsert user: %w", err)
	}
	return userID, nil
}
