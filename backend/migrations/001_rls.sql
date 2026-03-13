-- ============================================================
-- Row Level Security Policies
-- The Go backend uses the service key (bypasses RLS).
-- RLS protects direct Supabase client access from the dashboard.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates            ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: map Supabase auth user → tenant_id
-- Each admin user in auth.users has a tenant_id in their metadata
-- ============================================================
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID AS $$
    SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- TENANTS: admins can only see their own tenant
-- ============================================================
CREATE POLICY "tenants_select_own" ON tenants
    FOR SELECT USING (id = auth_tenant_id());

CREATE POLICY "tenants_update_own" ON tenants
    FOR UPDATE USING (id = auth_tenant_id());

-- ============================================================
-- USERS: scoped to tenant
-- ============================================================
CREATE POLICY "users_tenant_select" ON users
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "users_tenant_insert" ON users
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "users_tenant_update" ON users
    FOR UPDATE USING (tenant_id = auth_tenant_id());

-- ============================================================
-- CONVERSATIONS: scoped to tenant
-- ============================================================
CREATE POLICY "conversations_tenant_select" ON conversations
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "conversations_tenant_insert" ON conversations
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- MESSAGES: scoped to tenant
-- ============================================================
CREATE POLICY "messages_tenant_select" ON messages
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "messages_tenant_insert" ON messages
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

-- ============================================================
-- LEADS: scoped to tenant
-- ============================================================
CREATE POLICY "leads_tenant_select" ON leads
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "leads_tenant_insert" ON leads
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "leads_tenant_update" ON leads
    FOR UPDATE USING (tenant_id = auth_tenant_id());

-- ============================================================
-- WALLET TRANSACTIONS: read-only for tenant, no update/delete
-- ============================================================
CREATE POLICY "wallet_transactions_tenant_select" ON wallet_transactions
    FOR SELECT USING (tenant_id = auth_tenant_id());

-- ============================================================
-- TEMPLATES: scoped to tenant
-- ============================================================
CREATE POLICY "templates_tenant_select" ON templates
    FOR SELECT USING (tenant_id = auth_tenant_id());

CREATE POLICY "templates_tenant_insert" ON templates
    FOR INSERT WITH CHECK (tenant_id = auth_tenant_id());

CREATE POLICY "templates_tenant_update" ON templates
    FOR UPDATE USING (tenant_id = auth_tenant_id());

CREATE POLICY "templates_tenant_delete" ON templates
    FOR DELETE USING (tenant_id = auth_tenant_id());
