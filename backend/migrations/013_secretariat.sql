-- Migration 013: Secretariat schema (Form 45 automation)
CREATE SCHEMA IF NOT EXISTS app_secretariat;

-- API keys for programmatic access to Secretariat
CREATE TABLE IF NOT EXISTS app_secretariat.api_keys (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT        NOT NULL,
    key_hash              TEXT        NOT NULL UNIQUE,   -- HMAC-SHA256(raw_key, API_KEY_SECRET)
    scope                 TEXT        NOT NULL DEFAULT 'form45:write',
    rate_limit_per_minute INT         NOT NULL DEFAULT 60,
    allowed_ips           TEXT[],                        -- NULL = any IP allowed
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used             TIMESTAMPTZ,
    revoked_at            TIMESTAMPTZ                    -- NULL = active
);

-- One row per Form 45 (Consent to Act as Director) document
CREATE TABLE IF NOT EXISTS app_secretariat.form45 (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID,                                -- NULL in MVP; for future multi-tenancy

    -- Company
    company_name    TEXT        NOT NULL,
    uen             TEXT        NOT NULL,

    -- Director
    director_name   TEXT        NOT NULL,
    nric_display    TEXT,            -- masked e.g. "SXXXXX67A" — safe to display
    nric_encrypted  TEXT,            -- pgcrypto-encrypted full NRIC; NULL until Phase 2
    nationality     TEXT        NOT NULL DEFAULT 'Singaporean',
    dob             DATE,
    address         TEXT,

    -- Declarations: { bankrupt: false, disqualified: false, convicted: false, barred: false }
    declarations    JSONB       NOT NULL DEFAULT '{}',

    -- Metadata
    consent_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
    pdf_path        TEXT,            -- Supabase Storage path; NO signed url stored here
    status          TEXT        NOT NULL DEFAULT 'draft',  -- draft | generating | generated | failed
    source          TEXT        NOT NULL DEFAULT 'ui',     -- ui | api | csv
    error_msg       TEXT,            -- populated when status = 'failed'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form45_status_idx  ON app_secretariat.form45(status);
CREATE INDEX IF NOT EXISTS form45_uen_idx     ON app_secretariat.form45(uen);
CREATE INDEX IF NOT EXISTS form45_tenant_idx  ON app_secretariat.form45(tenant_id);
CREATE INDEX IF NOT EXISTS form45_created_idx ON app_secretariat.form45(created_at DESC);

-- RPC: atomically claim a form for generation (draft → generating).
-- Returns the form row if the claim succeeded; NULL if already claimed/generated.
CREATE OR REPLACE FUNCTION app_secretariat.claim_form45_for_generation(form_id UUID)
RETURNS app_secretariat.form45
LANGUAGE plpgsql
AS $$
DECLARE
    result app_secretariat.form45;
BEGIN
    UPDATE app_secretariat.form45
    SET    status     = 'generating',
           updated_at = now()
    WHERE  id     = form_id
    AND    status = 'draft'
    RETURNING * INTO result;
    RETURN result;
END;
$$;

-- Grants
GRANT ALL ON app_secretariat.form45    TO service_role;
GRANT ALL ON app_secretariat.api_keys  TO service_role;
GRANT EXECUTE ON FUNCTION app_secretariat.claim_form45_for_generation(UUID) TO service_role;
