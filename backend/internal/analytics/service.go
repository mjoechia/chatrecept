// Package analytics implements per-tenant usage analytics (Phase 3).
// This is a stub — full implementation in Phase 3.
//
// Metrics planned:
// - Conversations per day/week/month
// - Average tokens per conversation
// - Cost per tenant
// - Lead conversion rate
// - AI response time (p50/p95)
// - Credit burn rate
package analytics

import (
	"context"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/db"
)

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// GetUsageSummary returns aggregated usage stats for a tenant.
// TODO(phase3): implement full analytics aggregation.
func (s *Service) GetUsageSummary(ctx context.Context, tenantID uuid.UUID) (map[string]interface{}, error) {
	// TODO(phase3): aggregate from messages, conversations, wallet_transactions
	return map[string]interface{}{
		"status": "analytics_not_implemented_yet",
	}, nil
}
