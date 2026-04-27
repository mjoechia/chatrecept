-- Migration 018: secretariat_profiles, audit_log, batch_jobs.user_id
-- Run in Supabase SQL Editor

-- ENUMs for type safety
CREATE TYPE public.user_role   AS ENUM ('admin', 'user');
CREATE TYPE public.user_status AS ENUM ('invited', 'active', 'suspended');

-- Profiles table in public schema (PostgREST default — no schema() prefix needed)
CREATE TABLE public.secretariat_profiles (
  id           UUID               PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         public.user_role   NOT NULL DEFAULT 'user',
  status       public.user_status NOT NULL DEFAULT 'invited',
  display_name TEXT,
  email        TEXT               NOT NULL,
  invited_by   UUID               REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_profiles_email ON public.secretariat_profiles(email);

-- RLS: read-only for authenticated users on their own row
-- No UPDATE policy — role/status changes require service-role API only
ALTER TABLE public.secretariat_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_self
  ON public.secretariat_profiles FOR SELECT
  USING (id = auth.uid());

GRANT SELECT, INSERT ON public.secretariat_profiles TO authenticated;
GRANT ALL ON public.secretariat_profiles TO service_role;

-- Audit log for admin actions
CREATE TABLE public.secretariat_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       UUID        NOT NULL REFERENCES auth.users(id),
  action         TEXT        NOT NULL,
  target_user_id UUID        REFERENCES auth.users(id),
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.secretariat_audit_log TO service_role;

-- Add user_id to batch_jobs
ALTER TABLE app_secretariat.batch_jobs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON app_secretariat.batch_jobs(user_id);

-- RLS on batch_jobs: users see/insert only their own
ALTER TABLE app_secretariat.batch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_jobs_read_own
  ON app_secretariat.batch_jobs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY batch_jobs_insert_own
  ON app_secretariat.batch_jobs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Service role bypasses RLS for admin operations
GRANT ALL ON app_secretariat.batch_jobs TO service_role, authenticated;
