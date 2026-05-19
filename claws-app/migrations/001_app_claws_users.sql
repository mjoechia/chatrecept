-- 001_app_claws_users.sql
-- Bootstrap migration for JC CLAWs.
--
-- Creates the app_claws schema and its users table. One row per authenticated
-- Google-OAuth user, joined to Supabase auth.users by auth_user_id. The app
-- tracks per-user mapping eligibility, admin status, and daily spend.
--
-- After running this in the Supabase SQL Editor, also add `app_claws` to
-- the API "Exposed schemas" list (Project Settings → API), otherwise
-- PostgREST returns "Invalid schema: app_claws".

create schema if not exists app_claws;
grant usage on schema app_claws to postgres, service_role, authenticated, anon;

create table if not exists app_claws.users (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  email           text not null,
  name            text,
  mapping_enabled boolean not null default true,
  is_admin        boolean not null default false,
  spend_today_sgd numeric(10,2) not null default 0,
  spend_day       date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists users_email_idx on app_claws.users (lower(email));

grant all on app_claws.users to postgres, service_role;
alter default privileges in schema app_claws grant all on tables to postgres, service_role;
