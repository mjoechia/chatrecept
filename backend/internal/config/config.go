package config

import (
	"errors"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	Environment string

	// Database
	DatabaseURL string

	// Supabase
	SupabaseURL        string
	SupabaseServiceKey string

	// Meta / WhatsApp
	MetaAppSecret   string
	MetaVerifyToken string

	// AI providers
	AnthropicAPIKey string
	AIModel         string // Claude model ID for English tenants
	ZhipuAPIKey     string // GLM-4-Flash for Chinese tenants (free)

	// Auth (Supabase JWT secret)
	JWTSecret string

	// Wallet
	ConversationCreditCost int

	// Stripe (optional — Phase 2 payments)
	StripeSecretKey     string
	StripeWebhookSecret string
	StripeSuccessURL    string
	StripeCancelURL     string

	// WebsiteBot
	TelegramWebbotToken  string
	TelegramWebbotSecret string // X-Telegram-Bot-Api-Secret-Token
	CFAccountID          string
	CFAPIToken           string
	TogetherAPIKey       string
	PublicBaseURL        string // e.g. https://backend-production-0aa15.up.railway.app
	WebbotFreeCredits    int    // credits granted to new users (default 1)
}

func Load() (*Config, error) {
	// Load .env if present (ignored in production)
	_ = godotenv.Load()

	cfg := &Config{
		Port:                   getEnv("PORT", "8080"),
		Environment:            getEnv("ENVIRONMENT", "development"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		SupabaseURL:            os.Getenv("SUPABASE_URL"),
		SupabaseServiceKey:     os.Getenv("SUPABASE_SERVICE_KEY"),
		MetaAppSecret:          os.Getenv("META_APP_SECRET"),
		MetaVerifyToken:        os.Getenv("META_VERIFY_TOKEN"),
		AnthropicAPIKey:        os.Getenv("ANTHROPIC_API_KEY"),
		AIModel:                getEnv("AI_MODEL", "claude-haiku-4-5-20251001"),
		ZhipuAPIKey:            os.Getenv("ZHIPU_API_KEY"),
		JWTSecret:              os.Getenv("JWT_SECRET"),
		ConversationCreditCost: getEnvInt("CONVERSATION_CREDIT_COST", 1),
		StripeSecretKey:        os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:    os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripeSuccessURL:       getEnv("STRIPE_SUCCESS_URL", "http://localhost:3000/dashboard/wallet?success=1"),
		StripeCancelURL:        getEnv("STRIPE_CANCEL_URL", "http://localhost:3000/dashboard/wallet"),
		TelegramWebbotToken:   os.Getenv("TELEGRAM_WEBBOT_TOKEN"),
		TelegramWebbotSecret:  os.Getenv("TELEGRAM_WEBBOT_SECRET"),
		CFAccountID:           os.Getenv("CF_ACCOUNT_ID"),
		CFAPIToken:            os.Getenv("CF_API_TOKEN"),
		TogetherAPIKey:        os.Getenv("TOGETHER_API_KEY"),
		PublicBaseURL:         getEnv("PUBLIC_BASE_URL", "https://backend-production-0aa15.up.railway.app"),
		WebbotFreeCredits:     getEnvInt("WEBBOT_FREE_CREDITS", 1),
	}

	return cfg, cfg.validate()
}

func (c *Config) validate() error {
	required := map[string]string{
		"DATABASE_URL":      c.DatabaseURL,
		"META_APP_SECRET":   c.MetaAppSecret,
		"META_VERIFY_TOKEN": c.MetaVerifyToken,
		"ANTHROPIC_API_KEY": c.AnthropicAPIKey,
		"JWT_SECRET":        c.JWTSecret,
	}
	for name, val := range required {
		if val == "" {
			return errors.New("required env var missing: " + name)
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
