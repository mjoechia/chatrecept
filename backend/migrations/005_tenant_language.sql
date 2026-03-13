-- Migration 005: Add language column to tenants
-- Controls AI provider routing: "en" → Claude Haiku, "zh" → GLM-4-Flash (free)

ALTER TABLE app_chatrecept.tenants
    ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en';

COMMENT ON COLUMN app_chatrecept.tenants.language IS
    'AI language routing: "en" = Claude Haiku (English), "zh" = GLM-4-Flash (Chinese, free)';
