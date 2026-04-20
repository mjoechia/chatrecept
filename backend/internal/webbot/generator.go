package webbot

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"
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

const promptVersion = "v2_tailwind_gemini_strict"

const basePromptTailwind = `You are an expert frontend developer.

Generate a COMPLETE, production-ready HTML landing page.

STRICT RULES (MUST FOLLOW):
- Output ONLY valid HTML (no markdown, no explanations, no code fences)
- MUST start with <!DOCTYPE html>
- MUST end with </html>
- Include <head> and <body>
- All tags must be properly closed

TECH STACK:
- Tailwind CSS via CDN in <head>: <script src="https://cdn.tailwindcss.com"></script>
- Google Fonts <link> tag allowed
- Use ONLY Tailwind utility classes (no <style> blocks, no inline style= except for background images)
- Mobile-first responsive (sm:, md:, lg: prefixes)

LAYOUT STRUCTURE (REQUIRED ORDER):
1. Hero Section — headline, subtext, CTA button, full-width background image
2. Social Proof — 3–5 trust indicators (stats, testimonials, or logos)
3. Services / Features — 3-card grid
4. About / Why Choose Us — short paragraph + 2–3 bullets
5. CTA Banner — strong call-to-action + button
6. Footer — business name + contact

DESIGN RULES:
- Max width: max-w-7xl mx-auto px-4
- Cards: rounded-xl shadow-lg
- Buttons: rounded-full
- Consistent spacing: py-12 or py-16 between sections, gap-6 in grids
- Typography: text-4xl font-bold for H1, text-3xl for H2, text-base leading-relaxed for body
- Headlines MUST be benefit-driven ("Get More Customers" not "Welcome to Our Company")
- Follow the THEME instructions below strictly for colors, spacing, and typography

INTERACTIONS:
- Buttons: hover:brightness-90 hover:scale-[1.03] transition-all duration-200
- Cards: hover:shadow-xl hover:-translate-y-1 transition duration-200

IMAGES:
- Use the EXACT image URLs provided — do NOT substitute or omit them
- Hero: style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.6)), url('HERO_URL'); background-size: cover; background-position: center;"
- Add bg-gray-200 as fallback class on every image section

CONTENT:
- Use provided business details to generate realistic, specific content
- NO placeholder text or Lorem Ipsum
- Focus on outcomes: more customers, save time, grow faster
- Avoid filler phrases: "high quality", "best service", "we are passionate"

FAILSAFE:
- Even if unsure, output a complete working HTML page
- Never truncate — ensure output ends with </html>`

// getThemePrompt returns a theme-specific instruction block injected into the prompt.
func (s *Service) getThemePrompt() string {
	switch s.theme {
	case ThemeLuxury:
		return "\nTHEME: LUXURY\n- Elegant, premium design\n- Color palette: black, gold (#b8973a), neutral tones\n- Refined typography (tracking-wide, uppercase headings)\n- Large hero sections, strong imagery\n- Generous whitespace\n- Buttons: subtle border + hover fill\n- Avoid bright colors\n"
	case ThemeMinimal:
		return "\nTHEME: MINIMAL\n- Extremely clean and simple layout\n- Maximum whitespace\n- Color palette: black, white, gray only\n- Nearly flat, minimal borders and shadows\n- Typography-focused, reduce visual clutter\n- Fewer visual elements, tighter content\n"
	case ThemeBold:
		return "\nTHEME: BOLD\n- High contrast colors\n- Strong visual hierarchy\n- Large headings (text-5xl or bigger)\n- Use gradients and accent colors\n- Buttons must stand out strongly\n- Dynamic, energetic layout\n"
	default: // ThemeModern
		return "\nTHEME: MODERN\n- Clean startup-style UI\n- Soft shadows and rounded corners\n- Balanced color palette (blues, neutrals)\n- Friendly and professional\n- Standard SaaS-style layout\n"
	}
}

// stripMarkdownFences removes any markdown code fences the model may have added.
func stripMarkdownFences(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```html")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

// isValidHTML checks that the output is a complete HTML document.
func isValidHTML(s string) bool {
	return len(s) > 2000 &&
		strings.Contains(s, "<html") &&
		strings.Contains(s, "</html>") &&
		strings.Contains(s, "<body") &&
		strings.Contains(s, "</body>")
}

// generateHTML calls the configured HTML generator (Gemini 2.5 Flash or Claude fallback)
// to produce a complete single-file website.
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

	const maxInputDataChars = 2000
	if len(inputData) > maxInputDataChars {
		inputData = inputData[:maxInputDataChars]
	}

	activeBase := basePrompt
	if s.useTailwind {
		activeBase = basePromptTailwind
	}
	prompt := activeBase + s.getThemePrompt() + "\n\n" + inputData

	html, err := s.callHTMLGen(ctx, prompt)
	if err != nil {
		return "", fmt.Errorf("html gen: %w", err)
	}
	return html, nil
}

// callHTMLGen calls the HTML generator with timeout, observability, retry,
// and runtime Claude fallback if Gemini fails.
func (s *Service) callHTMLGen(ctx context.Context, prompt string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()

	start := time.Now()
	html, err := s.htmlGen.Complete(ctx, prompt)
	duration := time.Since(start)

	if err != nil {
		slog.Error("webbot: htmlGen primary failed",
			"prompt_version", promptVersion,
			"duration_ms", duration.Milliseconds(),
			"err", err,
		)
		// Runtime fallback to Claude
		if s.htmlGen != s.claude {
			slog.Warn("webbot: falling back to Claude for HTML generation")
			return s.claude.Complete(ctx, prompt)
		}
		return "", err
	}

	cleaned := stripMarkdownFences(html)

	if !isValidHTML(cleaned) {
		slog.Warn("webbot: invalid HTML on first attempt, retrying",
			"prompt_version", promptVersion,
		)
		retryPrompt := prompt + "\n\n[IMPORTANT: Your previous response was not valid HTML. Output ONLY valid HTML from <!DOCTYPE html> to </html>. No explanations, no code fences.]"
		retryHTML, retryErr := s.htmlGen.Complete(ctx, retryPrompt)
		if retryErr == nil {
			retryClean := stripMarkdownFences(retryHTML)
			if isValidHTML(retryClean) {
				slog.Info("webbot: retry succeeded", "prompt_version", promptVersion)
				return retryClean, nil
			}
		}
		// Retry failed — fallback to Claude
		if s.htmlGen != s.claude {
			slog.Warn("webbot: retry failed, falling back to Claude")
			return s.claude.Complete(ctx, prompt)
		}
		return "", fmt.Errorf("html generation produced invalid output after retry")
	}

	slog.Info("webbot: html generation success",
		"prompt_version", promptVersion,
		"theme", s.theme,
		"use_tailwind", s.useTailwind,
		"duration_ms", duration.Milliseconds(),
		"output_length", len(cleaned),
	)
	return cleaned, nil
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
