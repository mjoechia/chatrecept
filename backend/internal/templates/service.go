// Package templates manages WhatsApp message templates (Phase 2).
// This is a stub — full implementation in Phase 2.
//
// Features planned:
// - CRUD for tenant templates
// - Meta Template Manager API integration
// - Template approval status tracking
// - Auto-send templates when 24h window expires
package templates

import (
	"context"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/db"
)

type Template struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	TemplateName   string
	MetaTemplateID string
	Category       string
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

// List returns all templates for a tenant.
// TODO(phase2): implement.
func (s *Service) List(ctx context.Context, tenantID uuid.UUID) ([]Template, error) {
	return nil, nil
}

// Create registers a new template.
// TODO(phase2): implement + call Meta API to submit for approval.
func (s *Service) Create(ctx context.Context, t Template) error {
	return nil
}

// Delete removes a template.
// TODO(phase2): implement.
func (s *Service) Delete(ctx context.Context, tenantID, templateID uuid.UUID) error {
	return nil
}
