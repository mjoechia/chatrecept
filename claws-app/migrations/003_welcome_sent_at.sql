-- 003_welcome_sent_at.sql
-- Track when an admin sent the welcome / set-password email to a user, so
-- the admin dashboard can show "Last sent X" and admins can tell at a
-- glance who's been invited vs who's been left sitting in pending.

alter table app_claws.users
  add column if not exists welcome_sent_at timestamptz;
