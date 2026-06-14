-- 008_trial_limited_tier_constraint.sql
-- Update the tier check constraint to allow 'trial_limited' tier added in 007.
-- Drop the old constraint and add a new one that includes all valid tiers.

alter table app_claws.users
  drop constraint users_tier_check,
  add constraint users_tier_check check (tier in ('pending', 'none', 'map_once_daily', 'trial', 'trial_limited'));
