package tenants

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jc/pabot/internal/db"
)

type Tenant struct {
	ID                       uuid.UUID
	CompanyName              string
	WhatsappPhoneNumberID    string
	MetaBusinessID           string
	MetaAccessTokenEncrypted string
	WalletBalance            int
	PlanType                 string
	Status                   string
	SystemPrompt             string
	Language                 string // "en" or "zh" — controls AI provider routing
	CreatedAt                time.Time
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

func (s *Service) GetByPhoneNumberID(ctx context.Context, phoneNumberID string) (*Tenant, error) {
	row := s.db.Pool.QueryRow(ctx, db.QueryGetTenantByPhoneNumberID, phoneNumberID)
	return scanTenant(row)
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*Tenant, error) {
	row := s.db.Pool.QueryRow(ctx, db.QueryGetTenantByID, id)
	return scanTenant(row)
}

func scanTenant(row pgx.Row) (*Tenant, error) {
	t := &Tenant{}
	err := row.Scan(
		&t.ID,
		&t.CompanyName,
		&t.WhatsappPhoneNumberID,
		&t.MetaBusinessID,
		&t.MetaAccessTokenEncrypted,
		&t.WalletBalance,
		&t.PlanType,
		&t.Status,
		&t.SystemPrompt,
		&t.Language,
	)
	if err != nil {
		return nil, fmt.Errorf("scan tenant: %w", err)
	}
	return t, nil
}
