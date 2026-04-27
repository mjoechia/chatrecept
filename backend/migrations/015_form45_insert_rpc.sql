-- Public-schema RPC so service role can insert into app_secretariat.form45
-- without needing app_secretariat to be in PostgREST's exposed schemas list.
CREATE OR REPLACE FUNCTION public.insert_form45(
  p_company_name  TEXT,
  p_uen           TEXT,
  p_director_name TEXT,
  p_nric_display  TEXT  DEFAULT NULL,
  p_nationality   TEXT  DEFAULT 'Singaporean',
  p_dob           TEXT  DEFAULT NULL,
  p_address       TEXT  DEFAULT NULL,
  p_declarations  JSONB DEFAULT '{}',
  p_consent_date  TEXT  DEFAULT NULL,
  p_source        TEXT  DEFAULT 'ui'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result app_secretariat.form45;
BEGIN
  INSERT INTO app_secretariat.form45 (
    company_name, uen, director_name, nric_display, nationality,
    dob, address, declarations, consent_date, source
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
    p_source
  )
  RETURNING * INTO v_result;

  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_form45 TO service_role, authenticated;
