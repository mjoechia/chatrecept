-- 021_chatrecept_kb_and_usage.sql
-- Phase 1 of the frontdesk-bot rollout: knowledge base + monthly message
-- usage / cap + top-up audit. Plan reference:
-- /Users/jc/.claude/plans/1-save-the-searches-spicy-finch.md
--
-- All tables are in app_chatrecept (search_path is already set in db.go;
-- explicit qualification here for safety when running raw via Supabase SQL).
-- Every statement is idempotent (IF NOT EXISTS) so this migration is safe
-- to re-run.

-- ── Knowledge base ──────────────────────────────────────────────────────────
-- One row per FAQ / doc snippet / fact the bot can ground answers on.
-- embedding is nullable so rows can be inserted before the embedding job
-- runs; the assistant retrieval logic skips rows with NULL embeddings.

CREATE TABLE IF NOT EXISTS app_chatrecept.knowledge_base_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES app_chatrecept.tenants(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('faq', 'doc', 'fact')),
    question    text,                       -- nullable for kind='doc' / 'fact'
    answer      text NOT NULL,
    embedding   text,                       -- 'text' for now — upgrade to vector(1536) once pgvector ext is enabled
    source      text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'imported_csv', 'url', 'auto_extracted')),
    created_at  timestamptz NOT NULL DEFAULT NOW(),
    updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_base_entries_tenant_idx
    ON app_chatrecept.knowledge_base_entries (tenant_id);

CREATE INDEX IF NOT EXISTS knowledge_base_entries_tenant_kind_idx
    ON app_chatrecept.knowledge_base_entries (tenant_id, kind);

-- ── Monthly message usage / cap ─────────────────────────────────────────────
-- Per-tenant per-month bucket. Rolls at midnight UTC on the 1st (the
-- billing handler treats spend_month != current_month as a fresh row).
-- message_count grows on every inbound + outbound message; topup_credits
-- grows only on Stripe topup_completed events. Effective cap is
-- tenants.monthly_message_quota + monthly_usage.topup_credits.

CREATE TABLE IF NOT EXISTS app_chatrecept.monthly_usage (
    tenant_id     uuid NOT NULL REFERENCES app_chatrecept.tenants(id) ON DELETE CASCADE,
    month         text NOT NULL,            -- 'YYYY-MM'
    message_count int  NOT NULL DEFAULT 0,
    topup_credits int  NOT NULL DEFAULT 0,
    updated_at    timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, month)
);

-- ── Top-up audit ────────────────────────────────────────────────────────────
-- One row per successful Stripe top-up purchase. Keyed off the Stripe
-- payment id so duplicate webhook deliveries don't double-credit. The
-- existing wallet_transactions table records conversation-credit top-ups
-- separately; this new table is specifically for the monthly-message top-up
-- flow we're shipping in Phase 1 of the frontdesk bot.

CREATE TABLE IF NOT EXISTS app_chatrecept.topup_transactions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES app_chatrecept.tenants(id) ON DELETE CASCADE,
    stripe_payment_id text NOT NULL UNIQUE,
    amount_sgd        numeric NOT NULL,
    credits           int NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS topup_transactions_tenant_idx
    ON app_chatrecept.topup_transactions (tenant_id, created_at DESC);

-- ── Tenant columns ──────────────────────────────────────────────────────────
-- monthly_message_quota: the plan's included messages per month.
--   Free plan = 100, Pro = 1000, Business = 5000 (set on plan change).
-- low_confidence_threshold: assistant escalates below this score (0.0–1.0).
--   Default 0.6 — admin tunes per tenant if too aggressive / lax.

ALTER TABLE app_chatrecept.tenants
    ADD COLUMN IF NOT EXISTS monthly_message_quota    int     NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS low_confidence_threshold numeric NOT NULL DEFAULT 0.6;
