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
