package ai

import (
	"context"

	"github.com/jc/pabot/internal/conversations"
)

// Provider is the common interface for all AI backends.
type Provider interface {
	// GenerateResponse produces a reply given a system prompt, conversation history, and the latest user message.
	GenerateResponse(ctx context.Context, systemPrompt string, history []conversations.Message, userMsg string) (*Response, error)
	// Classify runs a short classification prompt and returns the raw response text.
	Classify(ctx context.Context, systemPrompt, input string) (string, error)
}

// Response holds the output from any AI provider.
type Response struct {
	Text         string
	InputTokens  int
	OutputTokens int
	Model        string
	Cost         float64
}
