package webbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
)

// TelegramHandler handles incoming Telegram webhook updates.
type TelegramHandler struct {
	svc         *Service
	botToken    string
	secretToken string // X-Telegram-Bot-Api-Secret-Token value
}

func NewTelegramHandler(svc *Service, botToken, secretToken string) *TelegramHandler {
	h := &TelegramHandler{svc: svc, botToken: botToken, secretToken: secretToken}
	go h.registerCommands()
	return h
}

// HandleSetup can be hit in a browser to register commands and see the raw
// Telegram API responses — useful for debugging.
func (h *TelegramHandler) HandleSetup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	orig := h.botToken
	_ = orig // ensure we use the real token
	h.registerCommands()
	fmt.Fprintln(w, "setup called — check Railway logs for Telegram API responses")
}

// registerCommands sets the bot's command list and enables the persistent menu
// button so /start is always one tap away without typing.
func (h *TelegramHandler) registerCommands() {
	h.telegramPost("setMyCommands", map[string]interface{}{
		"commands": []map[string]string{
			{"command": "start", "description": "Build a new website"},
			{"command": "new", "description": "Start over with a new site"},
		},
	})
	// setChatMenuButton (no chat_id = global default) makes the menu icon
	// visible next to the text input; type "commands" opens the command list.
	h.telegramPost("setChatMenuButton", map[string]interface{}{
		"menu_button": map[string]string{"type": "commands"},
	})
}

// Update is the minimal Telegram Update structure we care about.
type Update struct {
	UpdateID      int64          `json:"update_id"`
	Message       *TGMessage     `json:"message"`
	CallbackQuery *CallbackQuery `json:"callback_query"`
}

type TGMessage struct {
	MessageID int64  `json:"message_id"`
	Chat      TGChat `json:"chat"`
	From      TGUser `json:"from"`
	Text      string `json:"text"`
}

type TGChat struct {
	ID int64 `json:"id"`
}

type TGUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

type CallbackQuery struct {
	ID      string     `json:"id"`
	From    TGUser     `json:"from"`
	Message *TGMessage `json:"message"`
	Data    string     `json:"data"`
}

// ServeHTTP is the webhook endpoint.
func (h *TelegramHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Verify secret token
	if h.secretToken != "" && r.Header.Get("X-Telegram-Bot-Api-Secret-Token") != h.secretToken {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var update Update
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Process asynchronously so Telegram gets 200 immediately
	go h.handle(context.Background(), &update)
	w.WriteHeader(http.StatusOK)
}

func (h *TelegramHandler) handle(ctx context.Context, u *Update) {
	if u.CallbackQuery != nil {
		h.handleCallback(ctx, u.CallbackQuery)
		return
	}
	if u.Message == nil || u.Message.Text == "" {
		return
	}
	h.handleMessage(ctx, u.Message)
}

func (h *TelegramHandler) handleMessage(ctx context.Context, msg *TGMessage) {
	userID := msg.From.ID
	chatID := msg.Chat.ID
	text := strings.TrimSpace(msg.Text)

	session, err := h.svc.getOrCreateSession(ctx, userID, chatID)
	if err != nil {
		slog.Error("webbot: get session", "err", err)
		return
	}

	switch {
	case text == "/start":
		h.svc.resetSession(ctx, userID)
		// Set menu button for this specific chat so it appears even in existing chats.
		go h.telegramPost("setChatMenuButton", map[string]interface{}{
			"chat_id":     chatID,
			"menu_button": map[string]string{"type": "commands"},
		})
		h.sendModeSelect(chatID, userID)

	case text == "/new", text == "🚀 New Site":
		h.svc.resetSession(ctx, userID)
		h.sendModeSelect(chatID, userID)

	case session.State == StateIdle && text != "":
		// Mode 1: treat first message as full description
		h.startGeneration(ctx, session, text)

	case session.State == StateAwaitingDesc:
		h.startGeneration(ctx, session, text)

	case session.State == StateAwaitingName:
		h.svc.setDraft(ctx, userID, "name", text)
		h.svc.setState(ctx, userID, StateAwaitingServices)
		h.sendText(chatID, "What do you offer?")

	case session.State == StateAwaitingServices:
		h.svc.setDraft(ctx, userID, "services", text)
		h.svc.setState(ctx, userID, StateAwaitingContact)
		h.sendContactButtons(chatID)

	case session.State == StateGenerating:
		h.sendText(chatID, "Building your site... please wait.")
	}
}

func (h *TelegramHandler) handleCallback(ctx context.Context, cb *CallbackQuery) {
	userID := cb.From.ID
	chatID := cb.Message.Chat.ID
	data := cb.Data

	h.answerCallback(cb.ID)

	session, _ := h.svc.getOrCreateSession(ctx, userID, chatID)

	switch {
	case data == "mode1":
		h.svc.setMode(ctx, userID, ModeOneQuestion)
		h.svc.setState(ctx, userID, StateAwaitingDesc)
		h.sendText(chatID, "Describe your website.\n\nExample: A modern website for Yancy Healthhub selling health equipment. Contact via WhatsApp +6512345678.")

	case data == "mode2":
		h.svc.setMode(ctx, userID, ModeThreeQuestion)
		h.svc.setState(ctx, userID, StateAwaitingName)
		h.sendText(chatID, "Website name?")

	case data == "contact_whatsapp", data == "contact_telegram", data == "contact_email", data == "contact_phone":
		contactType := strings.TrimPrefix(data, "contact_")
		h.svc.setDraft(ctx, userID, "contact_type", contactType)
		h.svc.setState(ctx, userID, StateGenerating)

		draft := session.Draft
		draft["contact_type"] = contactType

		spec := &SiteSpec{
			SiteName:    draft["name"],
			Services:    strings.Split(draft["services"], ","),
			ContactType: contactType,
			Style:       "modern",
		}
		for i, svc := range spec.Services {
			spec.Services[i] = strings.TrimSpace(svc)
		}

		ok, _ := h.svc.tryDeductCredit(ctx, userID)
		if !ok {
			h.svc.setState(ctx, userID, StateIdle)
			h.sendNoCredits(chatID)
			return
		}

		siteID, _ := h.svc.createSiteRecord(ctx, userID, spec)
		h.sendText(chatID, "Building your site...")

		go func() {
			siteURL, err := h.svc.GenerateSiteFromSpec(ctx, siteID, spec)
			if err != nil {
				slog.Error("webbot: generate from spec", "err", err)
				h.svc.refundCredit(ctx, userID)
				h.sendText(chatID, "Something went wrong generating your site. Please try again with /new")
				h.svc.setState(ctx, userID, StateIdle)
				return
			}
			h.svc.setState(ctx, userID, StateIdle)
			h.svc.setCurrentSite(ctx, userID, siteID)
			h.sendSiteReady(chatID, siteURL)
		}()

	case data == "edit_text", data == "change_style", data == "add_page":
		site, _ := h.svc.getSite(ctx, session.CurrentSiteID)
		if site == nil {
			h.sendText(chatID, "No active site found. Use /new to start.")
			return
		}
		if site.EditCount >= site.MaxEdits {
			h.sendEditLimitReached(chatID)
			return
		}
		editPrompts := map[string]string{
			"edit_text":    "What text would you like to change?",
			"change_style": "Choose a style: modern, minimal, bold, or elegant",
			"add_page":     "Describe the new section to add.",
		}
		h.svc.setDraft(ctx, userID, "pending_edit", data)
		h.svc.setState(ctx, userID, StateAwaitingDesc)
		h.sendText(chatID, editPrompts[data])

	case data == "publish":
		site, _ := h.svc.getSite(ctx, session.CurrentSiteID)
		if site != nil && site.SiteURL != "" {
			h.sendText(chatID, fmt.Sprintf("Your site is live! Share this link:\n\n%s", site.SiteURL))
		} else {
			h.sendText(chatID, "Your site is already live! Share the URL with your customers.")
		}

	case data == "new_site":
		h.svc.resetSession(ctx, userID)
		h.sendModeSelect(chatID, userID)
	}
}

func (h *TelegramHandler) startGeneration(ctx context.Context, session *Session, description string) {
	chatID := session.TelegramChatID
	userID := session.TelegramUserID

	// Atomically reserve a credit before doing any work.
	ok, _ := h.svc.tryDeductCredit(ctx, userID)
	if !ok {
		h.sendNoCredits(chatID)
		return
	}

	h.svc.setState(ctx, userID, StateGenerating)
	h.sendText(chatID, "Building your site... ⚡")

	go func() {
		siteID, err := h.svc.createSiteRecordFromDescription(ctx, userID, description)
		if err != nil {
			slog.Error("webbot: create site record", "err", err)
			h.svc.refundCredit(ctx, userID)
			h.sendText(chatID, "Something went wrong. Please try again with /new")
			h.svc.setState(ctx, userID, StateIdle)
			return
		}

		siteURL, err := h.svc.GenerateSite(ctx, siteID, description)
		if err != nil {
			slog.Error("webbot: generate site", "err", err)
			h.svc.refundCredit(ctx, userID)
			h.sendText(chatID, "Something went wrong generating your site. Please try again with /new")
			h.svc.setState(ctx, userID, StateIdle)
			return
		}

		h.svc.setState(ctx, userID, StateIdle)
		h.svc.setCurrentSite(ctx, userID, siteID)
		h.sendSiteReady(chatID, siteURL)
	}()
}

// ── Telegram API helpers ───────────────────────────────────────────────────────

func (h *TelegramHandler) sendText(chatID int64, text string) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	})
}

func (h *TelegramHandler) sendNoCredits(chatID int64) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id":    chatID,
		"parse_mode": "HTML",
		"text": "You've used all your free site credits.\n\n" +
			"Register at <a href=\"https://chatrecept.chat/\">chatrecept.chat</a> to get more free credits!",
	})
}

func (h *TelegramHandler) sendModeSelect(chatID, userID int64) {
	credits, _ := h.svc.getCredits(context.Background(), userID)
	creditLine := fmt.Sprintf("You have %d site credit(s) remaining.\nEach credit = 1 website. Edits are free (up to 3/site).\n\n", credits)
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    creditLine + "How do you want to describe your site?",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{
					{"text": "Quick Mode", "callback_data": "mode1"},
					{"text": "Step Mode", "callback_data": "mode2"},
				},
			},
		},
	})
	// Also send a persistent reply keyboard so the user always has a
	// one-tap "🚀 New Site" button visible below the text input.
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    "Tap the button below any time to build a new site.",
		"reply_markup": map[string]interface{}{
			"keyboard":        [][]map[string]string{{{"text": "🚀 New Site"}}},
			"resize_keyboard": true,
			"persistent":      true,
		},
	})
}

func (h *TelegramHandler) sendContactButtons(chatID int64) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    "Contact method?",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{
					{"text": "WhatsApp", "callback_data": "contact_whatsapp"},
					{"text": "Telegram", "callback_data": "contact_telegram"},
				},
				{
					{"text": "Email", "callback_data": "contact_email"},
					{"text": "Phone", "callback_data": "contact_phone"},
				},
			},
		},
	})
}

func (h *TelegramHandler) sendSiteReady(chatID int64, siteURL string) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id":    chatID,
		"text":       fmt.Sprintf("Your site is live!\n\n%s\n\nImprove it?", siteURL),
		"parse_mode": "HTML",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{
					{"text": "Edit Text", "callback_data": "edit_text"},
					{"text": "New Style", "callback_data": "change_style"},
				},
				{
					{"text": "Add Section", "callback_data": "add_page"},
					{"text": "Done", "callback_data": "publish"},
				},
			},
		},
	})
}

func (h *TelegramHandler) sendEditLimitReached(chatID int64) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    "Edit limit reached (3/3).",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{
					{"text": "Publish", "callback_data": "publish"},
					{"text": "New Site", "callback_data": "new_site"},
				},
			},
		},
	})
}

func (h *TelegramHandler) answerCallback(callbackID string) {
	h.telegramPost("answerCallbackQuery", map[string]interface{}{
		"callback_query_id": callbackID,
	})
}

func (h *TelegramHandler) telegramPost(method string, payload map[string]interface{}) {
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", h.botToken, method)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		slog.Error("telegram api", "method", method, "err", err)
		return
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		slog.Error("telegram api error", "method", method, "status", resp.StatusCode, "body", string(raw))
	} else {
		slog.Info("telegram api ok", "method", method, "body", string(raw))
	}
}
