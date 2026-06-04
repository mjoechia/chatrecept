// Package billing implements the monthly-message-cap model for the
// ChatRecept frontdesk bot (Phase 1).
//
// This is orthogonal to the existing wallet package, which is per-
// conversation-credit pricing for the WhatsApp conversation-window flow.
// Both live on the same tenants table but track different ledgers:
//
//   wallet: conversation credits, deducted once per 24h WhatsApp window
//   billing: monthly message count, capped by plan quota + topups
//
// Phase 1 of the frontdesk bot uses billing; the WhatsApp business
// conversation flow continues to use wallet. They never share state.
package billing

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jc/pabot/internal/db"
)

// ErrQuotaExceeded is returned by CheckMonthlyQuota when the tenant has
// hit (plan_quota + topup_credits) for the current month. Caller should
// reply to the end user with a soft-pause message and notify the owner.
var ErrQuotaExceeded = errors.New("billing: monthly quota exceeded")

// Service owns the monthly cap + top-up bookkeeping for tenants.
type Service struct {
	db *db.DB
}

// NewService returns a billing service bound to the existing pgx pool.
func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// UsageSnapshot is the per-tenant per-month state surfaced to dashboards
// and used by the webchat handler to decide whether to proceed.
type UsageSnapshot struct {
	MessageCount  int  // messages used this month
	TopupCredits  int  // extra credits bought this month (resets at month roll)
	PlanQuota     int  // tenant.monthly_message_quota
	EffectiveCap  int  // PlanQuota + TopupCredits
	OverQuota     bool // MessageCount >= EffectiveCap
}

// CurrentMonth returns the 'YYYY-MM' bucket key used everywhere in this
// package. UTC by convention so the month roll lines up with Supabase's
// timestamps. Exposed for tests + the cron job that aggregates yesterday.
func CurrentMonth() string {
	return time.Now().UTC().Format("2006-01")
}

// CurrentUsage reads the current-month snapshot for a tenant. Returns a
// zero-valued snapshot (plus the tenant's plan quota) if no row exists
// for this month yet — the row gets created lazily on first IncrementUsage
// or ApplyTopup call.
func (s *Service) CurrentUsage(ctx context.Context, tenantID uuid.UUID) (UsageSnapshot, error) {
	month := CurrentMonth()
	var snap UsageSnapshot
	err := s.db.Pool.QueryRow(ctx, db.QueryGetMonthlyUsage, tenantID, month).Scan(
		&snap.MessageCount, &snap.TopupCredits, &snap.PlanQuota,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		// Tenant doesn't exist. Surface a clear error rather than masking
		// as a zero snapshot.
		return UsageSnapshot{}, fmt.Errorf("billing: tenant not found: %s", tenantID)
	}
	if err != nil {
		return UsageSnapshot{}, fmt.Errorf("billing: read usage: %w", err)
	}
	snap.EffectiveCap = snap.PlanQuota + snap.TopupCredits
	snap.OverQuota = snap.MessageCount >= snap.EffectiveCap
	return snap, nil
}

// CheckMonthlyQuota returns nil when the tenant is under cap, or
// ErrQuotaExceeded when at/over. Side-effect free — does not deduct.
// Call before invoking the assistant to short-circuit when over.
func (s *Service) CheckMonthlyQuota(ctx context.Context, tenantID uuid.UUID) error {
	snap, err := s.CurrentUsage(ctx, tenantID)
	if err != nil {
		return err
	}
	if snap.OverQuota {
		return ErrQuotaExceeded
	}
	return nil
}

// IncrementUsage adds `delta` to this month's message_count. Typical
// callers pass 2 (one inbound + one outbound) per round trip. Returns
// the post-update count.
func (s *Service) IncrementUsage(ctx context.Context, tenantID uuid.UUID, delta int) (int, error) {
	if delta <= 0 {
		return 0, fmt.Errorf("billing: delta must be positive, got %d", delta)
	}
	var newCount int
	err := s.db.Pool.QueryRow(ctx, db.QueryIncrementMonthlyUsage,
		tenantID, CurrentMonth(), delta,
	).Scan(&newCount)
	if err != nil {
		return 0, fmt.Errorf("billing: increment usage: %w", err)
	}
	return newCount, nil
}

// ApplyTopup adds top-up credits to the tenant's current month. Called
// from the Stripe webhook after a successful purchase. Also writes a row
// in topup_transactions for audit — keyed off the Stripe payment id so
// duplicate webhook deliveries don't double-credit.
//
// Returns true if the credit was applied (first time we've seen this
// payment id), false if it was already processed.
func (s *Service) ApplyTopup(
	ctx context.Context,
	tenantID uuid.UUID,
	stripePaymentID string,
	amountSgd float64,
	credits int,
) (bool, error) {
	if credits <= 0 {
		return false, fmt.Errorf("billing: credits must be positive, got %d", credits)
	}

	// Insert the audit row first. If a duplicate webhook delivery hits us,
	// the UNIQUE(stripe_payment_id) constraint trips ON CONFLICT DO NOTHING
	// → RETURNING yields no rows → we skip the credit add.
	var auditID uuid.UUID
	err := s.db.Pool.QueryRow(ctx, db.QueryInsertTopupTransaction,
		tenantID, stripePaymentID, amountSgd, credits,
	).Scan(&auditID)
	if errors.Is(err, pgx.ErrNoRows) {
		// Already processed this Stripe payment — return idempotent success.
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("billing: insert topup audit: %w", err)
	}

	// Audit row was new → add the credits to this month's bucket.
	_, err = s.db.Pool.Exec(ctx, db.QueryApplyMonthlyTopup,
		tenantID, CurrentMonth(), credits,
	)
	if err != nil {
		// Audit row exists but credit add failed — this is a partial state
		// that'd cause the user to lose credits they paid for. Surface so
		// the operator can apply manually via admin tools. Slack alert
		// could be wired here in a future iteration.
		return false, fmt.Errorf("billing: apply topup credits (audit row %s exists, retry manually): %w", auditID, err)
	}
	return true, nil
}

// ApplyTopupByIDString is the string-based variant for code paths that
// have the tenant ID as a string (Stripe webhook metadata). Mirrors
// wallet.TopUpByIDString's shape.
func (s *Service) ApplyTopupByIDString(
	ctx context.Context,
	tenantIDStr, stripePaymentID string,
	amountSgd float64,
	credits int,
) (bool, error) {
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return false, fmt.Errorf("billing: invalid tenant id %q: %w", tenantIDStr, err)
	}
	return s.ApplyTopup(ctx, tenantID, stripePaymentID, amountSgd, credits)
}
