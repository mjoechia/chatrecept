package ai

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

const geminiHTMLModel = "gemini-2.5-flash"

const (
	geminiMaxOutputTokens = int32(8192)
	geminiTemperature     = float32(0.4)
	geminiTopP            = float32(0.9)
)

// GeminiCompleter calls Gemini 2.5 Flash for single-turn text completion.
// Implements the webbot completionClient interface.
type GeminiCompleter struct {
	client *genai.Client
}

// NewGeminiCompleter creates a GeminiCompleter using the Gemini API backend.
func NewGeminiCompleter(apiKey string) (*GeminiCompleter, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("gemini client init: %w", err)
	}
	return &GeminiCompleter{client: client}, nil
}

// Complete sends a single-turn prompt to Gemini 2.5 Flash and returns the text response.
func (g *GeminiCompleter) Complete(ctx context.Context, prompt string) (string, error) {
	temp := geminiTemperature
	topP := geminiTopP

	contents := []*genai.Content{
		genai.NewContentFromText(prompt, genai.RoleUser),
	}

	result, err := g.client.Models.GenerateContent(
		ctx,
		geminiHTMLModel,
		contents,
		&genai.GenerateContentConfig{
			MaxOutputTokens: geminiMaxOutputTokens,
			Temperature:     &temp,
			TopP:            &topP,
		},
	)
	if err != nil {
		return "", fmt.Errorf("gemini complete: %w", err)
	}

	if result == nil || len(result.Candidates) == 0 {
		return "", fmt.Errorf("gemini: empty response")
	}

	var sb strings.Builder
	for _, part := range result.Candidates[0].Content.Parts {
		if part.Text != "" {
			sb.WriteString(part.Text)
		}
	}

	output := strings.TrimSpace(sb.String())
	if output == "" {
		return "", fmt.Errorf("gemini: no text content returned")
	}
	return output, nil
}
