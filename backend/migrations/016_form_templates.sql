-- Generic PDF form automation platform
-- form_templates: one row per PDF form type
-- batch_jobs: one per admin-initiated generation run
-- form_submissions: one generated PDF per recipient

CREATE TABLE IF NOT EXISTS app_secretariat.form_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  description      TEXT,
  pdf_storage_path TEXT        NOT NULL,
  coord_map        JSONB       NOT NULL DEFAULT '{"version":1,"fields":{}}',
  status           TEXT        NOT NULL DEFAULT 'draft',  -- draft | active | archived
  version          INT         NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_secretariat.batch_jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID        NOT NULL REFERENCES app_secretariat.form_templates(id) ON DELETE CASCADE,
  label        TEXT,
  column_map   JSONB       NOT NULL DEFAULT '{}',
  total        INT         NOT NULL DEFAULT 0,
  completed    INT         NOT NULL DEFAULT 0,
  failed_count INT         NOT NULL DEFAULT 0,
  status       TEXT        NOT NULL DEFAULT 'pending',  -- pending | running | done | partial_fail
  source_type  TEXT        NOT NULL DEFAULT 'csv',      -- csv | xlsx | google_contacts
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_secretariat.form_submissions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id        UUID        NOT NULL REFERENCES app_secretariat.form_templates(id) ON DELETE CASCADE,
  batch_job_id       UUID        REFERENCES app_secretariat.batch_jobs(id) ON DELETE SET NULL,
  recipient_data     JSONB       NOT NULL DEFAULT '{}',
  content_hash       TEXT,
  coord_map_snapshot JSONB,
  pdf_path           TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending',  -- pending | generating | generated | failed
  error_msg          TEXT,
  source             TEXT        NOT NULL DEFAULT 'batch',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: prevent duplicate submissions within a batch
CREATE UNIQUE INDEX IF NOT EXISTS form_submissions_idempotency
  ON app_secretariat.form_submissions(batch_job_id, content_hash)
  WHERE batch_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS form_submissions_batch_idx   ON app_secretariat.form_submissions(batch_job_id);
CREATE INDEX IF NOT EXISTS form_submissions_status_idx  ON app_secretariat.form_submissions(status);
CREATE INDEX IF NOT EXISTS batch_jobs_status_idx        ON app_secretariat.batch_jobs(status);
CREATE INDEX IF NOT EXISTS form_templates_status_idx    ON app_secretariat.form_templates(status);

GRANT ALL ON app_secretariat.form_templates   TO service_role;
GRANT ALL ON app_secretariat.form_submissions TO service_role;
GRANT ALL ON app_secretariat.batch_jobs       TO service_role;

-- RPC: atomically claim one pending submission for generation (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_submission_for_generation(p_batch_job_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM app_secretariat.form_submissions
  WHERE batch_job_id = p_batch_job_id
    AND status = 'pending'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE app_secretariat.form_submissions
  SET status = 'generating'
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_submission_for_generation TO service_role;

-- RPC: increment completed or failed_count on a batch job (avoids JS-level race conditions)
CREATE OR REPLACE FUNCTION public.increment_batch_counts(p_batch_job_id UUID, p_success BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_success THEN
    UPDATE app_secretariat.batch_jobs
    SET completed = completed + 1, updated_at = now()
    WHERE id = p_batch_job_id;
  ELSE
    UPDATE app_secretariat.batch_jobs
    SET failed_count = failed_count + 1, updated_at = now()
    WHERE id = p_batch_job_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_batch_counts TO service_role;

-- Seed Form 45 as Template #1 (stable UUID, points to existing _config/template.pdf)
-- coord_map fields left empty — admin re-calibrates via /admin/calibrate?template_id=e7f1a2b3-...
INSERT INTO app_secretariat.form_templates (
  id, name, description, pdf_storage_path, coord_map, status
) VALUES (
  'e7f1a2b3-0000-4000-8000-000000000045',
  'Form 45 – Consent to Act as Director',
  'ACRA statutory form. One per director appointment.',
  '_config/template.pdf',
  jsonb_build_object(
    'version', 1,
    'coordinate_system', jsonb_build_object('origin', 'bottom_left', 'unit', 'points'),
    'pdf_meta', jsonb_build_object(
      'page_count', 1,
      'page_sizes', jsonb_build_object('0', jsonb_build_object('width', 595, 'height', 842))
    ),
    'fields', '{}'::jsonb
  ),
  'active'
) ON CONFLICT (id) DO NOTHING;
