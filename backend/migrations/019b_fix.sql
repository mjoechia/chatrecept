-- Fix for failed migrations 017, 018, then re-run 019.
-- Safe to run multiple times (fully idempotent).

-- ── Fix 017: GRANT failed because two insert_form45 overloads exist ──────────
-- Specify the 11-parameter signature explicitly.
GRANT EXECUTE ON FUNCTION public.insert_form45(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB
) TO service_role, authenticated;

-- ── Fix 018: types already exist from a previous partial run ─────────────────
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

-- Add user_id column to batch_jobs (IF NOT EXISTS is safe)
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

-- ── 019: public-schema views (now that all underlying tables exist) ───────────
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_templates      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_jobs          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form45              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.secretariat_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_persons     TO service_role;
