package webbot

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// generateLogo returns PNG bytes for the logo.
// Uses Pollinations.ai (free, no key) when togetherAPIKey is empty,
// otherwise uses Together AI (Flux Schnell, ~$0.002/image).
func (s *Service) generateLogo(ctx context.Context, prompt string) ([]byte, error) {
	if s.togetherAPIKey == "" {
		return generateLogoFree(ctx, prompt)
	}
	return generateLogoTogether(ctx, s.togetherAPIKey, prompt)
}

// generateLogoFree uses Pollinations.ai — completely free, no API key required.
func generateLogoFree(ctx context.Context, prompt string) ([]byte, error) {
	endpoint := "https://image.pollinations.ai/prompt/" +
		url.PathEscape(prompt) +
		"?width=512&height=512&model=flux&nologo=true&seed=42"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("pollinations: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pollinations %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

// generateLogoTogether uses Together AI (paid, ~$0.002/image).
func generateLogoTogether(ctx context.Context, apiKey, prompt string) ([]byte, error) {
	reqBody := struct {
		Model          string `json:"model"`
		Prompt         string `json:"prompt"`
		Width          int    `json:"width"`
		Height         int    `json:"height"`
		Steps          int    `json:"steps"`
		N              int    `json:"n"`
		ResponseFormat string `json:"response_format"`
	}{
		Model:          "black-forest-labs/FLUX.1-schnell",
		Prompt:         prompt,
		Width:          512,
		Height:         512,
		Steps:          4,
		N:              1,
		ResponseFormat: "b64_json",
	}

	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.together.xyz/v1/images/generations", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("together api: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("together api %d: %s", resp.StatusCode, raw)
	}

	var imgResp struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &imgResp); err != nil {
		return nil, fmt.Errorf("decode together resp: %w", err)
	}
	if len(imgResp.Data) == 0 {
		return nil, fmt.Errorf("no image returned")
	}

	return base64.StdEncoding.DecodeString(imgResp.Data[0].B64JSON)
}
