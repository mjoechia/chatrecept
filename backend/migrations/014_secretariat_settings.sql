-- Key-value store for secretariat configuration (coordinates, feature flags, etc.)
CREATE TABLE IF NOT EXISTS app_secretariat.settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON app_secretariat.settings TO service_role;

-- Seed default coordinate map so admins have a starting point to edit
INSERT INTO app_secretariat.settings (key, value) VALUES (
  'form45_coordinates',
  '{
    "fields": {
      "company_name":  { "x": 180, "y": 690, "maxWidth": 320 },
      "uen":           { "x": 180, "y": 670, "maxWidth": 200 },
      "director_name": { "x": 180, "y": 600, "maxWidth": 320 },
      "nric_display":  { "x": 180, "y": 580, "maxWidth": 200 },
      "nationality":   { "x": 180, "y": 560, "maxWidth": 200 },
      "dob":           { "x": 180, "y": 540, "maxWidth": 200 },
      "address":       { "x": 180, "y": 510, "maxWidth": 320, "lineHeight": 12 },
      "consent_date":  { "x": 220, "y": 360, "maxWidth": 200 }
    },
    "checkboxes": {
      "bankrupt":         { "x": 60, "y": 430 },
      "convicted":        { "x": 60, "y": 410 },
      "disqualified":     { "x": 60, "y": 390 },
      "struck_off":       { "x": 60, "y": 370 },
      "nominee_director": { "x": 60, "y": 310 },
      "employment_pass":  { "x": 60, "y": 290 }
    }
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
