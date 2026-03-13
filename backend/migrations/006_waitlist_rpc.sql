-- RPC wrapper so webfront (anon key) can insert into app_chatrecept.waitlist
-- without needing app_chatrecept exposed via PostgREST schema routing.
-- SECURITY DEFINER runs as the function owner (postgres/service_role), which
-- has full access to app_chatrecept.

CREATE OR REPLACE FUNCTION public.join_waitlist(
    p_name     TEXT,
    p_email    TEXT,
    p_telegram TEXT DEFAULT NULL,
    p_whatsapp TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_chatrecept, public
AS $$
BEGIN
    INSERT INTO app_chatrecept.waitlist (name, email, telegram, whatsapp)
    VALUES (p_name, p_email, p_telegram, p_whatsapp)
    ON CONFLICT (email) DO NOTHING;
END;
$$;

-- Allow the anon role to call this function
GRANT EXECUTE ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT, TEXT) TO anon;
