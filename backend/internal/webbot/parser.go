package webbot

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// parseDescription calls Claude Haiku to extract structured site data from
// a free-text description. Returns a SiteSpec ready for HTML generation.
func (s *Service) parseDescription(ctx context.Context, description string) (*SiteSpec, error) {
	prompt := fmt.Sprintf(`Extract website information from this description and respond with JSON only.

Description: %s

Respond with this exact JSON structure (no markdown, no explanation):
{
  "site_name": "Business name",
  "industry": "one word industry (e.g. healthcare, food, retail, education)",
  "city": "city or location mentioned, or empty string if none",
  "services": ["service 1", "service 2", "service 3"],
  "style": "modern or minimal or bold or elegant",
  "contact_type": "whatsapp or telegram or email or phone",
  "contact_value": "the contact value (phone number, email, username)",
  "tagline": "a compelling one-line tagline for the business"
}

Rules:
- site_name: extract the actual business name
- industry: one word only
- city: extract city/location if mentioned, otherwise empty string
- services: maximum 4 items, each under 5 words
- style: infer from the description tone (default: modern)
- contact_type: detect from description (WhatsApp = whatsapp, etc). Default: whatsapp
- contact_value: extract the actual number/email/username mentioned, or leave empty string
- tagline: create a short punchy tagline based on the business`, description)

	resp, err := s.claude.Complete(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("claude parse: %w", err)
	}

	// Strip any markdown code fences if present
	cleaned := strings.TrimSpace(resp)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)

	var spec SiteSpec
	if err := json.Unmarshal([]byte(cleaned), &spec); err != nil {
		return nil, fmt.Errorf("parse json: %w (raw: %s)", err, cleaned)
	}

	if spec.Style == "" {
		spec.Style = "modern"
	}
	if spec.ContactType == "" {
		spec.ContactType = "whatsapp"
	}

	return &spec, nil
}

// buildLogoPrompt creates a Flux Schnell prompt for logo generation.
func buildLogoPrompt(spec *SiteSpec) string {
	return fmt.Sprintf(
		"minimal professional logo for %s %s business, clean white background, modern typography, simple icon, vector style, no text overlapping",
		spec.SiteName, spec.Industry,
	)
}
