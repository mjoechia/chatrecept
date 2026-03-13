// Package assistant implements personal assistant mode (Phase 3).
// This is a stub — full implementation in Phase 3.
//
// Features planned:
// - Daily summary generation per tenant (cron job)
// - Reflection insights extraction
// - Unresolved item detection
// - Cron scheduled per tenant timezone
// - 1 credit deducted per daily summary
package assistant

import (
	"context"

	"github.com/google/uuid"
)

type Service struct{}

func NewService() *Service {
	return &Service{}
}

// GenerateDailySummary generates a daily conversation summary for a tenant.
// TODO(phase3): implement cron scheduling, Claude summarization, credit deduction.
func (s *Service) GenerateDailySummary(ctx context.Context, tenantID uuid.UUID) error {
	// TODO(phase3):
	// 1. Fetch yesterday's conversations for tenant
	// 2. Build summary prompt
	// 3. Call Claude to generate summary
	// 4. Store summary
	// 5. Deduct 1 credit
	// 6. Send summary via WhatsApp if enabled
	return nil
}
