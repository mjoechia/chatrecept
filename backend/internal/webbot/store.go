package webbot

import (
	"context"
	"encoding/json"
	"fmt"
)

// getOrCreateSession loads or initialises a session for a Telegram user.
func (s *Service) getOrCreateSession(ctx context.Context, userID, chatID int64) (*Session, error) {
	sess := &Session{TelegramUserID: userID, TelegramChatID: chatID, State: StateIdle, Mode: ModeOneQuestion, Draft: map[string]string{}}

	row := s.db.Pool.QueryRow(ctx, `
		SELECT state, mode, draft, COALESCE(current_site_id::text, '')
		FROM app_webbot.sessions WHERE telegram_user_id = $1`, userID)

	var draftJSON []byte
	var currentSiteID string
	err := row.Scan(&sess.State, &sess.Mode, &draftJSON, &currentSiteID)
	if err != nil {
		// Insert new session with free credits; DO NOTHING on conflict so we
		// never overwrite an existing user's credit balance.
		_, err = s.db.Pool.Exec(ctx, `
			INSERT INTO app_webbot.sessions
				(telegram_user_id, telegram_chat_id, state, mode, draft, credits_remaining, credits_total)
			VALUES ($1, $2, 'idle', 1, '{}', $3, $3)
			ON CONFLICT (telegram_user_id) DO NOTHING`, userID, chatID, s.freeCredits)
		return sess, err
	}

	_ = json.Unmarshal(draftJSON, &sess.Draft)
	sess.CurrentSiteID = currentSiteID
	return sess, nil
}

func (s *Service) setState(ctx context.Context, userID int64, state string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sessions SET state = $2, updated_at = now()
		WHERE telegram_user_id = $1`, userID, state)
}

func (s *Service) setMode(ctx context.Context, userID int64, mode int) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sessions SET mode = $2, updated_at = now()
		WHERE telegram_user_id = $1`, userID, mode)
}

func (s *Service) setDraft(ctx context.Context, userID int64, key, value string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sessions
		SET draft = draft || jsonb_build_object($2::text, $3::text), updated_at = now()
		WHERE telegram_user_id = $1`, userID, key, value)
}

func (s *Service) setCurrentSite(ctx context.Context, userID int64, siteID string) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sessions SET current_site_id = $2::uuid, updated_at = now()
		WHERE telegram_user_id = $1`, userID, siteID)
}

func (s *Service) resetSession(ctx context.Context, userID int64) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sessions
		SET state = 'idle', mode = 1, draft = '{}', current_site_id = NULL, updated_at = now()
		WHERE telegram_user_id = $1`, userID)
}

func (s *Service) createSiteRecordFromDescription(ctx context.Context, userID int64, description string) (string, error) {
	var id string
	err := s.db.Pool.QueryRow(ctx, `
		INSERT INTO app_webbot.sites (telegram_user_id, site_name, description, status)
		VALUES ($1, 'Generating...', $2, 'generating')
		RETURNING id::text`, userID, description).Scan(&id)
	return id, err
}

func (s *Service) createSiteRecord(ctx context.Context, userID int64, spec *SiteSpec) (string, error) {
	var id string
	err := s.db.Pool.QueryRow(ctx, `
		INSERT INTO app_webbot.sites (telegram_user_id, site_name, contact_type, status)
		VALUES ($1, $2, $3, 'generating')
		RETURNING id::text`, userID, spec.SiteName, spec.ContactType).Scan(&id)
	return id, err
}

func (s *Service) getSite(ctx context.Context, siteID string) (*Site, error) {
	if siteID == "" {
		return nil, fmt.Errorf("no site id")
	}
	var site Site
	var services []string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id::text, site_name, COALESCE(industry,''), services,
		       contact_type, contact_value, style,
		       COALESCE(logo_url,''), COALESCE(site_url,''),
		       COALESCE(cf_project_name,''), edit_count, max_edits, status
		FROM app_webbot.sites WHERE id = $1::uuid`, siteID).Scan(
		&site.ID, &site.SiteName, &site.Industry, &services,
		&site.ContactType, &site.ContactValue, &site.Style,
		&site.LogoURL, &site.SiteURL, &site.CFProject,
		&site.EditCount, &site.MaxEdits, &site.Status,
	)
	if err != nil {
		return nil, err
	}
	site.Services = services
	return &site, nil
}

// getCredits returns how many site-generation credits the user has left.
func (s *Service) getCredits(ctx context.Context, userID int64) (int, error) {
	var credits int
	err := s.db.Pool.QueryRow(ctx,
		`SELECT credits_remaining FROM app_webbot.sessions WHERE telegram_user_id = $1`,
		userID).Scan(&credits)
	return credits, err
}

// tryDeductCredit atomically decrements credits_remaining by 1 if > 0.
// Returns true if the credit was successfully reserved, false if the user has none.
func (s *Service) tryDeductCredit(ctx context.Context, userID int64) (bool, error) {
	var remaining int
	err := s.db.Pool.QueryRow(ctx, `
		UPDATE app_webbot.sessions
		SET credits_remaining = credits_remaining - 1
		WHERE telegram_user_id = $1 AND credits_remaining > 0
		RETURNING credits_remaining`, userID).Scan(&remaining)
	if err != nil {
		// No row returned means credits_remaining was already 0
		return false, nil
	}
	_, _ = s.db.Pool.Exec(ctx,
		`INSERT INTO app_webbot.credit_logs (user_id, action, amount, note) VALUES ($1, 'deduct', 1, 'site generation')`,
		userID)
	return true, nil
}

// refundCredit adds 1 credit back — called when generation fails after a deduction.
func (s *Service) refundCredit(ctx context.Context, userID int64) {
	_, _ = s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sessions
		SET credits_remaining = credits_remaining + 1
		WHERE telegram_user_id = $1`, userID)
	_, _ = s.db.Pool.Exec(ctx,
		`INSERT INTO app_webbot.credit_logs (user_id, action, amount, note) VALUES ($1, 'refund', 1, 'generation failed')`,
		userID)
}

func (s *Service) incrementEditCount(ctx context.Context, siteID string) (int, error) {
	var count int
	err := s.db.Pool.QueryRow(ctx, `
		UPDATE app_webbot.sites SET edit_count = edit_count + 1, updated_at = now()
		WHERE id = $1::uuid RETURNING edit_count`, siteID).Scan(&count)
	return count, err
}
