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

	// Same as above but also sets is_escalated = true. Used by the frontdesk
	// handler when confidence < low_confidence_threshold.
	// $1=tenant_id $2=conversation_id $3=sender $4=content.
	QueryInsertEscalatedMessage = `
		INSERT INTO messages (tenant_id, conversation_id, sender, content,
		                      token_input, token_output, model_used, estimated_cost,
		                      is_escalated)
		VALUES ($1, $2, $3, $4, 0, 0, '', 0, true)
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

	// ── Billing: monthly message cap + top-ups ─────────────────────────────────
	// Phase 1 frontdesk bot. Per-tenant per-month bucket.
	// See migration 021_chatrecept_kb_and_usage.sql.

	// Read the current month's row + the tenant's plan quota in one round trip.
	// Returns zero counts if no row exists for this month yet (LEFT JOIN).
	// $1=tenant_id $2=current month ('YYYY-MM').
	QueryGetMonthlyUsage = `
		SELECT
		    COALESCE(mu.message_count, 0)   AS message_count,
		    COALESCE(mu.topup_credits, 0)   AS topup_credits,
		    t.monthly_message_quota         AS quota
		FROM tenants t
		LEFT JOIN monthly_usage mu
		    ON mu.tenant_id = t.id
		   AND mu.month     = $2
		WHERE t.id = $1`

	// Atomic increment of the current month's message_count. Upserts the row
	// if missing. $1=tenant_id $2=month $3=delta (typically 1 or 2).
	QueryIncrementMonthlyUsage = `
		INSERT INTO monthly_usage (tenant_id, month, message_count)
		VALUES ($1, $2, $3)
		ON CONFLICT (tenant_id, month) DO UPDATE
		SET message_count = monthly_usage.message_count + EXCLUDED.message_count,
		    updated_at    = NOW()
		RETURNING message_count`

	// Add top-up credits to the current month. Same upsert pattern.
	// $1=tenant_id $2=month $3=credits.
	QueryApplyMonthlyTopup = `
		INSERT INTO monthly_usage (tenant_id, month, topup_credits)
		VALUES ($1, $2, $3)
		ON CONFLICT (tenant_id, month) DO UPDATE
		SET topup_credits = monthly_usage.topup_credits + EXCLUDED.topup_credits,
		    updated_at    = NOW()
		RETURNING topup_credits`

	// Audit row for a successful Stripe top-up. UNIQUE on stripe_payment_id
	// makes the insert idempotent — duplicate webhook deliveries return
	// ErrNoRows on the second attempt and the caller can skip the credit add.
	// $1=tenant_id $2=stripe_payment_id $3=amount_sgd $4=credits.
	QueryInsertTopupTransaction = `
		INSERT INTO topup_transactions (tenant_id, stripe_payment_id, amount_sgd, credits)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (stripe_payment_id) DO NOTHING
		RETURNING id`

	// ── Frontdesk bot ─────────────────────────────────────────────────────────
	// See migration 021_chatrecept_kb_and_usage.sql for the knowledge_base_entries
	// and tenants column additions used here.

	// Fetch the fields the frontdesk handler needs from the tenant row.
	// Returns no rows if the tenant doesn't exist or is not active.
	// $1=tenant_id.
	QueryGetTenantForFrontdesk = `
		SELECT company_name,
		       COALESCE(system_prompt, ''),
		       COALESCE(low_confidence_threshold, 0.6)
		FROM tenants
		WHERE id = $1 AND status = 'active'`

	// Fetch up to 20 KB entries for a tenant, oldest-first per kind so FAQs
	// come before long docs. Used by assistant.Service to build the augmented
	// system prompt.
	// $1=tenant_id.
	QueryGetKnowledgeBase = `
		SELECT COALESCE(question, ''), answer
		FROM knowledge_base_entries
		WHERE tenant_id = $1
		ORDER BY kind, created_at
		LIMIT 20`

	// ── Owner-facing tenant lookup (chatrecept-app) ────────────────────────────

	// Return the tenant owned by the given Supabase auth user. Used by GET
	// /api/me/tenant in the chatrecept-app dashboard.
	// $1 = owner_user_id (Supabase auth UUID from JWT sub).
	QueryGetTenantByOwner = `
		SELECT id, company_name, COALESCE(system_prompt, ''),
		       COALESCE(low_confidence_threshold, 0.6),
		       plan_type, status,
		       monthly_message_quota,
		       COALESCE(owner_report_phone, '')
		FROM tenants
		WHERE owner_user_id = $1
		LIMIT 1`

	// Create a new tenant owned by a Supabase user. Called from POST
	// /api/me/tenant during onboarding.
	// $1=company_name $2=system_prompt $3=owner_user_id $4=language.
	QueryCreateTenant = `
		INSERT INTO tenants (company_name, system_prompt, owner_user_id, language,
		                     plan_type, status, monthly_message_quota)
		VALUES ($1, $2, $3, $4, 'free', 'active', 50)
		RETURNING id, company_name, COALESCE(system_prompt,''),
		          COALESCE(low_confidence_threshold, 0.6),
		          plan_type, status, monthly_message_quota,
		          COALESCE(owner_report_phone, '')`

	// Update tenant settings from the Settings page.
	// $1=company_name $2=system_prompt $3=low_confidence_threshold
	// $4=owner_report_phone $5=owner_user_id.
	QueryUpdateTenantByOwner = `
		UPDATE tenants
		SET company_name              = $1,
		    system_prompt             = $2,
		    low_confidence_threshold  = $3,
		    owner_report_phone        = NULLIF($4, '')
		WHERE owner_user_id = $5`

	// ── Knowledge base CRUD (chatrecept-app) ───────────────────────────────────

	// List all KB entries for a tenant, ordered for display.
	// $1=tenant_id.
	QueryListKBEntries = `
		SELECT id, kind, COALESCE(question,''), answer, COALESCE(source,'manual'),
		       created_at
		FROM knowledge_base_entries
		WHERE tenant_id = $1
		ORDER BY kind, created_at`

	// Insert a new KB entry.
	// $1=tenant_id $2=kind $3=question $4=answer $5=source.
	QueryInsertKBEntry = `
		INSERT INTO knowledge_base_entries (tenant_id, kind, question, answer, source)
		VALUES ($1, $2, NULLIF($3,''), $4, $5)
		RETURNING id`

	// Update an existing KB entry.
	// $1=kind $2=question $3=answer $4=id $5=tenant_id (ownership check).
	QueryUpdateKBEntry = `
		UPDATE knowledge_base_entries
		SET kind     = $1,
		    question = NULLIF($2,''),
		    answer   = $3,
		    updated_at = NOW()
		WHERE id = $4 AND tenant_id = $5`

	// Delete a KB entry scoped to the tenant.
	// $1=id $2=tenant_id.
	QueryDeleteKBEntry = `
		DELETE FROM knowledge_base_entries
		WHERE id = $1 AND tenant_id = $2`

	// ── Daily report cron ─────────────────────────────────────────────────────

	// Tenants eligible for the daily report: active, non-free plan, report
	// phone configured. Includes WhatsApp credentials so the cron can send
	// without a separate tenant lookup.
	QueryGetTenantsForDailyReport = `
		SELECT id, company_name, whatsapp_phone_number_id,
		       meta_access_token_encrypted, plan_type, owner_report_phone,
		       COALESCE(low_confidence_threshold, 0.6)
		FROM tenants
		WHERE status = 'active'
		  AND plan_type != 'free'
		  AND owner_report_phone IS NOT NULL
		  AND owner_report_phone != ''`

	// Yesterday's user messages for a tenant, newest-first, capped at 200 to
	// keep the Claude prompt bounded. Used to build the daily report content.
	// $1=tenant_id.
	QueryGetYesterdayMessages = `
		SELECT m.sender, m.content, m.is_escalated,
		       u.phone_number AS visitor_phone
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		JOIN users u ON u.id = c.user_id
		WHERE m.tenant_id = $1
		  AND m.created_at >= NOW() AT TIME ZONE 'UTC' - INTERVAL '24 hours'
		  AND m.created_at <  NOW() AT TIME ZONE 'UTC'
		ORDER BY m.created_at DESC
		LIMIT 200`

	// Escalated questions from the last 24h: the user messages that triggered
	// the "We'll get back to you" holding reply. Used in the Growth+ report
	// section for suggested replies.
	// $1=tenant_id.
	QueryGetYesterdayEscalations = `
		SELECT m.content AS question, u.phone_number AS visitor_phone
		FROM messages m
		JOIN conversations c ON c.id = m.conversation_id
		JOIN users u ON u.id = c.user_id
		WHERE m.tenant_id = $1
		  AND m.sender = 'user'
		  AND m.is_escalated = true
		  AND m.created_at >= NOW() AT TIME ZONE 'UTC' - INTERVAL '24 hours'
		ORDER BY m.created_at DESC
		LIMIT 20`

	// Quick stats for the report header: total enquiries, escalated count,
	// monthly usage so far.
	// $1=tenant_id $2=current month 'YYYY-MM'.
	QueryGetDailyStats = `
		SELECT
		    COUNT(DISTINCT c.id)                                             AS total_convs,
		    COUNT(DISTINCT c.id) FILTER (WHERE m.is_escalated = true)       AS escalated_convs,
		    COALESCE(mu.message_count, 0)                                    AS monthly_msgs,
		    t.monthly_message_quota                                          AS monthly_quota
		FROM tenants t
		LEFT JOIN conversations c  ON c.tenant_id = t.id
		    AND c.created_at >= NOW() AT TIME ZONE 'UTC' - INTERVAL '24 hours'
		LEFT JOIN messages m       ON m.conversation_id = c.id
		LEFT JOIN monthly_usage mu ON mu.tenant_id = t.id AND mu.month = $2
		WHERE t.id = $1
		GROUP BY mu.message_count, t.monthly_message_quota`

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
