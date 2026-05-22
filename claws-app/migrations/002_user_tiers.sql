-- 002_user_tiers.sql
-- Replace the binary mapping_enabled flag with an explicit access tier.
--
-- Tiers (mutually exclusive):
--   pending         New user, awaiting admin approval (default)
--   none            Explicitly denied access
--   map_once_daily  Can run 1 live lookup per day; cached zones always free
--   trial           Full access until trial_ends_at
--
-- is_admin remains a separate flag layered on top — an admin always has
-- access regardless of tier, and (per the dashboard) can approve/disable
-- other users.

alter table app_claws.users
  add column if not exists tier text not null default 'pending'
    check (tier in ('pending', 'none', 'map_once_daily', 'trial')),
  add column if not exists trial_ends_at   timestamptz,
  add column if not exists daily_map_count integer not null default 0,
  add column if not exists daily_map_day   date;

-- Backfill: any pre-existing user with mapping access becomes a 30-day
-- trial so the master admin and bootstrap admins keep working uninterrupted.
-- Guarded so the whole migration is safe to re-run after mapping_enabled
-- has already been dropped.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'app_claws'
      and table_name   = 'users'
      and column_name  = 'mapping_enabled'
  ) then
    execute $sql$
      update app_claws.users
         set tier          = 'trial',
             trial_ends_at = now() + interval '30 days'
       where mapping_enabled = true
         and tier            = 'pending'
    $sql$;
  end if;
end
$$;

-- mapping_enabled is superseded by the tier + is_admin model; drop it so
-- it can't drift out of sync.
alter table app_claws.users drop column if exists mapping_enabled;
