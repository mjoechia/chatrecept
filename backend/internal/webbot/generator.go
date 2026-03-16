package webbot

import (
	"context"
	"fmt"
	"strings"
)

// generateHTML calls Claude Haiku to produce a complete single-file website.
func (s *Service) generateHTML(ctx context.Context, spec *SiteSpec, logoDataURI string) (string, error) {
	services := strings.Join(spec.Services, ", ")

	contactButton := buildContactButton(spec)

	prompt := fmt.Sprintf(`Generate a complete, modern single-page HTML website. Return ONLY the HTML — no explanation, no markdown fences.

Business: %s
Industry: %s
Tagline: %s
Services: %s
Style: %s
Logo: %s (embed as <img src="%s"> in the header)

Requirements:
- Complete valid HTML5 with embedded CSS (no external dependencies except Google Fonts)
- Google Font: Inter
- Color scheme: derive 2 colors from the industry (professional, %s style)
- Sections in order: Header (logo + nav), Hero (name + tagline + CTA), About, Services (grid cards), Contact
- Contact button: %s
- Mobile responsive (flexbox/grid, no frameworks)
- Fast loading: inline all CSS, no JS except smooth scroll
- Under 200 lines total
- Nav links: About, Services, Contact (anchor links)
- Footer: © 2026 %s. All rights reserved.`,
		spec.SiteName, spec.Industry, spec.Tagline, services, spec.Style,
		logoDataURI, logoDataURI,
		spec.Style, contactButton, spec.SiteName)

	html, err := s.claude.Complete(ctx, prompt)
	if err != nil {
		return "", fmt.Errorf("claude html: %w", err)
	}

	// Strip any code fences
	html = strings.TrimSpace(html)
	html = strings.TrimPrefix(html, "```html")
	html = strings.TrimPrefix(html, "```")
	html = strings.TrimSuffix(html, "```")
	return strings.TrimSpace(html), nil
}

func buildContactButton(spec *SiteSpec) string {
	switch spec.ContactType {
	case "whatsapp":
		num := strings.ReplaceAll(spec.ContactValue, "+", "")
		num = strings.ReplaceAll(num, " ", "")
		return fmt.Sprintf(`<a href="https://wa.me/%s" class="btn">Chat WhatsApp</a>`, num)
	case "telegram":
		return fmt.Sprintf(`<a href="https://t.me/%s" class="btn">Message Telegram</a>`, spec.ContactValue)
	case "email":
		return fmt.Sprintf(`<a href="mailto:%s" class="btn">Send Email</a>`, spec.ContactValue)
	case "phone":
		return fmt.Sprintf(`<a href="tel:%s" class="btn">Call Now</a>`, spec.ContactValue)
	default:
		return `<a href="#contact" class="btn">Contact Us</a>`
	}
}
