package middleware

import (
	"net/http"
	"time"

	"github.com/go-chi/httprate"
)

// WebhookRateLimit limits webhook requests to 100/min per IP.
// This prevents abuse of the public webhook endpoint.
func WebhookRateLimit() func(http.Handler) http.Handler {
	return httprate.LimitByIP(100, time.Minute)
}

// APIRateLimit limits API calls to 60/min per IP.
func APIRateLimit() func(http.Handler) http.Handler {
	return httprate.LimitByIP(60, time.Minute)
}
