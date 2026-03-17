package webbot

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"strings"

	"github.com/jc/pabot/internal/db"
)

// claudeClient is the minimal interface we need from the AI package.
type claudeClient interface {
	Complete(ctx context.Context, prompt string) (string, error)
}

// Service orchestrates the full site-generation pipeline.
type Service struct {
	db             *db.DB
	claude         claudeClient
	togetherAPIKey string
	cfAccountID    string
	cfAPIToken     string
}

func NewService(database *db.DB, claude claudeClient, togetherAPIKey, cfAccountID, cfAPIToken string) *Service {
	return &Service{
		db:             database,
		claude:         claude,
		togetherAPIKey: togetherAPIKey,
		cfAccountID:    cfAccountID,
		cfAPIToken:     cfAPIToken,
	}
}

// GenerateSite runs the full pipeline: parse → logo → html → deploy.
// Returns the live URL and site ID.
func (s *Service) GenerateSite(ctx context.Context, siteID, description string) (siteURL string, err error) {
	slog.Info("webbot: generating site", "site_id", siteID)

	// 1. Parse description
	spec, err := s.parseDescription(ctx, description)
	if err != nil {
		return "", fmt.Errorf("parse: %w", err)
	}
	slog.Info("webbot: parsed spec", "name", spec.SiteName, "industry", spec.Industry)

	// 2. Generate logo
	logoBytes, err := s.generateLogo(ctx, buildLogoPrompt(spec))
	if err != nil {
		slog.Warn("webbot: logo generation failed, using placeholder", "err", err)
		logoBytes = nil
	}

	// Embed logo as data URI so the HTML is fully self-contained
	logoDataURI := ""
	if logoBytes != nil {
		logoDataURI = "data:image/png;base64," + base64.StdEncoding.EncodeToString(logoBytes)
	}
	slog.Info("webbot: logo ready", "has_logo", logoDataURI != "")

	// 3. Generate HTML
	html, err := s.generateHTML(ctx, spec, logoDataURI)
	if err != nil {
		return "", fmt.Errorf("html: %w", err)
	}

	// 4. Deploy to Cloudflare Pages (skip if CF creds not configured)
	if s.cfAccountID == "" || s.cfAPIToken == "" {
		slog.Warn("webbot: CF creds not set, skipping deploy")
		return "https://chatrecept.chat (CF not configured)", nil
	}

	projectName := slugify(spec.SiteName)
	if projectName == "" {
		projectName = "site-" + siteID[:8]
	}
	// Ensure uniqueness by appending short site ID suffix
	projectName = projectName + "-" + siteID[:6]
	projectName = strings.ToLower(projectName)

	siteURL, err = s.deploy(ctx, projectName, html)
	if err != nil {
		return "", fmt.Errorf("deploy: %w", err)
	}

	// 5. Persist results to DB
	if dbErr := s.saveSiteResult(ctx, siteID, spec, logoDataURI, html, projectName, siteURL); dbErr != nil {
		slog.Error("webbot: save site result failed", "err", dbErr)
		// Don't fail — site is live, just log
	}

	slog.Info("webbot: site live", "url", siteURL)
	return siteURL, nil
}

// GenerateSiteFromSpec is used by the 3-question mode where spec is already built.
func (s *Service) GenerateSiteFromSpec(ctx context.Context, siteID string, spec *SiteSpec) (string, error) {
	logoBytes, err := s.generateLogo(ctx, buildLogoPrompt(spec))
	if err != nil {
		slog.Warn("webbot: logo failed", "err", err)
	}

	logoDataURI := ""
	if logoBytes != nil {
		logoDataURI = "data:image/png;base64," + base64.StdEncoding.EncodeToString(logoBytes)
	}

	html, err := s.generateHTML(ctx, spec, logoDataURI)
	if err != nil {
		return "", err
	}

	if s.cfAccountID == "" || s.cfAPIToken == "" {
		slog.Warn("webbot: CF creds not set, skipping deploy")
		_ = s.saveSiteResult(ctx, siteID, spec, logoDataURI, html, "", "https://chatrecept.chat (CF not configured)")
		return "https://chatrecept.chat (CF not configured)", nil
	}

	projectName := slugify(spec.SiteName) + "-" + siteID[:6]
	siteURL, err := s.deploy(ctx, projectName, html)
	if err != nil {
		return "", err
	}

	_ = s.saveSiteResult(ctx, siteID, spec, logoDataURI, html, projectName, siteURL)
	return siteURL, nil
}

func (s *Service) saveSiteResult(ctx context.Context, siteID string, spec *SiteSpec, logoDataURI, html, projectName, siteURL string) error {
	_, err := s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sites SET
			site_name     = $2,
			industry      = $3,
			services      = $4,
			contact_type  = $5,
			contact_value = $6,
			style         = $7,
			logo_url      = $8,
			html          = $9,
			cf_project_name = $10,
			site_url      = $11,
			status        = 'live',
			updated_at    = now()
		WHERE id = $1`,
		siteID, spec.SiteName, spec.Industry, spec.Services,
		spec.ContactType, spec.ContactValue, spec.Style,
		logoDataURI, html, projectName, siteURL,
	)
	return err
}
