package wallet

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jc/pabot/internal/db"
)

var ErrInsufficientBalance = errors.New("wallet: insufficient balance")
var ErrDeductionFailed = errors.New("wallet: deduction failed (balance may have changed)")

type Service struct {
	db   *db.DB
	cost int // credits per conversation window
}

func NewService(database *db.DB, creditCost int) *Service {
	return &Service{db: database, cost: creditCost}
}

// HasBalance returns true if the tenant has at least one credit.
func (s *Service) HasBalance(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	var balance int
	err := s.db.Pool.QueryRow(ctx, db.QueryGetTenantBalance, tenantID).Scan(&balance)
	if err != nil {
		return false, fmt.Errorf("get balance: %w", err)
	}
	return balance >= s.cost, nil
}

// DeductCredit atomically deducts one conversation credit and logs the transaction.
// Returns ErrInsufficientBalance if balance is 0.
func (s *Service) DeductCredit(ctx context.Context, tenantID uuid.UUID, reason string, convID *uuid.UUID) error {
	var txID uuid.UUID
	err := s.db.Pool.QueryRow(ctx, db.QueryDeductCredit, tenantID, s.cost, reason, convID).Scan(&txID)
	if errors.Is(err, pgx.ErrNoRows) {
		// CTE WHERE EXISTS returned false → balance was insufficient
		return ErrInsufficientBalance
	}
	if err != nil {
		return fmt.Errorf("deduct credit: %w", err)
	}
	return nil
}

// TopUpByIDString is like TopUp but accepts a string tenant ID (used by Stripe webhook metadata).
func (s *Service) TopUpByIDString(ctx context.Context, tenantIDStr string, amount int, reason string) error {
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return fmt.Errorf("wallet: invalid tenant id string: %w", err)
	}
	return s.TopUp(ctx, tenantID, amount, reason)
}

// TopUp adds credits to a tenant's wallet (admin action).
func (s *Service) TopUp(ctx context.Context, tenantID uuid.UUID, amount int, reason string) error {
	if amount <= 0 {
		return errors.New("wallet: top-up amount must be positive")
	}
	var txID uuid.UUID
	err := s.db.Pool.QueryRow(ctx, db.QueryTopUpWallet, tenantID, amount, reason).Scan(&txID)
	if err != nil {
		return fmt.Errorf("top up wallet: %w", err)
	}
	return nil
}
