package db

// SQL query constants — raw SQL, no ORM.
// All queries are tenant-scoped.

const (
	// ── Tenants ────────────────────────────────────────────────────────────────

	QueryGetTenantByPhoneNumberID = `
		SELECT id, company_name, whatsapp_phone_number_id, meta_business_id,
		       meta_access_token_encrypted, wallet_balance, plan_type, status,
		       system_prompt, COALESCE(language, 'en') AS language
		FROM tenants
		WHERE whatsapp_phone_number_id = $1
		  AND status = 'active'
		LIMIT 1`

	QueryGetTenantByID = `
		SELECT id, company_name, whatsapp_phone_number_id, meta_business_id,
		       meta_access_token_encrypted, wallet_balance, plan_type, status,
		       system_prompt, COALESCE(language, 'en') AS language
		FROM tenants
		WHERE id = $1`

	QueryGetTenantBalance = `
		SELECT wallet_balance FROM tenants WHERE id = $1`

	QueryGetTenantSettings = `
		SELECT company_name, whatsapp_phone_number_id, plan_type, status, system_prompt
		FROM tenants
		WHERE id = $1`

	// $1=id $2=company_name $3=system_prompt
	QueryUpdateTenantSettings = `
		UPDATE tenants
		SET company_name = $2, system_prompt = $3
		WHERE id = $1`

	// ── Analytics ──────────────────────────────────────────────────────────────

	// Daily message aggregation for last 30 days (UTC dates).
	QueryMessageAnalytics = `
		SELECT
		    DATE(created_at AT TIME ZONE 'UTC')   AS day,
		    SUM(token_input)::int                  AS total_input,
		    SUM(token_output)::int                 AS total_output,
		    SUM(estimated_cost)                    AS total_cost,
		    COUNT(*)::int                          AS message_count
		FROM messages
		WHERE tenant_id = $1
		  AND created_at > NOW() - INTERVAL '30 days'
		GROUP BY DATE(created_at AT TIME ZONE 'UTC')
		ORDER BY day ASC`

	// Daily conversation count for last 30 days.
	QueryConversationAnalytics = `
		SELECT
		    DATE(created_at AT TIME ZONE 'UTC') AS day,
		    COUNT(*)::int                        AS conv_count
		FROM conversations
		WHERE tenant_id = $1
		  AND created_at > NOW() - INTERVAL '30 days'
		GROUP BY DATE(created_at AT TIME ZONE 'UTC')
		ORDER BY day ASC`

	// ── Users ──────────────────────────────────────────────────────────────────

	QueryUpsertUser = `
		INSERT INTO users (tenant_id, phone_number, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (tenant_id, phone_number)
		DO UPDATE SET
		    last_message_at = NOW(),
		    name = COALESCE(EXCLUDED.name, users.name)
		RETURNING id, tenant_id, phone_number, name, last_message_at`

	// ── Conversations ──────────────────────────────────────────────────────────

	QueryGetActiveConversation = `
		SELECT id, tenant_id, user_id,
		       conversation_window_start, conversation_window_expiry, category
		FROM conversations
		WHERE user_id = $1
		  AND tenant_id = $2
		  AND conversation_window_expiry > NOW()
		ORDER BY conversation_window_start DESC
		LIMIT 1`

	QueryCreateConversation = `
		INSERT INTO conversations (tenant_id, user_id, category)
		VALUES ($1, $2, $3)
		RETURNING id, conversation_window_start, conversation_window_expiry`

	// ── Messages ───────────────────────────────────────────────────────────────

	QueryGetRecentMessages = `
		SELECT sender, content, created_at
		FROM messages
		WHERE conversation_id = $1
		ORDER BY created_at DESC
		LIMIT 10`

	QueryInsertMessage = `
		INSERT INTO messages (tenant_id, conversation_id, sender, content,
		                      token_input, token_output, model_used, estimated_cost)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id`

	// ── Wallet ─────────────────────────────────────────────────────────────────

	// Atomic deduction: decrement balance and insert transaction log in one CTE
	QueryDeductCredit = `
		WITH deducted AS (
		    UPDATE tenants
		    SET wallet_balance = wallet_balance - $2
		    WHERE id = $1
		      AND wallet_balance >= $2
		    RETURNING wallet_balance
		)
		INSERT INTO wallet_transactions (tenant_id, type, amount, reason, conversation_id)
		SELECT $1, 'deduction', $2, $3, $4
		WHERE EXISTS (SELECT 1 FROM deducted)
		RETURNING id`

	QueryTopUpWallet = `
		WITH topped AS (
		    UPDATE tenants
		    SET wallet_balance = wallet_balance + $2
		    WHERE id = $1
		    RETURNING wallet_balance
		)
		INSERT INTO wallet_transactions (tenant_id, type, amount, reason)
		SELECT $1, 'topup', $2, $3
		WHERE EXISTS (SELECT 1 FROM topped)
		RETURNING id`

	QueryGetWalletTransactions = `
		SELECT id, type, amount, reason, conversation_id, created_at
		FROM wallet_transactions
		WHERE tenant_id = $1
		ORDER BY created_at DESC
		LIMIT 50`

	// ── Leads ──────────────────────────────────────────────────────────────────

	QueryUpsertLead = `
		INSERT INTO leads (tenant_id, user_id, enquiry_summary, urgency_score, status)
		VALUES ($1, $2, $3, $4, 'new')
		ON CONFLICT DO NOTHING
		RETURNING id`

	QueryGetLeads = `
		SELECT l.id, l.tenant_id, l.user_id, l.enquiry_summary,
		       l.urgency_score, l.status, l.created_at,
		       u.phone_number, u.name
		FROM leads l
		JOIN users u ON u.id = l.user_id
		WHERE l.tenant_id = $1
		ORDER BY l.created_at DESC
		LIMIT 100`

	// Updates a lead's status. Scoped to tenant for safety.
	QueryUpdateLeadStatus = `
		UPDATE leads
		SET status = $2
		WHERE id = $1
		  AND tenant_id = $3`

	// ── Conversations list ─────────────────────────────────────────────────────

	// Returns conversations for a tenant with user info and latest message preview.
	QueryListConversations = `
		SELECT
		    c.id,
		    c.conversation_window_start,
		    c.conversation_window_expiry,
		    c.category,
		    c.created_at,
		    u.id                                                                              AS user_id,
		    u.phone_number,
		    u.name,
		    (SELECT content   FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
		    (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id)             AS message_count,
		    (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
		FROM conversations c
		JOIN users u ON u.id = c.user_id
		WHERE c.tenant_id = $1
		ORDER BY last_message_at DESC NULLS LAST
		LIMIT 50`

	// Returns all messages for a conversation in ascending time order.
	QueryGetConversationMessages = `
		SELECT id, sender, content, token_input, token_output, model_used, estimated_cost, created_at
		FROM messages
		WHERE conversation_id = $1
		  AND tenant_id = $2
		ORDER BY created_at ASC`

	// ── Affiliate ──────────────────────────────────────────────────────────────

	// Who referred this tenant? Returns referrer_id or no rows.
	QueryGetReferrer = `
		SELECT referrer_id FROM referrals WHERE referee_id = $1 LIMIT 1`

	// Insert a referral relationship.
	QueryInsertReferral = `
		INSERT INTO referrals (referrer_id, referee_id)
		VALUES ($1, $2)
		ON CONFLICT (referee_id) DO NOTHING`

	// Total credits issued this calendar month for an affiliate (issued only).
	QueryMonthlyAffiliateCredits = `
		SELECT COALESCE(SUM(credit_amount), 0)
		FROM affiliate_credits
		WHERE affiliate_id = $1
		  AND status = 'issued'
		  AND issued_at >= date_trunc('month', NOW())`

	// Insert one affiliate credit ledger row.
	QueryInsertAffiliateCredit = `
		INSERT INTO affiliate_credits
		    (affiliate_id, source_tenant_id, wallet_tx_id, level, topup_credits, rate, credit_amount)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`

	// Load a credit row for admin remove.
	QueryGetAffiliateCredit = `
		SELECT affiliate_id, credit_amount, status
		FROM affiliate_credits
		WHERE id = $1`

	// Admin remove: mark as removed, append audit event, deduct from wallet.
	// $1=credit_id $2=admin_id $3=reason $4=audit_event_json $5=affiliate_id $6=credit_amount
	QueryRemoveAffiliateCredit = `
		WITH removed AS (
		    UPDATE affiliate_credits
		    SET status        = 'removed',
		        removed_at    = NOW(),
		        removed_by    = $2,
		        remove_reason = $3,
		        audit_log     = audit_log || $4::jsonb
		    WHERE id = $1
		      AND status = 'issued'
		    RETURNING affiliate_id, credit_amount
		)
		UPDATE tenants
		SET wallet_balance = GREATEST(0, wallet_balance - $6)
		WHERE id = $5
		  AND EXISTS (SELECT 1 FROM removed)`

	// How many direct referrals does this affiliate have?
	QueryAffiliateReferralCount = `
		SELECT COUNT(*) FROM referrals WHERE referrer_id = $1`

	// Credits this month + lifetime totals.
	QueryAffiliateCreditsTotal = `
		SELECT
		    COALESCE(SUM(credit_amount) FILTER (WHERE issued_at >= date_trunc('month', NOW())), 0),
		    COALESCE(SUM(credit_amount), 0)
		FROM affiliate_credits
		WHERE affiliate_id = $1
		  AND status = 'issued'`

	// Full credit history for a tenant.
	QueryAffiliateCredits = `
		SELECT id, source_tenant_id, level, topup_credits, rate, credit_amount,
		       status, issued_at, removed_at, remove_reason
		FROM affiliate_credits
		WHERE affiliate_id = $1
		ORDER BY issued_at DESC
		LIMIT 100`

	// ── Dashboard summary ──────────────────────────────────────────────────────

	QueryDashboardSummary = `
		SELECT
		    t.wallet_balance,
		    (SELECT COUNT(*) FROM conversations c WHERE c.tenant_id = t.id AND c.created_at > NOW() - INTERVAL '30 days') AS conversations_30d,
		    (SELECT COUNT(*) FROM messages m WHERE m.tenant_id = t.id AND m.created_at > NOW() - INTERVAL '30 days') AS messages_30d,
		    (SELECT COUNT(*) FROM leads l WHERE l.tenant_id = t.id AND l.status = 'new') AS open_leads,
		    (SELECT COALESCE(SUM(m.estimated_cost), 0) FROM messages m WHERE m.tenant_id = t.id AND m.created_at > NOW() - INTERVAL '30 days') AS cost_30d
		FROM tenants t
		WHERE t.id = $1`
)
