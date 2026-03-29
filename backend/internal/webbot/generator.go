package webbot

import (
	"context"
	"fmt"
	"strings"
)

// industryColors maps keyword → primary hex colour for the generated site.
var industryColors = map[string]string{
	"restaurant":  "#e53935",
	"cafe":        "#6d4c41",
	"food":        "#e53935",
	"healthcare":  "#1976d2",
	"medical":     "#1976d2",
	"fitness":     "#388e3c",
	"gym":         "#388e3c",
	"beauty":      "#e91e63",
	"salon":       "#e91e63",
	"retail":      "#7b1fa2",
	"fashion":     "#7b1fa2",
	"education":   "#0288d1",
	"tutor":       "#0288d1",
	"tech":        "#1a73e8",
	"software":    "#1a73e8",
	"realestate":  "#43a047",
	"property":    "#43a047",
	"legal":       "#37474f",
	"finance":     "#1565c0",
	"cleaning":    "#00acc1",
	"logistics":   "#f57c00",
	"photography": "#212121",
}

var industryKeywords = []string{
	"restaurant", "cafe", "food", "healthcare", "medical", "fitness", "gym",
	"beauty", "salon", "retail", "fashion", "education", "tutor", "tech",
	"software", "realestate", "property", "legal", "finance", "cleaning",
	"logistics", "photography",
}

// matchIndustry returns the first keyword found in s, or "business".
func matchIndustry(s string) string {
	s = strings.ToLower(s)
	for _, k := range industryKeywords {
		if strings.Contains(s, k) {
			return k
		}
	}
	return "business"
}

func getPrimaryColor(industry string) string {
	k := matchIndustry(industry)
	if c, ok := industryColors[k]; ok {
		return c
	}
	return "#1a73e8"
}

// getIndustryPhotos returns 3 Picsum seed strings: [hero, services, cta].
// Same industry → same photos every time (deterministic seed).
func getIndustryPhotos(industry string) []string {
	k := matchIndustry(industry)
	return []string{k + "-hero", k + "-services", k + "-cta"}
}

// photoURL builds a reliable Picsum Photos URL. No API key, no hotlinking restrictions.
func photoURL(seed string) string {
	return fmt.Sprintf("https://picsum.photos/seed/%s/1600/900", seed)
}

// basePrompt is the system + design-system portion of the generation prompt.
const basePrompt = `You are a senior product designer and frontend engineer.
Generate a COMPLETE, production-quality landing page in a SINGLE HTML file with embedded CSS.
Output MUST look like a premium modern website (Stripe / Linear / Framer quality) — NOT a generic AI template.

---

📐 STRUCTURE — follow this exact order, no deviations:

1. HERO — large benefit-driven headline, short paragraph, primary CTA button, full-width background image with dark overlay
2. SOCIAL PROOF — 3–5 trust indicators (stats, testimonials, or logos)
3. SERVICES — 3-card grid (title + short description per card)
4. ABOUT / WHY CHOOSE US — short paragraph + 2–3 bullet points
5. CTA BANNER — strong call-to-action + button
6. FOOTER — business name + minimal links/contact

---

🎨 DESIGN SYSTEM (STRICT):

- Font: Inter (Google Fonts) with system-ui fallback
- Max-width: 1200px, centered
- Spacing: 8px grid (8, 16, 24, 32, 48, 64, 80)
- Card border-radius: 12px | Button border-radius: 999px
- Shadows: 0 10px 30px rgba(0,0,0,0.08)
- Clean, minimal, generous whitespace

---

🎨 COLOR RULES (CRITICAL):

- Use ONLY the provided primary color + neutral palette (black, white, gray)
- Background: white or #f9fafb | Text: #111827
- NO random colors, NO multiple color schemes

---

🖼️ IMAGE RULES (CRITICAL):

- Use the EXACT image URLs provided — do not substitute or omit them
- Hero overlay: background-image: linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.6)), url('HERO_URL');
- All image sections: background-size: cover; background-position: center;
- Add background-color: #f5f5f5 as fallback on every image section

---

🔤 TYPOGRAPHY:

- H1: 48px, font-weight 700, line-height 1.2
- H2: 32px | Body: 16px, line-height 1.6
- Max 2 font weights
- Headlines MUST be benefit-driven ("Get More Customers" not "Welcome to our company")

---

✨ INTERACTIONS:

- Buttons: hover { filter: brightness(0.9); transform: scale(1.03); transition: 0.2s ease; }
- Cards: hover { transform: translateY(-4px); transition: 0.2s ease; }

---

📱 RESPONSIVE:

- Fully responsive required
- Mobile ≤768px: stacked layout, services → 1 column, readable typography

---

✍️ COPYWRITING:

- Concise and benefit-focused
- Avoid filler: "high quality", "best service", "we are passionate"
- Focus on outcomes: more customers, save time, grow faster

---

⚙️ TECHNICAL:

- Output FULL valid HTML from <!DOCTYPE html> to </html>
- Inline CSS only in <style> tags
- Google Fonts <link> tag is allowed — no other external CSS
- NO placeholder text | NO markdown | NO code fences | NO explanations
- MUST end with </html>

---

🚫 HARD CONSTRAINTS:

- Do NOT truncate output
- Do NOT output markdown or code fences
- Do NOT break HTML structure
- Do NOT use multiple color palettes
- Do NOT use placeholder image URLs — use ONLY the provided URLs`

// generateHTML calls Claude Haiku to produce a complete single-file website.
func (s *Service) generateHTML(ctx context.Context, spec *SiteSpec, logoDataURI string) (string, error) {
	photos := getIndustryPhotos(spec.Industry)
	heroURL     := photoURL(photos[0])
	servicesURL := photoURL(photos[1])
	ctaURL      := photoURL(photos[2])

	city := spec.City
	if city == "" {
		city = "our city"
	}

	inputData := fmt.Sprintf(`---

BUSINESS DETAILS:

Business name: %s
Industry: %s
Tagline: %s
Services: %s
Location: %s
Primary color: %s
Logo: <img src="%s" alt="%s logo" style="height:40px">
Contact button HTML: %s

IMAGES (use these exact URLs):
- Hero background: %s
- Services section: %s
- CTA background: %s`,
		spec.SiteName,
		spec.Industry,
		spec.Tagline,
		strings.Join(spec.Services, ", "),
		city,
		getPrimaryColor(spec.Industry),
		logoDataURI, spec.SiteName,
		buildContactButton(spec),
		heroURL, servicesURL, ctaURL)

	prompt := basePrompt + "\n\n" + inputData

	html, err := s.callClaude(ctx, prompt)
	if err != nil {
		return "", fmt.Errorf("claude html: %w", err)
	}

	// Validate completeness — retry once if truncated or too short.
	if !strings.Contains(html, "</html>") || len(html) < 3000 {
		html, err = s.callClaude(ctx, prompt)
		if err != nil {
			return "", fmt.Errorf("claude html retry: %w", err)
		}
	}

	return html, nil
}

func (s *Service) callClaude(ctx context.Context, prompt string) (string, error) {
	html, err := s.claude.Complete(ctx, prompt)
	if err != nil {
		return "", err
	}
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
