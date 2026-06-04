// Package assistant generates grounded answers for the frontdesk bot.
// It fetches knowledge-base entries for the tenant, injects them into the
// system prompt, calls Claude, and parses a confidence score from the JSON
// response.  When confidence is below the tenant's threshold the caller
// should flag the conversation for human follow-up.
package assistant

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jc/pabot/internal/ai"
	"github.com/jc/pabot/internal/conversations"
	"github.com/jc/pabot/internal/db"
)

// Service generates answers grounded in a tenant's knowledge base.
type Service struct {
	db     *db.DB
	claude ai.Provider
}

// NewService returns an assistant service bound to the db pool and Claude.
func NewService(database *db.DB, claude ai.Provider) *Service {
	return &Service{db: database, claude: claude}
}

// Result is the output from Answer.
type Result struct {
	Answer     string
	Confidence float64 // 0.0–1.0; < threshold means the caller should escalate
	Escalate   bool
}

// kbEntry is one row from knowledge_base_entries.
type kbEntry struct {
	Question string
	Answer   string
}

// Answer retrieves KB entries for the tenant, builds an augmented system
// prompt, calls Claude, and returns the reply with a confidence score.
// threshold is the low_confidence_threshold from the tenant row.
func (s *Service) Answer(
	ctx context.Context,
	tenantID uuid.UUID,
	companyName, tenantSystemPrompt string,
	threshold float64,
	question string,
	history []conversations.Message,
) (Result, error) {
	entries, err := s.loadKB(ctx, tenantID)
	if err != nil {
		return Result{}, fmt.Errorf("assistant: load kb: %w", err)
	}

	systemPrompt := buildSystemPrompt(companyName, tenantSystemPrompt, entries)

	resp, err := s.claude.GenerateResponse(ctx, systemPrompt, history, question)
	if err != nil {
		return Result{}, fmt.Errorf("assistant: claude: %w", err)
	}

	result := parseResponse(resp.Text, threshold)
	return result, nil
}

func (s *Service) loadKB(ctx context.Context, tenantID uuid.UUID) ([]kbEntry, error) {
	rows, err := s.db.Pool.Query(ctx, db.QueryGetKnowledgeBase, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []kbEntry
	for rows.Next() {
		var e kbEntry
		if err := rows.Scan(&e.Question, &e.Answer); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func buildSystemPrompt(companyName, tenantPrompt string, entries []kbEntry) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are the AI receptionist for %s.\n", companyName)
	if tenantPrompt != "" {
		sb.WriteString(tenantPrompt)
		sb.WriteString("\n\n")
	}

	if len(entries) > 0 {
		sb.WriteString("Knowledge base — answer ONLY from this information. ")
		sb.WriteString("If the answer is not covered, say you will pass the message to the team.\n\n")
		for _, e := range entries {
			if e.Question != "" {
				fmt.Fprintf(&sb, "Q: %s\nA: %s\n\n", e.Question, e.Answer)
			} else {
				sb.WriteString(e.Answer)
				sb.WriteString("\n\n")
			}
		}
	}

	sb.WriteString("Respond in JSON only — no other text:\n")
	sb.WriteString(`{"answer":"<your reply in 1-3 sentences>","confidence":<0.0-1.0>}` + "\n")
	sb.WriteString("confidence = 1.0 if the answer is a direct match in the knowledge base; " +
		"0.0 if you have no grounding for it.")

	return sb.String()
}

// parseResponse extracts answer + confidence from Claude's JSON reply.
// If parsing fails the raw text is returned as the answer with 0.5 confidence.
func parseResponse(text string, threshold float64) Result {
	// Claude might wrap the JSON in markdown fences — strip them.
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```") {
		if idx := strings.Index(text[3:], "```"); idx >= 0 {
			text = strings.TrimSpace(text[3 : 3+idx])
		}
	}
	// Also handle cases where Claude adds text before/after the JSON object.
	if start := strings.Index(text, "{"); start >= 0 {
		if end := strings.LastIndex(text, "}"); end > start {
			text = text[start : end+1]
		}
	}

	var raw struct {
		Answer     string  `json:"answer"`
		Confidence float64 `json:"confidence"`
	}
	if err := json.Unmarshal([]byte(text), &raw); err != nil || raw.Answer == "" {
		return Result{
			Answer:     text,
			Confidence: 0.5,
			Escalate:   0.5 < threshold,
		}
	}
	return Result{
		Answer:     raw.Answer,
		Confidence: raw.Confidence,
		Escalate:   raw.Confidence < threshold,
	}
}
