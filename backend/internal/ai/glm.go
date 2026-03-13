package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/jc/pabot/internal/conversations"
)

const (
	glmAPIURL      = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
	glmModel       = "glm-4.7-flash"
	glmMaxTokens   = 300
)

// GLMProvider calls Zhipu AI (bigmodel.cn) via OpenAI-compatible HTTP API. Implements Provider.
// GLM-4-Flash is free tier — cost is always 0.
type GLMProvider struct {
	apiKey string
	client *http.Client
}

func NewGLMProvider(apiKey string) *GLMProvider {
	return &GLMProvider{
		apiKey: apiKey,
		client: &http.Client{},
	}
}

// glmRequest is the OpenAI-compatible request body.
type glmRequest struct {
	Model     string       `json:"model"`
	Messages  []glmMessage `json:"messages"`
	MaxTokens int          `json:"max_tokens"`
}

type glmMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// glmResponse is the OpenAI-compatible response body.
type glmResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
}

func (p *GLMProvider) call(ctx context.Context, msgs []glmMessage, maxTokens int) (*glmResponse, error) {
	reqBody, err := json.Marshal(glmRequest{
		Model:     glmModel,
		Messages:  msgs,
		MaxTokens: maxTokens,
	})
	if err != nil {
		return nil, fmt.Errorf("glm marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, glmAPIURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("glm request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("glm http: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("glm read body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("glm api status %d: %s", resp.StatusCode, string(raw))
	}

	var result glmResponse
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("glm unmarshal: %w", err)
	}
	return &result, nil
}

// Classify runs a short classification prompt using GLM. Returns raw text.
func (p *GLMProvider) Classify(ctx context.Context, systemPrompt, input string) (string, error) {
	msgs := []glmMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: input},
	}
	result, err := p.call(ctx, msgs, 100)
	if err != nil {
		return "", fmt.Errorf("glm classify: %w", err)
	}
	if len(result.Choices) == 0 {
		return "", nil
	}
	return result.Choices[0].Message.Content, nil
}

// GenerateResponse calls GLM with tenant system prompt and conversation history.
func (p *GLMProvider) GenerateResponse(ctx context.Context, systemPrompt string, history []conversations.Message, userMsg string) (*Response, error) {
	if systemPrompt == "" {
		systemPrompt = defaultSystemPrompt
	}

	msgs := []glmMessage{{Role: "system", Content: systemPrompt}}
	for _, h := range history {
		if h.Sender == "system" {
			continue
		}
		role := "user"
		if h.Sender == "bot" {
			role = "assistant"
		}
		msgs = append(msgs, glmMessage{Role: role, Content: h.Content})
	}
	msgs = append(msgs, glmMessage{Role: "user", Content: userMsg})

	result, err := p.call(ctx, msgs, glmMaxTokens)
	if err != nil {
		return nil, fmt.Errorf("glm generate: %w", err)
	}

	text := ""
	if len(result.Choices) > 0 {
		text = result.Choices[0].Message.Content
	}

	return &Response{
		Text:         text,
		InputTokens:  result.Usage.PromptTokens,
		OutputTokens: result.Usage.CompletionTokens,
		Model:        glmModel,
		Cost:         0, // GLM-4-Flash is free
	}, nil
}
