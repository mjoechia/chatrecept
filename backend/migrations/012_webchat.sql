-- Migration 012: web chat tables for the browser-based chat bubble
-- Run AFTER 008_webbot.sql

-- Allow web-generated sites to have no telegram_user_id
ALTER TABLE app_webbot.sites ALTER COLUMN telegram_user_id DROP NOT NULL;

-- Add web_user_id for sites generated via the web chat bubble
ALTER TABLE app_webbot.sites
  ADD COLUMN IF NOT EXISTS web_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Web sessions: one row per authenticated Supabase user
CREATE TABLE app_webbot.web_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state             TEXT NOT NULL DEFAULT 'idle',
  mode              INT  NOT NULL DEFAULT 1,
  draft             JSONB NOT NULL DEFAULT '{}',
  current_site_id   UUID REFERENCES app_webbot.sites(id) ON DELETE SET NULL,
  credits_remaining INT  NOT NULL DEFAULT 3,
  credits_total     INT  NOT NULL DEFAULT 3,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Chat message history for the bubble UI
CREATE TABLE app_webbot.web_messages (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'bot')),
  content    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX web_sessions_user_idx ON app_webbot.web_sessions(user_id);
CREATE INDEX web_messages_user_idx ON app_webbot.web_messages(user_id);
CREATE INDEX web_messages_time_idx ON app_webbot.web_messages(user_id, created_at);

ALTER TABLE app_webbot.web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_webbot.web_messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON app_webbot.web_sessions TO service_role;
GRANT ALL ON app_webbot.web_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE app_webbot.web_messages_id_seq TO service_role;
