-- Migration 009: per-user credit system for WebsiteBot
-- Default 0 so existing users are not silently granted credits.
-- New users get credits_remaining = WEBBOT_FREE_CREDITS on first INSERT (set in code).

ALTER TABLE app_webbot.sessions
  ADD COLUMN IF NOT EXISTS credits_remaining INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_total     INT NOT NULL DEFAULT 0;

-- Audit log for debugging and future payments
CREATE TABLE IF NOT EXISTS app_webbot.credit_logs (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     BIGINT      NOT NULL,
  action      TEXT        NOT NULL, -- 'grant' | 'deduct' | 'refund'
  amount      INT         NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON app_webbot.credit_logs TO service_role;
GRANT ALL ON SEQUENCE app_webbot.credit_logs_id_seq TO service_role;
