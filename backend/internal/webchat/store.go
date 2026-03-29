package webchat

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jc/pabot/internal/db"
	"github.com/jc/pabot/internal/webbot"
)

type Store struct {
	db *db.DB
}

// WebSession is the in-memory view of a web user's conversation state.
type WebSession struct {
	UserID           string
	State            string
	Mode             int
	Draft            map[string]string
	CurrentSiteID    string
	CreditsRemaining int
}

// WebMessage is one chat message in the bubble UI.
type WebMessage struct {
	ID        int64                  `json:"id"`
	Role      string                 `json:"role"`
	Content   string                 `json:"content"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt time.Time              `json:"created_at"`
}

// Button is an inline action chip rendered below a bot message.
type Button struct {
	Label  string `json:"label"`
	Action string `json:"action"`
}

// MessageResponse is the JSON shape returned by POST /webchat/message and GET /webchat/session.
type MessageResponse struct {
	State    string       `json:"state"`
	Messages []WebMessage `json:"messages"`
	Credits  int          `json:"credits"`
}

func (s *Store) getOrCreateSession(ctx context.Context, userID string) (*WebSession, error) {
	sess := &WebSession{
		UserID: userID,
		State:  webbot.StateIdle,
		Mode:   webbot.ModeOneQuestion,
		Draft:  map[string]string{},
	}

	var draftJSON []byte
	var currentSiteID string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT state, mode, draft, COALESCE(current_site_id::text, ''), credits_remaining
		FROM app_webbot.web_sessions WHERE user_id = $1::uuid`, userID).Scan(
		&sess.State, &sess.Mode, &draftJSON, &currentSiteID, &sess.CreditsRemaining)
	if err != nil {
		_, err = s.db.Pool.Exec(ctx, `
			INSERT INTO app_webbot.web_sessions (user_id, state, mode, draft, credits_remaining, credits_total)
			VALUES ($1::uuid, 'idle', 1, '{}', 3, 3)
			ON CONFLICT (user_id) DO NOTHING`, userID)
		return sess, err
	}

	_ = json.Unmarshal(draftJSON, &sess.Draft)
	sess.CurrentSiteID = currentSiteID
	return sess, nil
}

func (s *Store) setState(ctx context.Context, userID, state string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.web_sessions SET state = $2, updated_at = now()
		WHERE user_id = $1::uuid`, userID, state)
}

func (s *Store) setMode(ctx context.Context, userID string, mode int) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.web_sessions SET mode = $2, updated_at = now()
		WHERE user_id = $1::uuid`, userID, mode)
}

func (s *Store) setDraft(ctx context.Context, userID, key, value string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.web_sessions
		SET draft = draft || jsonb_build_object($2::text, $3::text), updated_at = now()
		WHERE user_id = $1::uuid`, userID, key, value)
}

func (s *Store) setCurrentSite(ctx context.Context, userID, siteID string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.web_sessions SET current_site_id = $2::uuid, updated_at = now()
		WHERE user_id = $1::uuid`, userID, siteID)
}

func (s *Store) resetSession(ctx context.Context, userID string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.web_sessions
		SET state = 'idle', mode = 1, draft = '{}', current_site_id = NULL, updated_at = now()
		WHERE user_id = $1::uuid`, userID)
}

// tryDeductCredit atomically decrements credits_remaining by 1 if > 0.
// Returns true if the credit was reserved.
func (s *Store) tryDeductCredit(ctx context.Context, userID string) bool {
	var remaining int
	err := s.db.Pool.QueryRow(ctx, `
		UPDATE app_webbot.web_sessions
		SET credits_remaining = credits_remaining - 1
		WHERE user_id = $1::uuid AND credits_remaining > 0
		RETURNING credits_remaining`, userID).Scan(&remaining)
	return err == nil
}

func (s *Store) refundCredit(ctx context.Context, userID string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.web_sessions
		SET credits_remaining = credits_remaining + 1
		WHERE user_id = $1::uuid`, userID)
}

func (s *Store) addMessage(ctx context.Context, userID, role, content string, metadata map[string]interface{}) error {
	meta := map[string]interface{}{}
	if metadata != nil {
		meta = metadata
	}
	metaJSON, _ := json.Marshal(meta)
	_, err := s.db.Pool.Exec(ctx, `
		INSERT INTO app_webbot.web_messages (user_id, role, content, metadata)
		VALUES ($1::uuid, $2, $3, $4)`, userID, role, content, metaJSON)
	return err
}

func (s *Store) getMessages(ctx context.Context, userID string, limit int) ([]WebMessage, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT id, role, content, metadata, created_at
		FROM app_webbot.web_messages
		WHERE user_id = $1::uuid
		ORDER BY created_at ASC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	msgs := make([]WebMessage, 0)
	for rows.Next() {
		var m WebMessage
		var metaJSON []byte
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &metaJSON, &m.CreatedAt); err != nil {
			continue
		}
		_ = json.Unmarshal(metaJSON, &m.Metadata)
		msgs = append(msgs, m)
	}
	return msgs, nil
}

// createSiteRecord inserts a generating-status site owned by a web user.
func (s *Store) createSiteRecord(ctx context.Context, userID string, spec *webbot.SiteSpec) (string, error) {
	var id string
	err := s.db.Pool.QueryRow(ctx, `
		INSERT INTO app_webbot.sites (web_user_id, site_name, contact_type, status)
		VALUES ($1::uuid, $2, $3, 'generating')
		RETURNING id::text`, userID, spec.SiteName, spec.ContactType).Scan(&id)
	return id, err
}
