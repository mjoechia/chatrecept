package webbot

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type togetherImageReq struct {
	Model          string `json:"model"`
	Prompt         string `json:"prompt"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
	Steps          int    `json:"steps"`
	N              int    `json:"n"`
	ResponseFormat string `json:"response_format"`
}

type togetherImageResp struct {
	Data []struct {
		B64JSON string `json:"b64_json"`
	} `json:"data"`
}

// generateLogo calls Together AI (Flux Schnell) and returns a base64-encoded PNG.
func (s *Service) generateLogo(ctx context.Context, prompt string) ([]byte, error) {
	reqBody := togetherImageReq{
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
	req.Header.Set("Authorization", "Bearer "+s.togetherAPIKey)
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

	var imgResp togetherImageResp
	if err := json.Unmarshal(raw, &imgResp); err != nil {
		return nil, fmt.Errorf("decode together resp: %w", err)
	}
	if len(imgResp.Data) == 0 {
		return nil, fmt.Errorf("no image returned")
	}

	imgBytes, err := base64.StdEncoding.DecodeString(imgResp.Data[0].B64JSON)
	if err != nil {
		return nil, fmt.Errorf("decode b64: %w", err)
	}
	return imgBytes, nil
}
