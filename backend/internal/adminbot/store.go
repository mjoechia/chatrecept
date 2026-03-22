package adminbot

import (
	"context"

	"github.com/jc/pabot/internal/db"
)

type store struct {
	db *db.DB
}

func newStore(database *db.DB) *store {
	return &store{db: database}
}

func (s *store) listWaitlistMembers(ctx context.Context, limit int) ([]WaitlistMember, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT COALESCE(name,''), COALESCE(email,''), COALESCE(telegram,''), created_at
		FROM app_chatrecept.waitlist
		ORDER BY created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []WaitlistMember
	for rows.Next() {
		var m WaitlistMember
		if err := rows.Scan(&m.Name, &m.Email, &m.Telegram, &m.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (s *store) addWaitlistMember(ctx context.Context, name, email string) error {
	_, err := s.db.Pool.Exec(ctx, `
		INSERT INTO app_chatrecept.waitlist (name, email)
		VALUES ($1, $2)
		ON CONFLICT (email) DO NOTHING`,
		name, email)
	return err
}

func (s *store) removeWaitlistMember(ctx context.Context, email string) (bool, error) {
	var id string
	err := s.db.Pool.QueryRow(ctx, `
		DELETE FROM app_chatrecept.waitlist WHERE email = $1 RETURNING id::text`,
		email).Scan(&id)
	if err != nil {
		// pgx returns no-rows error if nothing deleted
		return false, nil
	}
	return true, nil
}

func (s *store) listWebBotUsers(ctx context.Context, limit int) ([]WebBotUser, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT s.telegram_user_id, s.credits_remaining, COUNT(si.id)::int
		FROM app_webbot.sessions s
		LEFT JOIN app_webbot.sites si ON si.telegram_user_id = s.telegram_user_id
		GROUP BY s.telegram_user_id, s.credits_remaining
		ORDER BY MAX(s.updated_at) DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []WebBotUser
	for rows.Next() {
		var u WebBotUser
		if err := rows.Scan(&u.TelegramUserID, &u.Credits, &u.SiteCount); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (s *store) topupCredits(ctx context.Context, userID int64, amount int) error {
	_, err := s.db.Pool.Exec(ctx, `
		UPDATE app_webbot.sessions
		SET credits_remaining = credits_remaining + $2,
		    credits_total      = credits_total      + $2,
		    updated_at         = now()
		WHERE telegram_user_id = $1`,
		userID, amount)
	if err != nil {
		return err
	}
	_, err = s.db.Pool.Exec(ctx, `
		INSERT INTO app_webbot.credit_logs (user_id, action, amount, note)
		VALUES ($1, 'grant', $2, 'admin topup')`,
		userID, amount)
	return err
}

func (s *store) getWebBotCredits(ctx context.Context, userID int64) (int, error) {
	var credits int
	err := s.db.Pool.QueryRow(ctx, `
		SELECT credits_remaining FROM app_webbot.sessions
		WHERE telegram_user_id = $1`,
		userID).Scan(&credits)
	return credits, err
}

func (s *store) getStats(ctx context.Context) (Stats, error) {
	var st Stats
	err := s.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM app_chatrecept.waitlist`).Scan(&st.WaitlistTotal)
	if err != nil {
		return st, err
	}
	err = s.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM app_webbot.sites WHERE status = 'live'`).Scan(&st.SitesLive)
	if err != nil {
		return st, err
	}
	err = s.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM app_webbot.sessions`).Scan(&st.WebBotUsers)
	return st, err
}
