-- Waitlist signups from the coming-soon landing page
-- Creates directly in app_chatrecept (003 must run first to create the schema)
CREATE TABLE IF NOT EXISTS app_chatrecept.waitlist (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    telegram   TEXT,
    whatsapp   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: anon key (used by webfront) can insert only
ALTER TABLE app_chatrecept.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_insert_anon"
    ON app_chatrecept.waitlist FOR INSERT TO anon
    WITH CHECK (true);

-- Service role can read all (for admin/export)
CREATE POLICY "waitlist_read_service"
    ON app_chatrecept.waitlist FOR SELECT TO service_role
    USING (true);

-- anon needs INSERT privilege on the table
GRANT INSERT ON app_chatrecept.waitlist TO anon;

CREATE INDEX IF NOT EXISTS waitlist_email_idx ON app_chatrecept.waitlist (email);
CREATE INDEX IF NOT EXISTS waitlist_created_idx ON app_chatrecept.waitlist (created_at DESC);
