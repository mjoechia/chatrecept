package adminbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/jc/pabot/internal/db"
)

// ── Telegram API types ────────────────────────────────────────────────────────

type tgUpdate struct {
	CallbackQuery *tgCallback  `json:"callback_query"`
	Message       *tgMessage   `json:"message"`
}

type tgMessage struct {
	MessageID int       `json:"message_id"`
	Chat      tgChat    `json:"chat"`
	From      *tgUser   `json:"from"`
	Text      string    `json:"text"`
}

type tgCallback struct {
	ID      string     `json:"id"`
	From    tgUser     `json:"from"`
	Message *tgMessage `json:"message"`
	Data    string     `json:"data"`
}

type tgChat struct {
	ID int64 `json:"id"`
}

type tgUser struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

type AdminHandler struct {
	store         *store
	botToken      string
	secretToken   string
	adminUsername string // without @
	mu            sync.Mutex
	sessions      map[int64]*adminSession
}

func NewAdminHandler(database *db.DB, botToken, secretToken, adminUsername string) *AdminHandler {
	return &AdminHandler{
		store:         newStore(database),
		botToken:      botToken,
		secretToken:   secretToken,
		adminUsername: strings.ToLower(adminUsername),
		sessions:      make(map[int64]*adminSession),
	}
}

func (h *AdminHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.secretToken != "" && r.Header.Get("X-Telegram-Bot-Api-Secret-Token") != h.secretToken {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	w.WriteHeader(http.StatusOK)

	var u tgUpdate
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		return
	}

	ctx := context.Background()
	go func() {
		if u.CallbackQuery != nil {
			if !h.isAdmin(u.CallbackQuery.From.Username) {
				return
			}
			h.answerCallback(u.CallbackQuery.ID)
			chatID := u.CallbackQuery.Message.Chat.ID
			h.handleCallback(ctx, chatID, u.CallbackQuery.From.ID, u.CallbackQuery.Data)
		} else if u.Message != nil {
			if u.Message.From == nil || !h.isAdmin(u.Message.From.Username) {
				return
			}
			h.handleMessage(ctx, u.Message)
		}
	}()
}

func (h *AdminHandler) isAdmin(username string) bool {
	return strings.ToLower(username) == h.adminUsername
}

// ── Session helpers ───────────────────────────────────────────────────────────

func (h *AdminHandler) getSession(userID int64) *adminSession {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.sessions[userID]; ok {
		return s
	}
	s := &adminSession{}
	h.sessions[userID] = s
	return s
}

func (h *AdminHandler) setState(userID int64, state string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if s, ok := h.sessions[userID]; ok {
		s.state = state
	}
}

func (h *AdminHandler) resetSession(userID int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sessions[userID] = &adminSession{}
}

// ── Callback router ───────────────────────────────────────────────────────────

func (h *AdminHandler) handleCallback(ctx context.Context, chatID, userID int64, data string) {
	h.resetSession(userID)
	switch data {
	case "menu":
		h.sendMenu(chatID)
	case "members":
		h.sendMembersList(ctx, chatID)
	case "users":
		h.sendUsersList(ctx, chatID)
	case "stats":
		h.sendStats(ctx, chatID)
	case "add":
		h.setState(userID, stateAwaitingAdd)
		h.sendText(chatID, "Enter name and email separated by |\n\nExample: Jane Smith | jane@email.com")
	case "remove":
		h.setState(userID, stateAwaitingRemove)
		h.sendText(chatID, "Enter the email address to remove:")
	case "topup":
		h.setState(userID, stateAwaitingTopupID)
		h.sendText(chatID, "Enter the Telegram user ID to top up:")
	case "credits":
		h.setState(userID, stateAwaitingCreditsID)
		h.sendText(chatID, "Enter the Telegram user ID to check:")
	}
}

// ── Message router ────────────────────────────────────────────────────────────

func (h *AdminHandler) handleMessage(ctx context.Context, msg *tgMessage) {
	chatID := msg.Chat.ID
	userID := msg.From.ID
	text := strings.TrimSpace(msg.Text)

	if text == "/start" || text == "/menu" {
		h.resetSession(userID)
		h.sendMenu(chatID)
		return
	}

	sess := h.getSession(userID)

	switch sess.state {
	case stateAwaitingAdd:
		h.handleAdd(ctx, chatID, userID, text)

	case stateAwaitingRemove:
		h.handleRemove(ctx, chatID, userID, text)

	case stateAwaitingTopupID:
		id, err := strconv.ParseInt(text, 10, 64)
		if err != nil {
			h.sendText(chatID, "❌ Invalid user ID. Enter a numeric Telegram user ID:")
			return
		}
		h.mu.Lock()
		h.sessions[userID].pendingUserID = id
		h.sessions[userID].state = stateAwaitingTopupAmt
		h.mu.Unlock()
		h.sendText(chatID, fmt.Sprintf("User ID: %d\nEnter the number of credits to add:", id))

	case stateAwaitingTopupAmt:
		amount, err := strconv.Atoi(text)
		if err != nil || amount <= 0 {
			h.sendText(chatID, "❌ Enter a positive number:")
			return
		}
		h.mu.Lock()
		targetID := h.sessions[userID].pendingUserID
		h.mu.Unlock()
		if err := h.store.topupCredits(ctx, targetID, amount); err != nil {
			slog.Error("adminbot: topup credits", "err", err)
			h.sendWithBack(chatID, "❌ Failed to top up. Is this a valid user ID?")
		} else {
			h.sendWithBack(chatID, fmt.Sprintf("✅ Added %d credits to user %d", amount, targetID))
		}
		h.resetSession(userID)

	case stateAwaitingCreditsID:
		id, err := strconv.ParseInt(text, 10, 64)
		if err != nil {
			h.sendText(chatID, "❌ Invalid user ID. Enter a numeric Telegram user ID:")
			return
		}
		credits, err := h.store.getWebBotCredits(ctx, id)
		if err != nil {
			h.sendWithBack(chatID, "❌ User not found.")
		} else {
			h.sendWithBack(chatID, fmt.Sprintf("User %d has %d credit(s) remaining.", id, credits))
		}
		h.resetSession(userID)

	default:
		h.sendMenu(chatID)
	}
}

func (h *AdminHandler) handleAdd(ctx context.Context, chatID, userID int64, text string) {
	parts := strings.SplitN(text, "|", 2)
	if len(parts) != 2 {
		h.sendText(chatID, "❌ Format: Name | email@example.com\nTry again:")
		return
	}
	name := strings.TrimSpace(parts[0])
	email := strings.TrimSpace(parts[1])
	if name == "" || email == "" {
		h.sendText(chatID, "❌ Name and email cannot be empty. Try again:")
		return
	}
	if err := h.store.addWaitlistMember(ctx, name, email); err != nil {
		slog.Error("adminbot: add member", "err", err)
		h.sendWithBack(chatID, "❌ Failed to add member.")
	} else {
		h.sendWithBack(chatID, fmt.Sprintf("✅ Added %s (%s) to waitlist.", name, email))
	}
	h.resetSession(userID)
}

func (h *AdminHandler) handleRemove(ctx context.Context, chatID, userID int64, text string) {
	email := strings.ToLower(strings.TrimSpace(text))
	removed, err := h.store.removeWaitlistMember(ctx, email)
	if err != nil {
		slog.Error("adminbot: remove member", "err", err)
		h.sendWithBack(chatID, "❌ Database error.")
	} else if !removed {
		h.sendWithBack(chatID, fmt.Sprintf("❌ No member found with email: %s", email))
	} else {
		h.sendWithBack(chatID, fmt.Sprintf("✅ Removed %s from waitlist.", email))
	}
	h.resetSession(userID)
}

// ── UI senders ────────────────────────────────────────────────────────────────

func (h *AdminHandler) sendMenu(chatID int64) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    "👋 ChatRecept Admin\n\nWhat would you like to manage?",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{
					{"text": "👥 Waitlist Members", "callback_data": "members"},
					{"text": "🤖 WebBot Users", "callback_data": "users"},
				},
				{
					{"text": "📊 Stats", "callback_data": "stats"},
				},
			},
		},
	})
}

func (h *AdminHandler) sendMembersList(ctx context.Context, chatID int64) {
	members, err := h.store.listWaitlistMembers(ctx, 10)
	if err != nil {
		slog.Error("adminbot: list members", "err", err)
		h.sendText(chatID, "❌ Failed to load members.")
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("👥 *Waitlist Members* (last %d)\n\n", len(members)))
	if len(members) == 0 {
		sb.WriteString("_No members yet._")
	} else {
		for i, m := range members {
			tg := ""
			if m.Telegram != "" {
				tg = " · @" + m.Telegram
			}
			sb.WriteString(fmt.Sprintf("%d\\. %s%s\n`%s`\n_%s_\n\n",
				i+1,
				escapeMarkdown(m.Name),
				escapeMarkdown(tg),
				m.Email,
				m.CreatedAt.Format("2 Jan 2006"),
			))
		}
	}

	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id":    chatID,
		"text":       sb.String(),
		"parse_mode": "MarkdownV2",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{
					{"text": "➕ Add Member", "callback_data": "add"},
					{"text": "🗑 Remove Member", "callback_data": "remove"},
				},
				{{"text": "🔙 Back", "callback_data": "menu"}},
			},
		},
	})
}

func (h *AdminHandler) sendUsersList(ctx context.Context, chatID int64) {
	users, err := h.store.listWebBotUsers(ctx, 10)
	if err != nil {
		slog.Error("adminbot: list users", "err", err)
		h.sendText(chatID, "❌ Failed to load users.")
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("🤖 *WebBot Users* (last %d)\n\n", len(users)))
	if len(users) == 0 {
		sb.WriteString("_No users yet._")
	} else {
		for i, u := range users {
			sb.WriteString(fmt.Sprintf("%d\\. `%d`\n💳 %d credit\\(s\\) · 🌐 %d site\\(s\\)\n\n",
				i+1, u.TelegramUserID, u.Credits, u.SiteCount,
			))
		}
	}

	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id":    chatID,
		"text":       sb.String(),
		"parse_mode": "MarkdownV2",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{
					{"text": "💳 Top Up Credits", "callback_data": "topup"},
					{"text": "💰 Check Credits", "callback_data": "credits"},
				},
				{{"text": "🔙 Back", "callback_data": "menu"}},
			},
		},
	})
}

func (h *AdminHandler) sendStats(ctx context.Context, chatID int64) {
	st, err := h.store.getStats(ctx)
	if err != nil {
		slog.Error("adminbot: stats", "err", err)
		h.sendText(chatID, "❌ Failed to load stats.")
		return
	}
	text := fmt.Sprintf(
		"📊 *Stats*\n\n👥 Waitlist members: *%d*\n🌐 Live sites: *%d*\n🤖 WebBot users: *%d*",
		st.WaitlistTotal, st.SitesLive, st.WebBotUsers,
	)
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "Markdown",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{{"text": "🔙 Back", "callback_data": "menu"}},
			},
		},
	})
}

func (h *AdminHandler) sendText(chatID int64, text string) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
	})
}

func (h *AdminHandler) sendWithBack(chatID int64, text string) {
	h.telegramPost("sendMessage", map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]string{
				{{"text": "🔙 Back to Menu", "callback_data": "menu"}},
			},
		},
	})
}

func (h *AdminHandler) answerCallback(callbackID string) {
	h.telegramPost("answerCallbackQuery", map[string]interface{}{
		"callback_query_id": callbackID,
	})
}

// ── Telegram API ──────────────────────────────────────────────────────────────

func (h *AdminHandler) telegramPost(method string, payload map[string]interface{}) {
	body, _ := json.Marshal(payload)
	url := "https://api.telegram.org/bot" + h.botToken + "/" + method
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		slog.Error("adminbot: telegram post", "method", method, "err", err)
		return
	}
	defer resp.Body.Close()
}

// escapeMarkdown escapes special characters for Telegram MarkdownV2.
func escapeMarkdown(s string) string {
	replacer := strings.NewReplacer(
		"_", "\\_", "*", "\\*", "[", "\\[", "]", "\\]",
		"(", "\\(", ")", "\\)", "~", "\\~", "`", "\\`",
		">", "\\>", "#", "\\#", "+", "\\+", "-", "\\-",
		"=", "\\=", "|", "\\|", "{", "\\{", "}", "\\}",
		".", "\\.", "!", "\\!",
	)
	return replacer.Replace(s)
}
