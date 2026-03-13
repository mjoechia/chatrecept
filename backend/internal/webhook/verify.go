package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"strings"
)

// VerifyChallenge handles the GET request Meta sends when you register a webhook.
// It responds with the hub.challenge value to confirm ownership.
func VerifyChallenge(verifyToken string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		mode := r.URL.Query().Get("hub.mode")
		token := r.URL.Query().Get("hub.verify_token")
		challenge := r.URL.Query().Get("hub.challenge")

		if mode == "subscribe" && token == verifyToken {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(challenge))
			return
		}

		http.Error(w, "forbidden", http.StatusForbidden)
	}
}

// ValidateSignature reads the raw request body and verifies the X-Hub-Signature-256 header.
// Meta signs the payload with HMAC-SHA256 using your app secret.
// Returns the body bytes if valid, error if not.
func ValidateSignature(r *http.Request, appSecret string) ([]byte, error) {
	sig := r.Header.Get("X-Hub-Signature-256")
	if sig == "" {
		return nil, errors.New("missing X-Hub-Signature-256 header")
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, errors.New("read body: " + err.Error())
	}

	expected := computeHMAC(body, appSecret)
	// Header format: "sha256=<hex>"
	sigParts := strings.SplitN(sig, "=", 2)
	if len(sigParts) != 2 || sigParts[0] != "sha256" {
		return nil, errors.New("malformed signature header")
	}

	if !hmac.Equal([]byte(expected), []byte(sigParts[1])) {
		return nil, errors.New("signature mismatch")
	}

	return body, nil
}

func computeHMAC(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}
