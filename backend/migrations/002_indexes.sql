-- ============================================================
-- Performance Indexes
-- All hot-path queries are covered here
-- ============================================================

-- Tenant lookup by WhatsApp phone number ID (webhook hot path)
CREATE INDEX IF NOT EXISTS idx_tenants_phone_number_id
    ON tenants (whatsapp_phone_number_id)
    WHERE status = 'active';

-- User lookup by tenant + phone (per-message hot path)
CREATE INDEX IF NOT EXISTS idx_users_tenant_phone
    ON users (tenant_id, phone_number);

-- Active conversation window lookup (per-message hot path)
CREATE INDEX IF NOT EXISTS idx_conversations_user_expiry
    ON conversations (user_id, tenant_id, conversation_window_expiry DESC);

-- Messages by conversation (context building)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at DESC);

-- Messages by tenant (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_messages_tenant_created
    ON messages (tenant_id, created_at DESC);

-- Leads by tenant + status (dashboard)
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status
    ON leads (tenant_id, status, created_at DESC);

-- Wallet transactions by tenant (audit trail)
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant_created
    ON wallet_transactions (tenant_id, created_at DESC);

-- Templates by tenant
CREATE INDEX IF NOT EXISTS idx_templates_tenant
    ON templates (tenant_id);
