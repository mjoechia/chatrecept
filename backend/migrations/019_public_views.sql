-- Migration 019: Public-schema views over app_secretariat tables
--
-- PostgREST's Accept-Profile / schema-switching requires explicit "Exposed schemas"
-- config that is environment-dependent. Instead, expose all app_secretariat tables
-- as simple updatable views in the public schema, which PostgREST always serves.
-- Only service_role is granted access; RLS on the underlying tables is unchanged.
--
-- After running this migration, remove .schema('app_secretariat') from all Next.js
-- routes — plain .from('table') in the service client will resolve through these views.

CREATE OR REPLACE VIEW public.form_templates AS
  SELECT * FROM app_secretariat.form_templates;

CREATE OR REPLACE VIEW public.form_submissions AS
  SELECT * FROM app_secretariat.form_submissions;

CREATE OR REPLACE VIEW public.batch_jobs AS
  SELECT * FROM app_secretariat.batch_jobs;

CREATE OR REPLACE VIEW public.form45 AS
  SELECT * FROM app_secretariat.form45;

CREATE OR REPLACE VIEW public.api_keys AS
  SELECT * FROM app_secretariat.api_keys;

-- Renamed to avoid collisions with any future public.settings
CREATE OR REPLACE VIEW public.secretariat_settings AS
  SELECT * FROM app_secretariat.settings;

CREATE OR REPLACE VIEW public.companies AS
  SELECT * FROM app_secretariat.companies;

CREATE OR REPLACE VIEW public.persons AS
  SELECT * FROM app_secretariat.persons;

CREATE OR REPLACE VIEW public.company_persons AS
  SELECT * FROM app_secretariat.company_persons;

-- Grant DML to service_role only (routes always use the service client)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_templates     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_jobs         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form45             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys           TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.secretariat_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies          TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_persons    TO service_role;
