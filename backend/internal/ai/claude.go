package ai

import (
	"context"
	"fmt"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/jc/pabot/internal/conversations"
)

const maxOutputTokens = 300 // Keep responses concise — no essays

// defaultSystemPrompt is used when the tenant has no custom system prompt.
const defaultSystemPrompt = `You are a professional and friendly AI receptionist.
Your job is to:
1. Greet customers warmly
2. Answer questions about the business
3. Capture enquiry details (name, need, urgency)
4. Escalate to a human when needed

Keep responses short (under 3 sentences). Be helpful and professional.
Never make up information you don't have. If unsure, say you'll pass the message to the team.`

// ClaudeProvider calls Anthropic Claude. Implements Provider.
type ClaudeProvider struct {
	client *anthropic.Client
	model  string
}

func NewClaudeProvider(apiKey, model string) *ClaudeProvider {
	client := anthropic.NewClient(option.WithAPIKey(apiKey))
	return &ClaudeProvider{client: client, model: model}
}

// Classify runs a short classification prompt and returns the raw response text.
// Uses 100 max tokens — suitable for JSON classification tasks.
func (p *ClaudeProvider) Classify(ctx context.Context, systemPrompt, input string) (string, error) {
	resp, err := p.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.F(anthropic.Model(p.model)),
		MaxTokens: anthropic.F(int64(100)),
		System:    anthropic.F([]anthropic.TextBlockParam{anthropic.NewTextBlock(systemPrompt)}),
		Messages: anthropic.F([]anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(input)),
		}),
	})
	if err != nil {
		return "", fmt.Errorf("claude classify: %w", err)
	}
	if len(resp.Content) == 0 {
		return "", nil
	}
	return resp.Content[0].Text, nil
}

// GenerateResponse calls Claude with the tenant's system prompt and conversation history.
func (p *ClaudeProvider) GenerateResponse(ctx context.Context, systemPrompt string, history []conversations.Message, userMsg string) (*Response, error) {
	if systemPrompt == "" {
		systemPrompt = defaultSystemPrompt
	}

	var messages []anthropic.MessageParam
	for _, h := range history {
		if h.Sender == "system" {
			continue
		}
		if h.Sender == "bot" {
			messages = append(messages, anthropic.NewAssistantMessage(anthropic.NewTextBlock(h.Content)))
		} else {
			messages = append(messages, anthropic.NewUserMessage(anthropic.NewTextBlock(h.Content)))
		}
	}
	messages = append(messages, anthropic.NewUserMessage(anthropic.NewTextBlock(userMsg)))

	resp, err := p.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.F(anthropic.Model(p.model)),
		MaxTokens: anthropic.F(int64(maxOutputTokens)),
		System:    anthropic.F([]anthropic.TextBlockParam{anthropic.NewTextBlock(systemPrompt)}),
		Messages:  anthropic.F(messages),
	})
	if err != nil {
		return nil, fmt.Errorf("claude api: %w", err)
	}

	text := ""
	if len(resp.Content) > 0 {
		text = resp.Content[0].Text
	}

	inputTokens := int(resp.Usage.InputTokens)
	outputTokens := int(resp.Usage.OutputTokens)

	// Cost estimate for Claude Haiku (early 2025 pricing)
	// Input:  $0.80/M tokens = $0.0000008/token
	// Output: $4.00/M tokens = $0.000004/token
	cost := float64(inputTokens)*0.0000008 + float64(outputTokens)*0.000004

	return &Response{
		Text:         text,
		InputTokens:  inputTokens,
		OutputTokens: outputTokens,
		Model:        p.model,
		Cost:         cost,
	}, nil
}

// Complete runs a single-turn prompt with a large output limit (4096 tokens).
// Used by the webbot for parsing and HTML generation.
func (p *ClaudeProvider) Complete(ctx context.Context, prompt string) (string, error) {
	resp, err := p.client.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.F(anthropic.Model(p.model)),
		MaxTokens: anthropic.F(int64(4096)),
		Messages: anthropic.F([]anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(prompt)),
		}),
	})
	if err != nil {
		return "", fmt.Errorf("claude complete: %w", err)
	}
	if len(resp.Content) == 0 {
		return "", nil
	}
	return resp.Content[0].Text, nil
}
