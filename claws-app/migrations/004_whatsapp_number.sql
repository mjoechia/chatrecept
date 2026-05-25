-- 004_whatsapp_number.sql
-- Capture each user's WhatsApp number at signup so admins can contact
-- them and so we can later wire a WhatsApp OTP verification / sign-in
-- flow (replacing the current email-password path).

alter table app_claws.users
  add column if not exists whatsapp_number text;
