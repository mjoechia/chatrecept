-- Migration 010: internal schema + user_map table
-- Shared across all apps on this Supabase project.
-- Safe to re-run: uses CREATE IF NOT EXISTS throughout.

-- 1. Internal schema
CREATE SCHEMA IF NOT EXISTS internal;

-- 2. Cross-app identity map
CREATE TABLE IF NOT EXISTS internal.user_map (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_schema   TEXT NOT NULL CHECK (app_schema <> ''),
  app_user_id  UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auth_user_id, app_schema),
  UNIQUE (app_schema, app_user_id)
);

ALTER TABLE internal.user_map ENABLE ROW LEVEL SECURITY;
-- No RLS policies: service_role access only

CREATE INDEX IF NOT EXISTS user_map_auth_idx   ON internal.user_map(auth_user_id);
CREATE INDEX IF NOT EXISTS user_map_schema_idx ON internal.user_map(app_schema);

GRANT ALL ON internal.user_map TO service_role;
GRANT USAGE ON SCHEMA internal TO service_role;
