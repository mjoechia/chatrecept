-- ============================================================
-- PABot Database Schema
-- Run on Supabase via SQL editor or CLI
-- ============================================================

-- Enable UUID extension (already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TENANTS
-- Each SME business is a tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name                TEXT NOT NULL,
    whatsapp_phone_number_id    TEXT NOT NULL UNIQUE,   -- From Meta Business Manager
    meta_business_id            TEXT,
    meta_access_token_encrypted TEXT,                   -- Encrypted at app layer
    wallet_balance              INTEGER NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0),
    plan_type                   TEXT NOT NULL DEFAULT 'starter' CHECK (plan_type IN ('starter', 'custom')),
    status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    system_prompt               TEXT,                   -- Tenant-specific AI persona / FAQ context
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS (external customers messaging the business)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number    TEXT NOT NULL,
    name            TEXT,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, phone_number)
);

-- ============================================================
-- CONVERSATIONS (24-hour billing windows)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_window_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    conversation_window_expiry  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    category                    TEXT NOT NULL DEFAULT 'service' CHECK (category IN ('service', 'marketing', 'utility', 'authentication')),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MESSAGES
-- Every inbound and outbound message, with AI cost tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender          TEXT NOT NULL CHECK (sender IN ('customer', 'bot', 'system')),
    content         TEXT NOT NULL,
    token_input     INTEGER NOT NULL DEFAULT 0,
    token_output    INTEGER NOT NULL DEFAULT 0,
    model_used      TEXT,
    estimated_cost  NUMERIC(10, 6) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LEADS
-- Detected enquiries, scored and tracked
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enquiry_summary  TEXT,
    urgency_score    INTEGER CHECK (urgency_score BETWEEN 1 AND 5),
    status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'hot', 'contacted', 'closed')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WALLET TRANSACTIONS
-- Immutable audit log — INSERT only, never UPDATE
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('topup', 'deduction')),
    amount          INTEGER NOT NULL,
    reason          TEXT NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TEMPLATES
-- WhatsApp message templates (for outbound beyond 24h window)
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_name    TEXT NOT NULL,
    meta_template_id TEXT,
    category         TEXT NOT NULL DEFAULT 'utility' CHECK (category IN ('service', 'marketing', 'utility', 'authentication')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, template_name)
);
