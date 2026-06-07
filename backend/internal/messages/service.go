package messages

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/db"
)

type Record struct {
	TenantID       uuid.UUID
	ConversationID uuid.UUID
	Sender         string // "customer" | "bot" | "system"
	Content        string
	TokenInput     int
	TokenOutput    int
	ModelUsed      string
	EstimatedCost  float64
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// Store persists a message record. Returns the new message ID.
func (s *Service) Store(ctx context.Context, r Record) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.db.Pool.QueryRow(ctx, db.QueryInsertMessage,
		r.TenantID,
		r.ConversationID,
		r.Sender,
		r.Content,
		r.TokenInput,
		r.TokenOutput,
		r.ModelUsed,
		r.EstimatedCost,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("store message: %w", err)
	}
	return id, nil
}

// StoreEscalated persists a message and marks it as part of an unresolved
// escalation. Used by the frontdesk handler when confidence < threshold:
// both the user's question and the bot's holding reply are flagged so the
// daily report can surface them to the owner.
func (s *Service) StoreEscalated(ctx context.Context, tenantID, conversationID uuid.UUID, sender, content string) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.db.Pool.QueryRow(ctx, db.QueryInsertEscalatedMessage,
		tenantID, conversationID, sender, content,
	).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("store escalated message: %w", err)
	}
	return id, nil
}
