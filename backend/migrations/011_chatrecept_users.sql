-- Migration 011: rename users→contacts, create auth-linked users table + trigger
-- Run AFTER 010_internal_schema.sql

-- ============================================================
-- Step 1: Drop all FKs on tables that reference app_chatrecept.users
--         Using dynamic discovery — constraint names may differ per environment.
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'app_chatrecept.conversations'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE 'ALTER TABLE app_chatrecept.conversations DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'app_chatrecept.leads'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE 'ALTER TABLE app_chatrecept.leads DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'app_chatrecept' AND table_name = 'messages'
  ) THEN
    FOR r IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'app_chatrecept.messages'::regclass
        AND contype = 'f'
    LOOP
      EXECUTE 'ALTER TABLE app_chatrecept.messages DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
  END IF;
END $$;

-- ============================================================
-- Step 2: Rename users (WhatsApp contacts) → contacts
-- ============================================================

ALTER TABLE app_chatrecept.users RENAME TO contacts;

-- Re-add FK constraints pointing to the renamed table
ALTER TABLE app_chatrecept.conversations
  ADD CONSTRAINT conversations_contact_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_chatrecept.contacts(id) ON DELETE CASCADE;

ALTER TABLE app_chatrecept.leads
  ADD CONSTRAINT leads_contact_id_fkey
  FOREIGN KEY (user_id) REFERENCES app_chatrecept.contacts(id) ON DELETE CASCADE;

-- Note: user_id column names stay as-is.
-- Phase 2 (separate migration) will rename user_id → contact_id.

-- ============================================================
-- Step 3: Create auth-linked users table (id = auth.users.id)
-- ============================================================

CREATE TABLE app_chatrecept.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  name       TEXT NOT NULL DEFAULT 'Member',
  tenant_id  UUID REFERENCES app_chatrecept.tenants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatrecept_users_tenant_id
  ON app_chatrecept.users(tenant_id);

ALTER TABLE app_chatrecept.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own record"
  ON app_chatrecept.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own record"
  ON app_chatrecept.users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Service role can insert"
  ON app_chatrecept.users FOR INSERT
  WITH CHECK (true);

GRANT ALL ON app_chatrecept.users TO service_role;

-- ============================================================
-- Step 4: Trigger function + WHEN-gated trigger
-- ============================================================

CREATE OR REPLACE FUNCTION app_chatrecept.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO app_chatrecept.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Member')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO internal.user_map (auth_user_id, app_schema, app_user_id)
  VALUES (NEW.id, 'app_chatrecept', NEW.id)
  ON CONFLICT (auth_user_id, app_schema) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user (app_chatrecept) failed for %: %', NEW.id, SQLERRM;
    RETURN NEW; -- never block auth
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app_chatrecept, public;

-- Idempotent: drop before create
DROP TRIGGER IF EXISTS on_auth_user_created_chatrecept ON auth.users;

-- WHEN-gated: fires only when raw_user_meta_data->>'app' = 'app_chatrecept'
CREATE TRIGGER on_auth_user_created_chatrecept
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.raw_user_meta_data->>'app' = 'app_chatrecept')
  EXECUTE FUNCTION app_chatrecept.handle_new_user();

-- ============================================================
-- Step 5: Backfill existing auth users
-- ============================================================

INSERT INTO app_chatrecept.users (id, email, name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', 'Member')
FROM auth.users u
WHERE (u.raw_user_meta_data->>'app') = 'app_chatrecept'
ON CONFLICT (id) DO NOTHING;

INSERT INTO internal.user_map (auth_user_id, app_schema, app_user_id)
SELECT
  u.id,
  'app_chatrecept',
  u.id
FROM auth.users u
WHERE (u.raw_user_meta_data->>'app') = 'app_chatrecept'
ON CONFLICT (auth_user_id, app_schema) DO NOTHING;
