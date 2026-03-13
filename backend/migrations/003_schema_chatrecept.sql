-- ============================================================
-- Move ChatRecept tables into app_chatrecept schema
-- Per jconline_architecture: one Supabase project, per-app schemas
-- Run this ONCE on the shared Supabase project
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app_chatrecept;

-- Move all existing tables from public to app_chatrecept
ALTER TABLE IF EXISTS public.tenants              SET SCHEMA app_chatrecept;
ALTER TABLE IF EXISTS public.users                SET SCHEMA app_chatrecept;
ALTER TABLE IF EXISTS public.conversations        SET SCHEMA app_chatrecept;
ALTER TABLE IF EXISTS public.conversation_windows SET SCHEMA app_chatrecept;
ALTER TABLE IF EXISTS public.messages             SET SCHEMA app_chatrecept;
ALTER TABLE IF EXISTS public.wallet_transactions  SET SCHEMA app_chatrecept;
ALTER TABLE IF EXISTS public.leads                SET SCHEMA app_chatrecept;
-- waitlist is created directly in app_chatrecept by 004_waitlist.sql — no move needed

-- Grant usage on schema to Supabase roles
GRANT USAGE ON SCHEMA app_chatrecept TO anon, authenticated, service_role;
GRANT ALL   ON ALL TABLES    IN SCHEMA app_chatrecept TO service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA app_chatrecept TO service_role;

-- authenticated can access their tenant data (RLS enforces row-level)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_chatrecept TO authenticated;
