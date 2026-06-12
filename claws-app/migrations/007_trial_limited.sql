-- 007_trial_limited.sql
-- Trial limited tier: admins set a total lookup count limit over a custom window (days).
-- E.g., 10 lookups over 7 days. After the window expires, the counter resets.
--
-- Pairs with the existing daily_map_count tracking. trial_limited users get:
-- - trial_limited_count_max: total lookups allowed in the window
-- - trial_limited_window_days: window size in days
-- - trial_limited_window_start: when current window started (ISO 8601 string)
--
-- When the current date is >= window_start + window_days, the window resets and
-- counter is zeroed out by the policy evaluation logic (limits.ts).

alter table app_claws.users
  add column if not exists trial_limited_count_max integer,
  add column if not exists trial_limited_window_days integer,
  add column if not exists trial_limited_window_start text;
