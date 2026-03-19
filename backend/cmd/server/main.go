package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/jc/pabot/internal/affiliate"
	"github.com/jc/pabot/internal/ai"
	"github.com/jc/pabot/internal/config"
	"github.com/jc/pabot/internal/webbot"
	"github.com/jc/pabot/internal/conversations"
	"github.com/jc/pabot/internal/db"
	"github.com/jc/pabot/internal/leads"
	"github.com/jc/pabot/internal/messages"
	"github.com/jc/pabot/internal/middleware"
	"github.com/jc/pabot/internal/payments"
	"github.com/jc/pabot/internal/tenants"
	"github.com/jc/pabot/internal/wallet"
	"github.com/jc/pabot/internal/webhook"
	"github.com/jc/pabot/internal/whatsapp"
)

func main() {
	// Structured JSON logging in production
	logHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	slog.SetDefault(slog.New(logHandler))

	// ── Config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}

	// ── Database ──────────────────────────────────────────────────────────────
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connect failed", "err", err)
		os.Exit(1)
	}
	defer database.Close()
	slog.Info("database connected")

	// ── Services ──────────────────────────────────────────────────────────────
	tenantSvc := tenants.NewService(database)
	walletSvc := wallet.NewService(database, cfg.ConversationCreditCost)
	convSvc := conversations.NewService(database, walletSvc)
	claudeSvc := ai.NewClaudeProvider(cfg.AnthropicAPIKey, cfg.AIModel)
	glmSvc := ai.NewGLMProvider(cfg.ZhipuAPIKey)
	aiRouter := ai.NewRouter(claudeSvc, glmSvc)
	waSvc := whatsapp.NewClient()
	msgSvc := messages.NewService(database)
	leadSvc := leads.NewService(database, claudeSvc)
	affiliateSvc := affiliate.NewService(database)

	var webbotHandler http.Handler
	if cfg.TelegramWebbotToken != "" {
		webbotSvc := webbot.NewService(database, claudeSvc, cfg.TogetherAPIKey, cfg.CFAccountID, cfg.CFAPIToken, cfg.PublicBaseURL)
		webbotHandler = webbot.NewTelegramHandler(webbotSvc, cfg.TelegramWebbotToken, cfg.TelegramWebbotSecret)
	}

	paymentSvc := payments.NewService(
		cfg.StripeSecretKey, cfg.StripeWebhookSecret,
		cfg.StripeSuccessURL, cfg.StripeCancelURL,
		walletSvc, affiliateSvc,
	)

	// ── Webhook handler ───────────────────────────────────────────────────────
	webhookHandler := webhook.NewHandler(webhook.HandlerDeps{
		AppSecret: cfg.MetaAppSecret,
		Database:  database,
		TenantSvc: tenantSvc,
		ConvSvc:   convSvc,
		AISvc:     claudeSvc,
		AIRouter:  aiRouter,
		WASvc:     waSvc,
		MsgSvc:    msgSvc,
		LeadSvc:   leadSvc,
	})

	// ── Router ────────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.RequestLogger)

	// Public: Meta webhook (rate limited)
	r.With(middleware.WebhookRateLimit()).Get("/webhook", webhook.VerifyChallenge(cfg.MetaVerifyToken))
	r.With(middleware.WebhookRateLimit()).Post("/webhook", webhookHandler.HandleInbound)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Protected API routes (require Supabase JWT)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(cfg.JWTSecret))
		r.Use(middleware.APIRateLimit())

		// Dashboard summary
		r.Get("/api/tenants/{id}/dashboard", makeDashboardHandler(database))

		// Conversations
		r.Get("/api/tenants/{id}/conversations", makeConversationsListHandler(database))
		r.Get("/api/tenants/{id}/conversations/{convId}/messages", makeConversationMessagesHandler(database))

		// Leads
		r.Get("/api/tenants/{id}/leads", makeLeadsListHandler(database))
		r.Patch("/api/tenants/{id}/leads/{leadId}", makeLeadStatusHandler(database))

		// Settings
		r.Get("/api/tenants/{id}/settings", makeGetSettingsHandler(database))
		r.Patch("/api/tenants/{id}/settings", makePatchSettingsHandler(database))

		// Analytics
		r.Get("/api/tenants/{id}/analytics", makeAnalyticsHandler(database))

		// Wallet top-up: manual + Stripe checkout
		r.Post("/api/tenants/{id}/wallet/topup", makeTopUpHandler(walletSvc))
		r.Post("/api/tenants/{id}/stripe/checkout", makeStripeCheckoutHandler(paymentSvc))

		// Affiliate
		r.Get("/api/tenants/{id}/affiliate", makeAffiliateStatsHandler(affiliateSvc))
		r.Get("/api/tenants/{id}/affiliate/credits", makeAffiliateCreditsHandler(database))
		r.Post("/api/tenants/{id}/affiliate/referral", makeSetReferralHandler(affiliateSvc))
		r.Delete("/api/admin/affiliate/credits/{creditId}", makeRemoveAffiliateCreditHandler(affiliateSvc))
	})

	// Public: Stripe webhook (Stripe signs its own payload — no JWT)
	r.Post("/stripe/webhook", paymentSvc.HandleStripeWebhook)

	// Public: WebsiteBot Telegram webhook
	if webbotHandler != nil {
		r.Post("/webbot/telegram", webbotHandler.ServeHTTP)
	}

	// Public: serve generated websites by project slug
	r.Get("/w/{slug}", func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var html string
		err := database.Pool.QueryRow(r.Context(),
			`SELECT COALESCE(html,'') FROM app_webbot.sites WHERE cf_project_name = $1 AND status = 'live' LIMIT 1`,
			slug).Scan(&html)
		if err != nil || html == "" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(html))
	})

	// ── Server ────────────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("server starting", "port", cfg.Port, "env", cfg.Environment)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	slog.Info("server stopped")
}

// ── API Handlers ─────────────────────────────────────────────────────────────

func makeDashboardHandler(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		var result struct {
			WalletBalance   int     `json:"wallet_balance"`
			Conversations30d int    `json:"conversations_30d"`
			Messages30d     int     `json:"messages_30d"`
			OpenLeads       int     `json:"open_leads"`
			Cost30d         float64 `json:"cost_30d"`
		}

		err = database.Pool.QueryRow(r.Context(), db.QueryDashboardSummary, tenantID).Scan(
			&result.WalletBalance,
			&result.Conversations30d,
			&result.Messages30d,
			&result.OpenLeads,
			&result.Cost30d,
		)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func makeConversationsListHandler(database *db.DB) http.HandlerFunc {
	type conversationItem struct {
		ID            string  `json:"id"`
		WindowStart   string  `json:"window_start"`
		WindowExpiry  string  `json:"window_expiry"`
		Category      string  `json:"category"`
		CreatedAt     string  `json:"created_at"`
		UserID        string  `json:"user_id"`
		UserPhone     string  `json:"user_phone"`
		UserName      *string `json:"user_name"`
		LastMessage   *string `json:"last_message"`
		MessageCount  int     `json:"message_count"`
		LastMessageAt *string `json:"last_message_at"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		rows, err := database.Pool.Query(r.Context(), db.QueryListConversations, tenantID)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		results := make([]conversationItem, 0)
		for rows.Next() {
			var item conversationItem
			var windowStart, windowExpiry, createdAt time.Time
			var lastMsgAt *time.Time

			if err := rows.Scan(
				&item.ID, &windowStart, &windowExpiry, &item.Category, &createdAt,
				&item.UserID, &item.UserPhone, &item.UserName,
				&item.LastMessage, &item.MessageCount, &lastMsgAt,
			); err != nil {
				http.Error(w, "scan failed", http.StatusInternalServerError)
				return
			}

			item.WindowStart = windowStart.UTC().Format(time.RFC3339)
			item.WindowExpiry = windowExpiry.UTC().Format(time.RFC3339)
			item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			if lastMsgAt != nil {
				s := lastMsgAt.UTC().Format(time.RFC3339)
				item.LastMessageAt = &s
			}

			results = append(results, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

func makeConversationMessagesHandler(database *db.DB) http.HandlerFunc {
	type messageItem struct {
		ID            string  `json:"id"`
		Sender        string  `json:"sender"`
		Content       string  `json:"content"`
		TokenInput    int     `json:"token_input"`
		TokenOutput   int     `json:"token_output"`
		ModelUsed     *string `json:"model_used"`
		EstimatedCost float64 `json:"estimated_cost"`
		CreatedAt     string  `json:"created_at"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}
		convID, err := uuid.Parse(chi.URLParam(r, "convId"))
		if err != nil {
			http.Error(w, "invalid conversation id", http.StatusBadRequest)
			return
		}

		rows, err := database.Pool.Query(r.Context(), db.QueryGetConversationMessages, convID, tenantID)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		results := make([]messageItem, 0)
		for rows.Next() {
			var item messageItem
			var createdAt time.Time
			if err := rows.Scan(
				&item.ID, &item.Sender, &item.Content,
				&item.TokenInput, &item.TokenOutput, &item.ModelUsed,
				&item.EstimatedCost, &createdAt,
			); err != nil {
				http.Error(w, "scan failed", http.StatusInternalServerError)
				return
			}
			item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			results = append(results, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

func makeLeadsListHandler(database *db.DB) http.HandlerFunc {
	type leadItem struct {
		ID             string  `json:"id"`
		UserID         string  `json:"user_id"`
		UserPhone      string  `json:"user_phone"`
		UserName       *string `json:"user_name"`
		EnquirySummary *string `json:"enquiry_summary"`
		UrgencyScore   *int    `json:"urgency_score"`
		Status         string  `json:"status"`
		CreatedAt      string  `json:"created_at"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		rows, err := database.Pool.Query(r.Context(), db.QueryGetLeads, tenantID)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		results := make([]leadItem, 0)
		for rows.Next() {
			var item leadItem
			var createdAt time.Time
			// QueryGetLeads: id, tenant_id, user_id, enquiry_summary, urgency_score, status, created_at, phone_number, name
			var tenantIDOut string
			if err := rows.Scan(
				&item.ID, &tenantIDOut, &item.UserID,
				&item.EnquirySummary, &item.UrgencyScore, &item.Status, &createdAt,
				&item.UserPhone, &item.UserName,
			); err != nil {
				http.Error(w, "scan failed", http.StatusInternalServerError)
				return
			}
			item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
			results = append(results, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

func makeLeadStatusHandler(database *db.DB) http.HandlerFunc {
	validStatuses := map[string]bool{"new": true, "hot": true, "contacted": true, "closed": true}

	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}
		leadID, err := uuid.Parse(chi.URLParam(r, "leadId"))
		if err != nil {
			http.Error(w, "invalid lead id", http.StatusBadRequest)
			return
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !validStatuses[body.Status] {
			http.Error(w, "invalid body: status must be one of new, hot, contacted, closed", http.StatusBadRequest)
			return
		}

		tag, err := database.Pool.Exec(r.Context(), db.QueryUpdateLeadStatus, leadID, body.Status, tenantID)
		if err != nil {
			http.Error(w, "update failed", http.StatusInternalServerError)
			return
		}
		if tag.RowsAffected() == 0 {
			http.Error(w, "lead not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func makeTopUpHandler(walletSvc *wallet.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		var body struct {
			Amount int    `json:"amount"`
			Reason string `json:"reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Amount <= 0 {
			http.Error(w, "invalid body: amount must be positive integer", http.StatusBadRequest)
			return
		}
		if body.Reason == "" {
			body.Reason = "manual_topup"
		}

		if err := walletSvc.TopUp(r.Context(), tenantID, body.Amount, body.Reason); err != nil {
			http.Error(w, "top up failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// ── Settings handlers ─────────────────────────────────────────────────────────

func makeGetSettingsHandler(database *db.DB) http.HandlerFunc {
	type settingsResp struct {
		CompanyName        string  `json:"company_name"`
		WhatsappPhoneID    string  `json:"whatsapp_phone_number_id"`
		PlanType           string  `json:"plan_type"`
		Status             string  `json:"status"`
		SystemPrompt       *string `json:"system_prompt"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		var s settingsResp
		err = database.Pool.QueryRow(r.Context(), db.QueryGetTenantSettings, tenantID).Scan(
			&s.CompanyName, &s.WhatsappPhoneID, &s.PlanType, &s.Status, &s.SystemPrompt,
		)
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(s)
	}
}

func makePatchSettingsHandler(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		var body struct {
			CompanyName  string `json:"company_name"`
			SystemPrompt string `json:"system_prompt"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		if body.CompanyName == "" {
			http.Error(w, "company_name required", http.StatusBadRequest)
			return
		}

		_, err = database.Pool.Exec(r.Context(), db.QueryUpdateTenantSettings,
			tenantID, body.CompanyName, body.SystemPrompt)
		if err != nil {
			http.Error(w, "update failed", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// ── Analytics handler ─────────────────────────────────────────────────────────

func makeAnalyticsHandler(database *db.DB) http.HandlerFunc {
	type dailyRow struct {
		Day           string  `json:"day"`
		Messages      int     `json:"messages"`
		Conversations int     `json:"conversations"`
		TokensIn      int     `json:"tokens_in"`
		TokensOut     int     `json:"tokens_out"`
		Cost          float64 `json:"cost"`
	}
	type totals struct {
		Messages30d      int     `json:"messages_30d"`
		Conversations30d int     `json:"conversations_30d"`
		TokensIn30d      int     `json:"tokens_in_30d"`
		TokensOut30d     int     `json:"tokens_out_30d"`
		Cost30d          float64 `json:"cost_30d"`
	}
	type analyticsResp struct {
		Daily  []dailyRow `json:"daily"`
		Totals totals     `json:"totals"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		// Message stats by day
		msgRows, err := database.Pool.Query(r.Context(), db.QueryMessageAnalytics, tenantID)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer msgRows.Close()

		byDay := map[string]*dailyRow{}
		var tot totals
		for msgRows.Next() {
			var day string
			var tokIn, tokOut, msgCount int
			var cost float64
			if err := msgRows.Scan(&day, &tokIn, &tokOut, &cost, &msgCount); err != nil {
				http.Error(w, "scan failed", http.StatusInternalServerError)
				return
			}
			byDay[day] = &dailyRow{Day: day, Messages: msgCount, TokensIn: tokIn, TokensOut: tokOut, Cost: cost}
			tot.Messages30d += msgCount
			tot.TokensIn30d += tokIn
			tot.TokensOut30d += tokOut
			tot.Cost30d += cost
		}

		// Conversation count by day
		convRows, err := database.Pool.Query(r.Context(), db.QueryConversationAnalytics, tenantID)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer convRows.Close()

		for convRows.Next() {
			var day string
			var count int
			if err := convRows.Scan(&day, &count); err != nil {
				http.Error(w, "scan failed", http.StatusInternalServerError)
				return
			}
			if r, ok := byDay[day]; ok {
				r.Conversations = count
			} else {
				byDay[day] = &dailyRow{Day: day, Conversations: count}
			}
			tot.Conversations30d += count
		}

		// Collect and sort days ascending by YYYY-MM-DD string
		daily := make([]dailyRow, 0, len(byDay))
		for _, v := range byDay {
			daily = append(daily, *v)
		}
		for i := 1; i < len(daily); i++ {
			for j := i; j > 0 && daily[j].Day < daily[j-1].Day; j-- {
				daily[j], daily[j-1] = daily[j-1], daily[j]
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(analyticsResp{Daily: daily, Totals: tot})
	}
}

// ── Stripe checkout handler ───────────────────────────────────────────────────

func makeStripeCheckoutHandler(paymentSvc *payments.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID := chi.URLParam(r, "id")
		if _, err := uuid.Parse(tenantID); err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}

		var body struct {
			PackageID string `json:"package_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}

		var pkg payments.CreditPackage
		for _, p := range payments.Packages {
			if p.ID == body.PackageID {
				pkg = p
				break
			}
		}
		if pkg.ID == "" {
			http.Error(w, "invalid package_id", http.StatusBadRequest)
			return
		}

		url, err := paymentSvc.CreateCheckoutSession(r.Context(), tenantID, pkg)
		if err != nil {
			http.Error(w, "checkout failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": url})
	}
}

// ── Affiliate handlers ────────────────────────────────────────────────────────

func makeAffiliateStatsHandler(affiliateSvc *affiliate.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}
		stats, err := affiliateSvc.GetStats(r.Context(), tenantID)
		if err != nil {
			http.Error(w, "stats failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	}
}

func makeAffiliateCreditsHandler(database *db.DB) http.HandlerFunc {
	type creditRow struct {
		ID             string   `json:"id"`
		SourceTenantID string   `json:"source_tenant_id"`
		Level          int      `json:"level"`
		TopupCredits   int      `json:"topup_credits"`
		Rate           float64  `json:"rate"`
		CreditAmount   int      `json:"credit_amount"`
		Status         string   `json:"status"`
		IssuedAt       string   `json:"issued_at"`
		RemovedAt      *string  `json:"removed_at"`
		RemoveReason   *string  `json:"remove_reason"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}
		rows, err := database.Pool.Query(r.Context(), db.QueryAffiliateCredits, tenantID)
		if err != nil {
			http.Error(w, "query failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		results := make([]creditRow, 0)
		for rows.Next() {
			var row creditRow
			var issuedAt time.Time
			var removedAt *time.Time
			if err := rows.Scan(
				&row.ID, &row.SourceTenantID, &row.Level, &row.TopupCredits,
				&row.Rate, &row.CreditAmount, &row.Status, &issuedAt,
				&removedAt, &row.RemoveReason,
			); err != nil {
				http.Error(w, "scan failed", http.StatusInternalServerError)
				return
			}
			row.IssuedAt = issuedAt.UTC().Format(time.RFC3339)
			if removedAt != nil {
				s := removedAt.UTC().Format(time.RFC3339)
				row.RemovedAt = &s
			}
			results = append(results, row)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

func makeSetReferralHandler(affiliateSvc *affiliate.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		refereeID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			http.Error(w, "invalid tenant id", http.StatusBadRequest)
			return
		}
		var body struct {
			ReferrerID string `json:"referrer_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		referrerID, err := uuid.Parse(body.ReferrerID)
		if err != nil {
			http.Error(w, "invalid referrer_id", http.StatusBadRequest)
			return
		}
		if err := affiliateSvc.SetReferral(r.Context(), referrerID, refereeID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func makeRemoveAffiliateCreditHandler(affiliateSvc *affiliate.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		creditID, err := uuid.Parse(chi.URLParam(r, "creditId"))
		if err != nil {
			http.Error(w, "invalid credit id", http.StatusBadRequest)
			return
		}
		// Admin ID from JWT claims
		adminID, _ := uuid.Parse(middleware.TenantIDFromClaims(r))
		var body struct {
			Reason string `json:"reason"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Reason == "" {
			http.Error(w, "reason required", http.StatusBadRequest)
			return
		}
		if err := affiliateSvc.RemoveCredit(r.Context(), creditID, adminID, body.Reason); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}
