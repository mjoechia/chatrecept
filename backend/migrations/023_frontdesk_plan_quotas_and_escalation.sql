-- Migration 023: frontdesk plan quotas, owner report phone, escalation tracking

-- ── Plan quota defaults ────────────────────────────────────────────────────

-- Set free tier to 50 messages (was 100 before the pricing revision).
-- Each named plan gets a canonical quota; synced to tenants on creation.
ALTER TABLE app_chatrecept.tenants
  ALTER COLUMN monthly_message_quota SET DEFAULT 50;

CREATE TABLE IF NOT EXISTS app_chatrecept.plan_quotas (
  plan_type              text PRIMARY KEY,
  monthly_message_quota  int  NOT NULL
);

INSERT INTO app_chatrecept.plan_quotas (plan_type, monthly_message_quota) VALUES
  ('free',     50),
  ('starter',  500),
  ('growth',   3000),
  ('business', 12000)
ON CONFLICT (plan_type) DO UPDATE
  SET monthly_message_quota = EXCLUDED.monthly_message_quota;

-- Backfill existing tenants that still have the old default (100).
-- Only touches tenants where the stored quota equals the old default
-- and the plan is free — paid plans haven't been launched yet.
UPDATE app_chatrecept.tenants
SET monthly_message_quota = 50
WHERE plan_type = 'free'
  AND monthly_message_quota = 100;

-- ── Owner report delivery ──────────────────────────────────────────────────

-- Phone number the daily WhatsApp report is sent to.
-- Stored as E.164 without spaces (e.g. +6591234567).
-- Nullable: if not set, the report is generated but not delivered via WhatsApp.
ALTER TABLE app_chatrecept.tenants
  ADD COLUMN IF NOT EXISTS owner_report_phone text;

-- ── Escalation tracking on messages ───────────────────────────────────────

-- Marks messages that are part of an unresolved escalation: the user message
-- that triggered the "We'll get back to you" response, and the holding
-- reply itself. The daily report queries this column to surface unanswered
-- questions to the owner.
ALTER TABLE app_chatrecept.messages
  ADD COLUMN IF NOT EXISTS is_escalated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_escalated
  ON app_chatrecept.messages (tenant_id, is_escalated, created_at)
  WHERE is_escalated = true;
