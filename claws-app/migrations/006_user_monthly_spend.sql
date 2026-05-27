-- 006_user_monthly_spend.sql
-- Per-user monthly SGD spend bucket. Pairs with the existing
-- spend_today_sgd / spend_day pair from migration 001. Rolls at midnight
-- UTC on the 1st of each month (text 'YYYY-MM' bucket key). Resets to 0
-- when admin grants/extends trial via /admin or Send Welcome.
--
-- Default cap: SGD 150 (env MAX_MONTHLY_SPEND_PER_USER_SGD on Railway).

alter table app_claws.users
  add column if not exists spend_month_sgd numeric not null default 0,
  add column if not exists spend_month     text;
