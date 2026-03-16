-- Migration 008: WebsiteBot schema
CREATE SCHEMA IF NOT EXISTS app_webbot;

-- Sessions: tracks conversation state per Telegram user
CREATE TABLE IF NOT EXISTS app_webbot.sessions (
    id                BIGSERIAL PRIMARY KEY,
    telegram_user_id  BIGINT      NOT NULL UNIQUE,
    telegram_chat_id  BIGINT      NOT NULL,
    state             TEXT        NOT NULL DEFAULT 'idle',
    -- state: idle | awaiting_description | awaiting_name | awaiting_services | awaiting_contact | generating
    mode              INT         NOT NULL DEFAULT 1,  -- 1 = one-question, 2 = three-question
    draft             JSONB       NOT NULL DEFAULT '{}',
    current_site_id   UUID,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON app_webbot.sessions(telegram_user_id);

-- Sites: one row per generated website
CREATE TABLE IF NOT EXISTS app_webbot.sites (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_user_id  BIGINT      NOT NULL,
    site_name         TEXT        NOT NULL,
    industry          TEXT,
    description       TEXT,
    services          TEXT[],
    contact_type      TEXT        NOT NULL DEFAULT 'whatsapp', -- whatsapp | telegram | email | phone
    contact_value     TEXT        NOT NULL DEFAULT '',
    style             TEXT        NOT NULL DEFAULT 'modern',
    logo_url          TEXT,
    html              TEXT,
    cf_project_name   TEXT,
    site_url          TEXT,
    edit_count        INT         NOT NULL DEFAULT 0,
    max_edits         INT         NOT NULL DEFAULT 3,
    status            TEXT        NOT NULL DEFAULT 'generating', -- generating | live | archived
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sites_user_idx ON app_webbot.sites(telegram_user_id);
CREATE INDEX IF NOT EXISTS sites_status_idx ON app_webbot.sites(status);

-- Grants
GRANT ALL ON app_webbot.sessions TO service_role;
GRANT ALL ON app_webbot.sites    TO service_role;
GRANT ALL ON SEQUENCE app_webbot.sessions_id_seq TO service_role;
