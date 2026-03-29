package webchat

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jc/pabot/internal/db"
	"github.com/jc/pabot/internal/middleware"
	"github.com/jc/pabot/internal/webbot"
)

// Handler serves POST /webchat/message and GET /webchat/session.
type Handler struct {
	store *Store
	svc   *webbot.Service
}

func NewHandler(database *db.DB, svc *webbot.Service) *Handler {
	return &Handler{store: &Store{db: database}, svc: svc}
}

// CORSMiddleware allows chatrecept.chat (and localhost) to call the webchat API.
func (h *Handler) CORSMiddleware(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"https://chatrecept.chat":  true,
		"http://localhost:3000":    true,
		"http://localhost:3001":    true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Session returns current state + last 20 messages. Used for polling during generation.
func (h *Handler) Session(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromClaims(r)
	if userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	sess, _ := h.store.getOrCreateSession(r.Context(), userID)
	msgs, _ := h.store.getMessages(r.Context(), userID, 20)
	if msgs == nil {
		msgs = []WebMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MessageResponse{
		State:    sess.State,
		Messages: msgs,
		Credits:  sess.CreditsRemaining,
	})
}

// Message handles an incoming text or __action__:* message from the user.
func (h *Handler) Message(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromClaims(r)
	if userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Text string `json:"text"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	text := strings.TrimSpace(body.Text)
	if text == "" {
		http.Error(w, "text required", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	sess, _ := h.store.getOrCreateSession(ctx, userID)

	// Persist user's typed messages; action tokens are not saved as chat history
	if !strings.HasPrefix(text, "__action__:") {
		_ = h.store.addMessage(ctx, userID, "user", text, nil)
	}

	h.route(ctx, userID, text, sess)

	// Re-fetch state and messages after routing
	sess, _ = h.store.getOrCreateSession(ctx, userID)
	msgs, _ := h.store.getMessages(ctx, userID, 20)
	if msgs == nil {
		msgs = []WebMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(MessageResponse{
		State:    sess.State,
		Messages: msgs,
		Credits:  sess.CreditsRemaining,
	})
}

// route dispatches to the correct handler based on the message text and session state.
func (h *Handler) route(ctx context.Context, userID, text string, sess *WebSession) {
	switch {
	case text == "__action__:start":
		h.store.resetSession(ctx, userID)
		h.sendWelcome(ctx, userID)

	case text == "__action__:mode1":
		h.store.setMode(ctx, userID, webbot.ModeOneQuestion)
		h.store.setState(ctx, userID, webbot.StateAwaitingDesc)
		_ = h.store.addMessage(ctx, userID, "bot",
			"Describe your business in one message — include your name, what you offer, your location (optional), and how customers can contact you (e.g. WhatsApp number, email).",
			nil)

	case text == "__action__:mode2":
		h.store.setMode(ctx, userID, webbot.ModeThreeQuestion)
		h.store.setState(ctx, userID, webbot.StateAwaitingName)
		_ = h.store.addMessage(ctx, userID, "bot", "What is your business name?", nil)

	case text == "__action__:new_site":
		h.store.resetSession(ctx, userID)
		h.sendWelcome(ctx, userID)

	case strings.HasPrefix(text, "__action__:contact_"):
		h.handleContactAction(ctx, userID, text)

	case sess.State == webbot.StateIdle:
		h.store.resetSession(ctx, userID)
		h.sendWelcome(ctx, userID)

	case sess.State == webbot.StateAwaitingDesc:
		h.handleDescription(ctx, userID, text)

	case sess.State == webbot.StateAwaitingName:
		h.store.setDraft(ctx, userID, "name", text)
		h.store.setState(ctx, userID, webbot.StateAwaitingServices)
		_ = h.store.addMessage(ctx, userID, "bot",
			"What services or products do you offer? (list up to 4, separated by commas)", nil)

	case sess.State == webbot.StateAwaitingServices:
		h.store.setDraft(ctx, userID, "services", text)
		h.store.setState(ctx, userID, webbot.StateAwaitingContact)
		_ = h.store.addMessage(ctx, userID, "bot",
			"How should customers contact you?",
			map[string]interface{}{
				"buttons": []Button{
					{Label: "💬 WhatsApp", Action: "__action__:contact_whatsapp"},
					{Label: "✈️ Telegram", Action: "__action__:contact_telegram"},
					{Label: "📧 Email", Action: "__action__:contact_email"},
					{Label: "📞 Phone", Action: "__action__:contact_phone"},
				},
			})

	case sess.State == webbot.StateGenerating:
		_ = h.store.addMessage(ctx, userID, "bot", "Still building your site... please wait ⏳", nil)
	}
}

func (h *Handler) sendWelcome(ctx context.Context, userID string) {
	_ = h.store.addMessage(ctx, userID, "bot",
		"👋 Welcome to ChatRecept WebBot! I'll build a beautiful website for your business in minutes. How would you like to start?",
		map[string]interface{}{
			"buttons": []Button{
				{Label: "⚡ Quick Description", Action: "__action__:mode1"},
				{Label: "📝 Step by Step", Action: "__action__:mode2"},
			},
		})
}

func (h *Handler) handleDescription(ctx context.Context, userID, description string) {
	if !h.store.tryDeductCredit(ctx, userID) {
		_ = h.store.addMessage(ctx, userID, "bot",
			"You've used all your free credits. Visit chatrecept.chat to get more!", nil)
		h.store.setState(ctx, userID, webbot.StateIdle)
		return
	}

	siteID, err := h.store.createSiteRecord(ctx, userID, &webbot.SiteSpec{
		SiteName:    "Generating...",
		ContactType: "whatsapp",
	})
	if err != nil {
		h.store.refundCredit(ctx, userID)
		_ = h.store.addMessage(ctx, userID, "bot", "Something went wrong. Please try again.", nil)
		return
	}

	h.store.setCurrentSite(ctx, userID, siteID)
	h.store.setState(ctx, userID, webbot.StateGenerating)
	_ = h.store.addMessage(ctx, userID, "bot", "Building your site... ⏳ This takes about 20 seconds.", nil)

	go func() {
		siteURL, err := h.svc.GenerateSite(context.Background(), siteID, description)
		if err != nil {
			h.store.refundCredit(context.Background(), userID)
			h.store.setState(context.Background(), userID, webbot.StateIdle)
			_ = h.store.addMessage(context.Background(), userID, "bot",
				"Sorry, generation failed. Your credit has been refunded. Please try again.", nil)
			return
		}
		h.store.setState(context.Background(), userID, webbot.StateIdle)
		_ = h.store.addMessage(context.Background(), userID, "bot",
			"🎉 Your site is ready!",
			map[string]interface{}{
				"site_url": siteURL,
				"buttons":  []Button{{Label: "🆕 Build another site", Action: "__action__:new_site"}},
			})
	}()
}

func (h *Handler) handleContactAction(ctx context.Context, userID, text string) {
	contactType := strings.TrimPrefix(text, "__action__:contact_")

	sess, _ := h.store.getOrCreateSession(ctx, userID)
	name := sess.Draft["name"]
	if name == "" {
		name = "My Business"
	}

	spec := &webbot.SiteSpec{
		SiteName:    name,
		Services:    strings.Split(sess.Draft["services"], ","),
		ContactType: contactType,
		Style:       "modern",
	}

	if !h.store.tryDeductCredit(ctx, userID) {
		_ = h.store.addMessage(ctx, userID, "bot",
			"You've used all your free credits. Visit chatrecept.chat to get more!", nil)
		h.store.setState(ctx, userID, webbot.StateIdle)
		return
	}

	siteID, err := h.store.createSiteRecord(ctx, userID, spec)
	if err != nil {
		h.store.refundCredit(ctx, userID)
		_ = h.store.addMessage(ctx, userID, "bot", "Something went wrong. Please try again.", nil)
		return
	}

	h.store.setCurrentSite(ctx, userID, siteID)
	h.store.setState(ctx, userID, webbot.StateGenerating)
	_ = h.store.addMessage(ctx, userID, "bot", "Building your site... ⏳ This takes about 20 seconds.", nil)

	go func() {
		siteURL, err := h.svc.GenerateSiteFromSpec(context.Background(), siteID, spec)
		if err != nil {
			h.store.refundCredit(context.Background(), userID)
			h.store.setState(context.Background(), userID, webbot.StateIdle)
			_ = h.store.addMessage(context.Background(), userID, "bot",
				"Sorry, generation failed. Your credit has been refunded. Please try again.", nil)
			return
		}
		h.store.setState(context.Background(), userID, webbot.StateIdle)
		_ = h.store.addMessage(context.Background(), userID, "bot",
			"🎉 Your site is ready!",
			map[string]interface{}{
				"site_url": siteURL,
				"buttons":  []Button{{Label: "🆕 Build another site", Action: "__action__:new_site"}},
			})
	}()
}
