-- Add user_visible flag to form_templates so admins can publish templates to users
ALTER TABLE app_secretariat.form_templates
  ADD COLUMN IF NOT EXISTS user_visible BOOLEAN NOT NULL DEFAULT false;

-- Update the public view to expose the new column
CREATE OR REPLACE VIEW public.form_templates AS
  SELECT * FROM app_secretariat.form_templates;

GRANT SELECT ON public.form_templates TO authenticated;
GRANT ALL    ON public.form_templates TO service_role;
