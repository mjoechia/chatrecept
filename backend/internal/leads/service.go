package leads

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/db"
)

// classifier is the minimal interface needed from the AI service.
type classifier interface {
	Classify(ctx context.Context, systemPrompt, input string) (string, error)
}

// classifierPrompt instructs Claude to return JSON lead classification.
const classifierPrompt = `You are a lead detection system for a business WhatsApp receptionist.
Analyse the customer message and respond ONLY with valid JSON, no other text.

{"is_lead": true/false, "summary": "brief description or null", "urgency": 1-5 or null}

Urgency scale: 1=casual question, 2=general interest, 3=considering purchase, 4=ready to buy, 5=urgent/immediate need.
Only classify as a lead if the message shows genuine buying intent or service enquiry.
Greetings, thanks, or off-topic messages: is_lead=false, summary=null, urgency=null.`

type classifyResult struct {
	IsLead  bool    `json:"is_lead"`
	Summary *string `json:"summary"`
	Urgency *int    `json:"urgency"`
}

// Service handles lead detection and storage.
type Service struct {
	db    *db.DB
	aiSvc classifier
}

func NewService(database *db.DB, aiSvc classifier) *Service {
	return &Service{db: database, aiSvc: aiSvc}
}

// DetectAndUpsert analyses a customer message for lead signals using Claude.
// Runs asynchronously in the webhook pipeline — errors are logged, not surfaced.
func (s *Service) DetectAndUpsert(ctx context.Context, tenantID, userID uuid.UUID, message string) error {
	raw, err := s.aiSvc.Classify(ctx, classifierPrompt, message)
	if err != nil {
		slog.Warn("lead classifier error", "err", err)
		return nil
	}

	// Claude sometimes wraps JSON in markdown code fences — strip them
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var result classifyResult
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		slog.Warn("lead classifier json parse error", "raw", raw, "err", err)
		return nil
	}

	if !result.IsLead {
		return nil
	}

	summary := ""
	if result.Summary != nil {
		summary = *result.Summary
	}
	urgency := 1
	if result.Urgency != nil {
		urgency = *result.Urgency
	}

	var id uuid.UUID
	err = s.db.Pool.QueryRow(ctx, db.QueryUpsertLead, tenantID, userID, summary, urgency).Scan(&id)
	if err != nil {
		// ON CONFLICT DO NOTHING returns no row — not an error
		slog.Debug("lead upsert", "tenant_id", tenantID, "user_id", userID, "urgency", urgency)
	} else {
		slog.Info("lead detected", "lead_id", id, "urgency", urgency, "summary", summary)
	}

	return nil
}
