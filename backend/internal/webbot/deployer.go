package webbot

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"strings"
)

// deploy pushes a single index.html to Cloudflare Pages via Direct Upload.
// Returns the live *.pages.dev URL.
func (s *Service) deploy(ctx context.Context, projectName, html string) (string, error) {
	// Create project if it doesn't exist
	if err := s.ensureCFProject(ctx, projectName); err != nil {
		return "", err
	}

	// Upload via Direct Upload API (multipart form)
	url, err := s.uploadToCFPages(ctx, projectName, html)
	if err != nil {
		return "", err
	}
	return url, nil
}

func (s *Service) ensureCFProject(ctx context.Context, projectName string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"name":              projectName,
		"production_branch": "main",
	})

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects", s.cfAccountID),
		bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+s.cfAPIToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 200 = created, 409 = already exists — both are fine
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("create cf project %d: %s", resp.StatusCode, raw)
	}
	return nil
}

func (s *Service) uploadToCFPages(ctx context.Context, projectName, html string) (string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	// Cloudflare Pages Direct Upload: field must be "manifest" (not "_manifest"),
	// and hashes must be SHA-256 of file contents.
	htmlBytes := []byte(html)
	h := sha256.Sum256(htmlBytes)
	fileHash := hex.EncodeToString(h[:])
	// CF Pages requires no leading slash in manifest keys or file field names
	manifest := map[string]string{"index.html": fileHash}
	manifestJSON, _ := json.Marshal(manifest)
	_ = writeFormField(w, "manifest", string(manifestJSON))
	_ = writeFormFile(w, "index.html", "index.html", htmlBytes)
	w.Close()

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/pages/projects/%s/deployments",
			s.cfAccountID, projectName),
		&buf)
	req.Header.Set("Authorization", "Bearer "+s.cfAPIToken)
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("cf deploy %d: %s", resp.StatusCode, raw)
	}

	var result struct {
		Result struct {
			URL string `json:"url"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("decode cf resp: %w", err)
	}

	siteURL := result.Result.URL
	if siteURL == "" {
		// Derive from project name as fallback
		siteURL = fmt.Sprintf("https://%s.pages.dev", projectName)
	}
	return siteURL, nil
}

func writeFormField(w *multipart.Writer, field, value string) error {
	fw, err := w.CreateFormField(field)
	if err != nil {
		return err
	}
	_, err = fw.Write([]byte(value))
	return err
}

func writeFormFile(w *multipart.Writer, field, filename string, data []byte) error {
	fw, err := w.CreateFormFile(field, filename)
	if err != nil {
		return err
	}
	_, err = fw.Write(data)
	return err
}

// slugify turns a site name into a valid CF Pages project name.
func slugify(name string) string {
	re := regexp.MustCompile(`[^a-z0-9-]`)
	slug := strings.ToLower(name)
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = re.ReplaceAllString(slug, "")
	slug = strings.Trim(slug, "-")
	if len(slug) > 28 {
		slug = slug[:28]
	}
	return slug
}

