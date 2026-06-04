-- Migration 022: link tenants to their owner's Supabase auth user.
-- Required by chatrecept-app so the dashboard can look up "my tenant"
-- from the signed-in user's JWT sub claim.

-- Add nullable column so existing tenant rows (WhatsApp tenants without
-- an owner login) are not broken.  The chatrecept-app onboarding sets it
-- on tenant creation.  Each Supabase auth user may own at most one tenant
-- (UNIQUE constraint) — extend to allow multiple later if needed.
ALTER TABLE app_chatrecept.tenants
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_owner_user_id
  ON app_chatrecept.tenants (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- Partial index so lookups by owner are fast even on large tenant tables.
CREATE INDEX IF NOT EXISTS idx_tenants_owner_user_id_btree
  ON app_chatrecept.tenants (owner_user_id);
