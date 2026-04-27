-- Migration 017: companies + persons + company_persons
-- Company secretaries store their portfolio of companies and associated persons (directors, secretaries)
-- once, then reuse the data to pre-fill ACRA forms.

CREATE TABLE app_secretariat.companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,   -- auth.users
  name       TEXT        NOT NULL,
  uen        TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,           -- soft delete
  UNIQUE(user_id, uen)
);

CREATE TABLE app_secretariat.persons (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,   -- auth.users (owner)
  full_name       TEXT        NOT NULL,
  nric_masked     TEXT,               -- "SXXXXX67A" — display only
  nric_encrypted  TEXT,               -- AES-encrypted raw NRIC for official forms
  nationality     TEXT,
  dob             DATE,
  address         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ         -- soft delete
);

-- Many-to-many: person roles within a company
CREATE TABLE app_secretariat.company_persons (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES app_secretariat.companies(id) ON DELETE CASCADE,
  person_id  UUID        NOT NULL REFERENCES app_secretariat.persons(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'director',  -- director | secretary
  UNIQUE(company_id, person_id, role)
);

-- Audit snapshot column on form45 (source company/person state at save time)
ALTER TABLE app_secretariat.form45
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB;

CREATE INDEX companies_user_idx      ON app_secretariat.companies(user_id);
CREATE INDEX persons_user_idx        ON app_secretariat.persons(user_id);
CREATE INDEX company_persons_co_idx  ON app_secretariat.company_persons(company_id);
CREATE INDEX company_persons_per_idx ON app_secretariat.company_persons(person_id);

-- RLS: each user sees only their own rows
ALTER TABLE app_secretariat.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_secretariat.persons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_secretariat.company_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_owner ON app_secretariat.companies
  USING (user_id = auth.uid());

CREATE POLICY persons_owner ON app_secretariat.persons
  USING (user_id = auth.uid());

-- company_persons: visible if user owns the company
CREATE POLICY company_persons_owner ON app_secretariat.company_persons
  USING (
    company_id IN (
      SELECT id FROM app_secretariat.companies WHERE user_id = auth.uid()
    )
  );

GRANT ALL ON app_secretariat.companies       TO service_role, authenticated;
GRANT ALL ON app_secretariat.persons         TO service_role, authenticated;
GRANT ALL ON app_secretariat.company_persons TO service_role, authenticated;

-- Update insert_form45 RPC to accept optional source_snapshot for audit
CREATE OR REPLACE FUNCTION public.insert_form45(
  p_company_name    TEXT,
  p_uen             TEXT,
  p_director_name   TEXT,
  p_nric_display    TEXT  DEFAULT NULL,
  p_nationality     TEXT  DEFAULT 'Singaporean',
  p_dob             TEXT  DEFAULT NULL,
  p_address         TEXT  DEFAULT NULL,
  p_declarations    JSONB DEFAULT '{}',
  p_consent_date    TEXT  DEFAULT NULL,
  p_source          TEXT  DEFAULT 'ui',
  p_source_snapshot JSONB DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result app_secretariat.form45;
BEGIN
  INSERT INTO app_secretariat.form45 (
    company_name, uen, director_name, nric_display, nationality,
    dob, address, declarations, consent_date, source, source_snapshot
  ) VALUES (
    p_company_name,
    p_uen,
    p_director_name,
    p_nric_display,
    p_nationality,
    NULLIF(p_dob,           '')::DATE,
    NULLIF(p_address,       ''),
    p_declarations,
    COALESCE(NULLIF(p_consent_date, '')::DATE, CURRENT_DATE),
    p_source,
    p_source_snapshot
  )
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_form45 TO service_role, authenticated;
