// Package cron contains scheduled background jobs.
// The daily report runs at 09:00 SGT every day for all active non-free
// tenants that have configured an owner_report_phone.
package cron

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/ai"
	"github.com/jc/pabot/internal/db"
	"github.com/jc/pabot/internal/whatsapp"
)

// tenantRow holds the fields fetched by QueryGetTenantsForDailyReport.
type tenantRow struct {
	ID                      uuid.UUID
	CompanyName             string
	WhatsappPhoneNumberID   string
	MetaAccessTokenEncrypted string
	PlanType                string
	OwnerReportPhone        string
	LowConfThreshold        float64
}

// dailyStats is the output of QueryGetDailyStats.
type dailyStats struct {
	TotalConvs    int
	EscalatedConvs int
	MonthlyMsgs   int
	MonthlyQuota  int
}

// msgRow is one row from QueryGetYesterdayMessages.
type msgRow struct {
	Sender       string
	Content      string
	IsEscalated  bool
	VisitorPhone string
}

// escalationRow is one row from QueryGetYesterdayEscalations.
type escalationRow struct {
	Question     string
	VisitorPhone string
}

// reportJSON is the structured response Claude returns.
type reportJSON struct {
	TopQuestions    []string `json:"top_questions"`
	SuggestedFAQs   []string `json:"suggested_faqs"`
	EscalationNotes []string `json:"escalation_notes,omitempty"`
}

// DailyReportService generates and sends the daily owner report.
type DailyReportService struct {
	db     *db.DB
	claude ai.Provider
	waSvc  *whatsapp.Client
}

// NewDailyReportService returns a service bound to the given dependencies.
func NewDailyReportService(database *db.DB, claude ai.Provider, waSvc *whatsapp.Client) *DailyReportService {
	return &DailyReportService{db: database, claude: claude, waSvc: waSvc}
}

// Start launches the background goroutine. Fires at 09:00 SGT daily.
// Call once from main; cancel the context to stop.
func (s *DailyReportService) Start(ctx context.Context) {
	go func() {
		for {
			next := nextSGT9AM()
			slog.Info("daily report: scheduled", "next_run", next.Format(time.RFC3339))
			select {
			case <-time.After(time.Until(next)):
				s.Run(context.Background())
			case <-ctx.Done():
				return
			}
		}
	}()
}

// Run executes the daily report for all eligible tenants immediately.
// Exported so it can be triggered manually (e.g. for testing).
func (s *DailyReportService) Run(ctx context.Context) {
	slog.Info("daily report: starting run")

	tenants, err := s.loadTenants(ctx)
	if err != nil {
		slog.Error("daily report: load tenants", "err", err)
		return
	}

	for _, t := range tenants {
		if err := s.runForTenant(ctx, t); err != nil {
			slog.Error("daily report: tenant failed", "tenant_id", t.ID, "company", t.CompanyName, "err", err)
		}
	}
	slog.Info("daily report: run complete", "tenant_count", len(tenants))
}

func (s *DailyReportService) loadTenants(ctx context.Context) ([]tenantRow, error) {
	rows, err := s.db.Pool.Query(ctx, db.QueryGetTenantsForDailyReport)
	if err != nil {
		return nil, fmt.Errorf("query tenants: %w", err)
	}
	defer rows.Close()

	var out []tenantRow
	for rows.Next() {
		var t tenantRow
		if err := rows.Scan(
			&t.ID, &t.CompanyName, &t.WhatsappPhoneNumberID,
			&t.MetaAccessTokenEncrypted, &t.PlanType, &t.OwnerReportPhone,
			&t.LowConfThreshold,
		); err != nil {
			return nil, fmt.Errorf("scan tenant: %w", err)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *DailyReportService) runForTenant(ctx context.Context, t tenantRow) error {
	stats, err := s.loadStats(ctx, t.ID)
	if err != nil {
		return fmt.Errorf("load stats: %w", err)
	}

	// Nothing happened yesterday — skip silently.
	if stats.TotalConvs == 0 {
		slog.Info("daily report: no activity, skipping", "tenant", t.CompanyName)
		return nil
	}

	msgs, err := s.loadMessages(ctx, t.ID)
	if err != nil {
		return fmt.Errorf("load messages: %w", err)
	}

	var escalations []escalationRow
	if t.PlanType == "growth" || t.PlanType == "business" {
		escalations, err = s.loadEscalations(ctx, t.ID)
		if err != nil {
			return fmt.Errorf("load escalations: %w", err)
		}
	}

	report, err := s.generateReport(ctx, t, msgs, escalations)
	if err != nil {
		return fmt.Errorf("generate report: %w", err)
	}

	text := s.formatReport(t, stats, report)
	return s.sendReport(ctx, t, text)
}

func (s *DailyReportService) loadStats(ctx context.Context, tenantID uuid.UUID) (dailyStats, error) {
	month := time.Now().UTC().Format("2006-01")
	var ds dailyStats
	err := s.db.Pool.QueryRow(ctx, db.QueryGetDailyStats, tenantID, month).Scan(
		&ds.TotalConvs, &ds.EscalatedConvs, &ds.MonthlyMsgs, &ds.MonthlyQuota,
	)
	return ds, err
}

func (s *DailyReportService) loadMessages(ctx context.Context, tenantID uuid.UUID) ([]msgRow, error) {
	rows, err := s.db.Pool.Query(ctx, db.QueryGetYesterdayMessages, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []msgRow
	for rows.Next() {
		var m msgRow
		if err := rows.Scan(&m.Sender, &m.Content, &m.IsEscalated, &m.VisitorPhone); err != nil {
			continue
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *DailyReportService) loadEscalations(ctx context.Context, tenantID uuid.UUID) ([]escalationRow, error) {
	rows, err := s.db.Pool.Query(ctx, db.QueryGetYesterdayEscalations, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []escalationRow
	for rows.Next() {
		var e escalationRow
		if err := rows.Scan(&e.Question, &e.VisitorPhone); err != nil {
			continue
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *DailyReportService) generateReport(
	ctx context.Context,
	t tenantRow,
	msgs []msgRow,
	escalations []escalationRow,
) (reportJSON, error) {
	// Build a compact conversation log for Claude.
	var sb strings.Builder
	for _, m := range msgs {
		if m.Sender == "user" {
			fmt.Fprintf(&sb, "Customer: %s\n", m.Content)
		}
	}

	systemPrompt := fmt.Sprintf(
		`You are analysing yesterday's WhatsApp conversations for %s.
Your job: identify patterns, extract the top recurring questions, and suggest
FAQ entries for any questions that were asked 2+ times but aren't answered well.
%s
Respond in JSON only:
{
  "top_questions": ["<question> (N×)", ...],
  "suggested_faqs": ["<suggested FAQ entry>", ...],
  "escalation_notes": ["<brief note about escalated question>", ...]
}
Keep each item under 80 characters. Top questions: max 5. Suggested FAQs: max 3.`,
		t.CompanyName,
		escalationContext(escalations),
	)

	resp, err := s.claude.Classify(ctx, systemPrompt, sb.String())
	if err != nil {
		return reportJSON{}, fmt.Errorf("claude: %w", err)
	}

	var report reportJSON
	// Strip markdown fences if Claude wrapped the JSON.
	resp = strings.TrimSpace(resp)
	if strings.HasPrefix(resp, "```") {
		if end := strings.LastIndex(resp, "```"); end > 3 {
			resp = strings.TrimSpace(resp[3:end])
			if idx := strings.Index(resp, "\n"); idx >= 0 {
				resp = resp[idx+1:]
			}
		}
	}
	if err := json.Unmarshal([]byte(resp), &report); err != nil {
		// Graceful degradation: return an empty report rather than failing.
		slog.Warn("daily report: claude JSON parse failed", "tenant", t.CompanyName, "raw", resp)
		return reportJSON{}, nil
	}
	return report, nil
}

func escalationContext(escalations []escalationRow) string {
	if len(escalations) == 0 {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("Unanswered questions that need follow-up:\n")
	for _, e := range escalations {
		fmt.Fprintf(&sb, "- %s (from %s)\n", e.Question, e.VisitorPhone)
	}
	return sb.String()
}

func (s *DailyReportService) formatReport(t tenantRow, stats dailyStats, report reportJSON) string {
	sg, _ := time.LoadLocation("Asia/Singapore")
	yesterday := time.Now().In(sg).Add(-24 * time.Hour).Format("2 Jan 2006")

	var sb strings.Builder
	fmt.Fprintf(&sb, "Good morning! 👋 Here's your ChatRecept summary for %s (%s):\n\n", t.CompanyName, yesterday)

	fmt.Fprintf(&sb, "✅ %d customer enquiries handled automatically\n", stats.TotalConvs-stats.EscalatedConvs)
	if stats.EscalatedConvs > 0 {
		fmt.Fprintf(&sb, "❓ %d enquiries need your attention\n", stats.EscalatedConvs)
	}

	if len(report.TopQuestions) > 0 {
		sb.WriteString("\n📈 Top questions yesterday:\n")
		for _, q := range report.TopQuestions {
			fmt.Fprintf(&sb, "  • %s\n", q)
		}
	}

	if len(report.EscalationNotes) > 0 {
		sb.WriteString("\n🔔 Needs your reply:\n")
		for _, n := range report.EscalationNotes {
			fmt.Fprintf(&sb, "  • %s\n", n)
		}
	}

	if len(report.SuggestedFAQs) > 0 {
		sb.WriteString("\n💡 Suggested FAQ additions:\n")
		for _, f := range report.SuggestedFAQs {
			fmt.Fprintf(&sb, "  • %s\n", f)
		}
	}

	fmt.Fprintf(&sb, "\nMessages this month: %d / %d", stats.MonthlyMsgs, stats.MonthlyQuota)
	return sb.String()
}

func (s *DailyReportService) sendReport(ctx context.Context, t tenantRow, text string) error {
	if t.WhatsappPhoneNumberID == "" || t.MetaAccessTokenEncrypted == "" {
		slog.Warn("daily report: no WhatsApp credentials", "tenant", t.CompanyName)
		return nil
	}
	err := s.waSvc.SendTextMessage(ctx,
		t.WhatsappPhoneNumberID,
		t.MetaAccessTokenEncrypted,
		t.OwnerReportPhone,
		text,
	)
	if err != nil {
		return fmt.Errorf("send WhatsApp: %w", err)
	}
	slog.Info("daily report: sent", "tenant", t.CompanyName, "to", t.OwnerReportPhone)
	return nil
}

// nextSGT9AM returns the next 09:00 Singapore time from now.
func nextSGT9AM() time.Time {
	sg, _ := time.LoadLocation("Asia/Singapore")
	now := time.Now().In(sg)
	next := time.Date(now.Year(), now.Month(), now.Day(), 9, 0, 0, 0, sg)
	if !now.Before(next) {
		next = next.Add(24 * time.Hour)
	}
	return next
}
