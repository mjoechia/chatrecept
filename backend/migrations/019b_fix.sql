-- Fix for failed migrations 017, 018, then re-run 019.
-- Safe to run multiple times (fully idempotent).
-- Migration 017 was rolled back (GRANT failure), so its tables and function must be re-created.

-- ── 017: companies, persons, company_persons ──────────────────────────────────

CREATE TABLE IF NOT EXISTS app_secretariat.companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  name       TEXT        NOT NULL,
  uen        TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(user_id, uen)
);

CREATE TABLE IF NOT EXISTS app_secretariat.persons (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  full_name       TEXT        NOT NULL,
  nric_masked     TEXT,
  nric_encrypted  TEXT,
  nationality     TEXT,
  dob             DATE,
  address         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_secretariat.company_persons (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES app_secretariat.companies(id) ON DELETE CASCADE,
  person_id  UUID        NOT NULL REFERENCES app_secretariat.persons(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'director',
  UNIQUE(company_id, person_id, role)
);

ALTER TABLE app_secretariat.form45
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB;

CREATE INDEX IF NOT EXISTS companies_user_idx      ON app_secretariat.companies(user_id);
CREATE INDEX IF NOT EXISTS persons_user_idx        ON app_secretariat.persons(user_id);
CREATE INDEX IF NOT EXISTS company_persons_co_idx  ON app_secretariat.company_persons(company_id);
CREATE INDEX IF NOT EXISTS company_persons_per_idx ON app_secretariat.company_persons(person_id);

ALTER TABLE app_secretariat.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_secretariat.persons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_secretariat.company_persons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY companies_owner ON app_secretariat.companies
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY persons_owner ON app_secretariat.persons
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY company_persons_owner ON app_secretariat.company_persons
    USING (
      company_id IN (
        SELECT id FROM app_secretariat.companies WHERE user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT ALL ON app_secretariat.companies       TO service_role, authenticated;
GRANT ALL ON app_secretariat.persons         TO service_role, authenticated;
GRANT ALL ON app_secretariat.company_persons TO service_role, authenticated;

-- 11-param insert_form45 with source_snapshot
CREATE OR REPLACE FUNCTION public.insert_form45(
  p_company_name    TEXT,
  p_uen             TEXT,
  p_director_name   TEXT,
  p_nric_display    TEXT  DEFAULT NULL,
  p_nationality     TEXT  DEFAULT 'Singaporean',
  p_dob             TEXT  DEFAULT NULL,
  p_address         TEXT  DEFAULT NULL,
  p_declarations    JSONB DEFAULT '{}',
  p_consent_date    TEXT  DEFAULT NULL,
  p_source          TEXT  DEFAULT 'ui',
  p_source_snapshot JSONB DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result app_secretariat.form45;
BEGIN
  INSERT INTO app_secretariat.form45 (
    company_name, uen, director_name, nric_display, nationality,
    dob, address, declarations, consent_date, source, source_snapshot
  ) VALUES (
    p_company_name,
    p_uen,
    p_director_name,
    p_nric_display,
    p_nationality,
    NULLIF(p_dob,           '')::DATE,
    NULLIF(p_address,       ''),
    p_declarations,
    COALESCE(NULLIF(p_consent_date, '')::DATE, CURRENT_DATE),
    p_source,
    p_source_snapshot
  )
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
END;
$$;

-- Specify both overloads explicitly to avoid ambiguity
GRANT EXECUTE ON FUNCTION public.insert_form45(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) TO service_role, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_form45(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB
) TO service_role, authenticated;

-- ── 018: profiles, audit log, batch_jobs.user_id ─────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.secretariat_profiles (
  id           UUID               PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         public.user_role   NOT NULL DEFAULT 'user',
  status       public.user_status NOT NULL DEFAULT 'invited',
  display_name TEXT,
  email        TEXT               NOT NULL,
  invited_by   UUID               REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.secretariat_profiles(email);

ALTER TABLE public.secretariat_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY profiles_read_self
    ON public.secretariat_profiles FOR SELECT
    USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT ON public.secretariat_profiles TO authenticated;
GRANT ALL              ON public.secretariat_profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.secretariat_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       UUID        NOT NULL REFERENCES auth.users(id),
  action         TEXT        NOT NULL,
  target_user_id UUID        REFERENCES auth.users(id),
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.secretariat_audit_log TO service_role;

ALTER TABLE app_secretariat.batch_jobs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON app_secretariat.batch_jobs(user_id);

ALTER TABLE app_secretariat.batch_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY batch_jobs_read_own
    ON app_secretariat.batch_jobs FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY batch_jobs_insert_own
    ON app_secretariat.batch_jobs FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT ALL ON app_secretariat.batch_jobs TO service_role, authenticated;

-- ── 019: public-schema views ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.form_templates AS
  SELECT * FROM app_secretariat.form_templates;

CREATE OR REPLACE VIEW public.form_submissions AS
  SELECT * FROM app_secretariat.form_submissions;

CREATE OR REPLACE VIEW public.batch_jobs AS
  SELECT * FROM app_secretariat.batch_jobs;

CREATE OR REPLACE VIEW public.form45 AS
  SELECT * FROM app_secretariat.form45;

CREATE OR REPLACE VIEW public.api_keys AS
  SELECT * FROM app_secretariat.api_keys;

CREATE OR REPLACE VIEW public.secretariat_settings AS
  SELECT * FROM app_secretariat.settings;

CREATE OR REPLACE VIEW public.companies AS
  SELECT * FROM app_secretariat.companies;

CREATE OR REPLACE VIEW public.persons AS
  SELECT * FROM app_secretariat.persons;

CREATE OR REPLACE VIEW public.company_persons AS
  SELECT * FROM app_secretariat.company_persons;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_templates       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_jobs           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form45               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.secretariat_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_persons      TO service_role;
