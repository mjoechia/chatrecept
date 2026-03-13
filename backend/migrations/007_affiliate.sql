-- Migration 007: Affiliate programme tables
-- referrals: who referred whom (one referrer per tenant, immutable)
-- affiliate_credits: full audit ledger of every credit issuance and removal

-- Track which tenant referred this tenant (set at signup time)
ALTER TABLE app_chatrecept.tenants
    ADD COLUMN IF NOT EXISTS referred_by_id UUID REFERENCES app_chatrecept.tenants(id);

-- One row per referral relationship: referrer → referee
-- A tenant can only have one referrer (UNIQUE on referee_id)
CREATE TABLE IF NOT EXISTS app_chatrecept.referrals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES app_chatrecept.tenants(id),
    referee_id  UUID NOT NULL REFERENCES app_chatrecept.tenants(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (referee_id),
    CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON app_chatrecept.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referee_idx  ON app_chatrecept.referrals(referee_id);

-- Full audit ledger: one row per credit issuance
-- status: 'issued' | 'removed'
-- audit_log: append-only JSON array of change events
CREATE TABLE IF NOT EXISTS app_chatrecept.affiliate_credits (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id         UUID NOT NULL REFERENCES app_chatrecept.tenants(id),
    source_tenant_id     UUID NOT NULL REFERENCES app_chatrecept.tenants(id),
    wallet_tx_id         UUID REFERENCES app_chatrecept.wallet_transactions(id),
    level                INT  NOT NULL CHECK (level IN (1, 2)),
    topup_credits        INT  NOT NULL,
    rate                 DECIMAL(4,2) NOT NULL,
    credit_amount        INT  NOT NULL,
    status               TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'removed')),
    issued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at           TIMESTAMPTZ,
    removed_by           UUID,
    remove_reason        TEXT,
    audit_log            JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS affiliate_credits_affiliate_idx ON app_chatrecept.affiliate_credits(affiliate_id);
CREATE INDEX IF NOT EXISTS affiliate_credits_source_idx    ON app_chatrecept.affiliate_credits(source_tenant_id);
CREATE INDEX IF NOT EXISTS affiliate_credits_status_idx    ON app_chatrecept.affiliate_credits(status);

-- RLS: affiliates can only read their own credit rows
ALTER TABLE app_chatrecept.referrals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_chatrecept.affiliate_credits ENABLE ROW LEVEL SECURITY;

-- Grants for service_role (backend uses service role)
GRANT ALL ON app_chatrecept.referrals         TO service_role;
GRANT ALL ON app_chatrecept.affiliate_credits TO service_role;
