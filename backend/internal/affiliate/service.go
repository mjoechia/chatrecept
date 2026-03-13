// Package affiliate handles the 2-level referral credit programme.
//
// Rules (from jcpayment.md):
//   - L1 earner: the tenant who directly referred the payer → 20% of top-up credits
//   - L2 earner: who referred the L1 earner → 10% of top-up credits
//   - Commission base: top-up credits only (not subscription)
//   - Monthly cap: 500 credits per affiliate per calendar month
//   - Payouts: wallet credit top-ups only, never cash
//   - Admin can remove credits with reason; removal is logged, never deleted
package affiliate

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jc/pabot/internal/db"
)

const (
	rateL1       = 0.20 // 20% to direct referrer
	rateL2       = 0.10 // 10% to referrer's referrer
	monthlyCap   = 500  // max affiliate credits issued per affiliate per month
)

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// IssueCreditsForTopUp is called after a confirmed top-up.
// It finds the L1 and L2 referrers of sourceTenantID and issues affiliate
// credits to each, atomically topping up their wallet.
func (s *Service) IssueCreditsForTopUp(ctx context.Context, sourceTenantID uuid.UUID, topupCredits int) {
	if topupCredits <= 0 {
		return
	}

	// Find L1 referrer (who directly referred sourceTenant)
	l1ID, err := s.findReferrer(ctx, sourceTenantID)
	if err != nil || l1ID == uuid.Nil {
		return // no referrer — not a referred tenant
	}

	s.tryIssue(ctx, l1ID, sourceTenantID, topupCredits, 1, rateL1)

	// Find L2 referrer (who referred the L1 referrer)
	l2ID, err := s.findReferrer(ctx, l1ID)
	if err != nil || l2ID == uuid.Nil {
		return
	}

	s.tryIssue(ctx, l2ID, sourceTenantID, topupCredits, 2, rateL2)
}

// tryIssue attempts to issue affiliate credits to one referrer.
// Logs and skips silently on any error so webhook processing is never blocked.
func (s *Service) tryIssue(ctx context.Context, affiliateID, sourceID uuid.UUID, topupCredits, level int, rate float64) {
	creditAmount := int(float64(topupCredits) * rate)
	if creditAmount <= 0 {
		return
	}

	// Monthly cap check
	used, err := s.monthlyCreditsIssued(ctx, affiliateID)
	if err != nil {
		slog.Error("affiliate: monthly cap check failed", "affiliate", affiliateID, "err", err)
		return
	}
	if used+creditAmount > monthlyCap {
		remaining := monthlyCap - used
		if remaining <= 0 {
			slog.Info("affiliate: monthly cap reached", "affiliate", affiliateID)
			return
		}
		creditAmount = remaining // partial issue up to cap
	}

	// Circular referral guard: affiliateID must not be the source
	if affiliateID == sourceID {
		slog.Warn("affiliate: self-referral blocked", "affiliate", affiliateID)
		return
	}

	walletTxID, err := s.issueCredit(ctx, affiliateID, sourceID, level, topupCredits, rate, creditAmount)
	if err != nil {
		slog.Error("affiliate: issue failed", "affiliate", affiliateID, "level", level, "err", err)
		return
	}

	slog.Info("affiliate: credit issued",
		"affiliate", affiliateID,
		"source", sourceID,
		"level", level,
		"credits", creditAmount,
		"wallet_tx", walletTxID,
	)
}

// findReferrer returns the referrer of tenantID, or uuid.Nil if none.
func (s *Service) findReferrer(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	var referrerID uuid.UUID
	err := s.db.Pool.QueryRow(ctx, db.QueryGetReferrer, tenantID).Scan(&referrerID)
	if err == pgx.ErrNoRows {
		return uuid.Nil, nil
	}
	return referrerID, err
}

// monthlyCreditsIssued returns total credits issued to affiliateID this calendar month.
func (s *Service) monthlyCreditsIssued(ctx context.Context, affiliateID uuid.UUID) (int, error) {
	var total int
	err := s.db.Pool.QueryRow(ctx, db.QueryMonthlyAffiliateCredits, affiliateID).Scan(&total)
	if err != nil && err != pgx.ErrNoRows {
		return 0, err
	}
	return total, nil
}

// issueCredit atomically tops up the affiliate's wallet and records the ledger entry.
func (s *Service) issueCredit(ctx context.Context, affiliateID, sourceID uuid.UUID, level, topupCredits int, rate float64, creditAmount int) (uuid.UUID, error) {
	// First top up the wallet and get the wallet_transaction id
	var walletTxID uuid.UUID
	err := s.db.Pool.QueryRow(ctx, db.QueryTopUpWallet, affiliateID, creditAmount, fmt.Sprintf("affiliate_l%d", level)).Scan(&walletTxID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("wallet top-up: %w", err)
	}

	// Then record in the affiliate ledger
	var creditID uuid.UUID
	err = s.db.Pool.QueryRow(ctx, db.QueryInsertAffiliateCredit,
		affiliateID, sourceID, walletTxID, level, topupCredits, rate, creditAmount,
	).Scan(&creditID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("affiliate credit insert: %w", err)
	}

	return walletTxID, nil
}

// RemoveCredit is an admin action that reverses a credit entry.
// The row is never deleted — status is set to 'removed' and audit_log is appended.
func (s *Service) RemoveCredit(ctx context.Context, creditID, adminID uuid.UUID, reason string) error {
	// Load current state
	var affiliateID uuid.UUID
	var creditAmount int
	var status string
	err := s.db.Pool.QueryRow(ctx, db.QueryGetAffiliateCredit, creditID).Scan(&affiliateID, &creditAmount, &status)
	if err == pgx.ErrNoRows {
		return fmt.Errorf("affiliate credit %s not found", creditID)
	}
	if err != nil {
		return fmt.Errorf("get affiliate credit: %w", err)
	}
	if status == "removed" {
		return fmt.Errorf("credit %s already removed", creditID)
	}

	// Build audit event
	event := map[string]any{
		"action":     "removed",
		"by":         adminID.String(),
		"reason":     reason,
		"removed_at": time.Now().UTC().Format(time.RFC3339),
	}
	eventJSON, _ := json.Marshal(event)

	// Atomically deduct from wallet and mark as removed
	_, err = s.db.Pool.Exec(ctx, db.QueryRemoveAffiliateCredit,
		creditID, adminID, reason, string(eventJSON), affiliateID, creditAmount,
	)
	if err != nil {
		return fmt.Errorf("remove affiliate credit: %w", err)
	}

	slog.Info("affiliate: credit removed by admin",
		"credit", creditID,
		"affiliate", affiliateID,
		"admin", adminID,
		"reason", reason,
	)
	return nil
}

// SetReferral records that referee was referred by referrer.
// Returns an error if referee already has a referrer or if it would be circular.
func (s *Service) SetReferral(ctx context.Context, referrerID, refereeID uuid.UUID) error {
	if referrerID == refereeID {
		return fmt.Errorf("self-referral not allowed")
	}

	// Circular check: referrerID must not be referred by refereeID
	existingReferrer, _ := s.findReferrer(ctx, referrerID)
	if existingReferrer == refereeID {
		return fmt.Errorf("circular referral not allowed")
	}

	_, err := s.db.Pool.Exec(ctx, db.QueryInsertReferral, referrerID, refereeID)
	if err != nil {
		return fmt.Errorf("set referral: %w", err)
	}
	return nil
}

// GetStats returns affiliate summary for a tenant's dashboard.
func (s *Service) GetStats(ctx context.Context, affiliateID uuid.UUID) (*Stats, error) {
	stats := &Stats{AffiliateID: affiliateID}

	// Referral count
	err := s.db.Pool.QueryRow(ctx, db.QueryAffiliateReferralCount, affiliateID).Scan(&stats.ReferralCount)
	if err != nil {
		return nil, fmt.Errorf("referral count: %w", err)
	}

	// Credits this month + lifetime
	err = s.db.Pool.QueryRow(ctx, db.QueryAffiliateCreditsTotal, affiliateID).Scan(
		&stats.CreditsThisMonth, &stats.CreditsLifetime,
	)
	if err != nil && err != pgx.ErrNoRows {
		return nil, fmt.Errorf("credits total: %w", err)
	}

	stats.ReferralLink = fmt.Sprintf("https://chatrecept.chat/join?ref=%s", affiliateID)
	return stats, nil
}

type Stats struct {
	AffiliateID      uuid.UUID `json:"affiliate_id"`
	ReferralLink     string    `json:"referral_link"`
	ReferralCount    int       `json:"referral_count"`
	CreditsThisMonth int       `json:"credits_this_month"`
	CreditsLifetime  int       `json:"credits_lifetime"`
}
