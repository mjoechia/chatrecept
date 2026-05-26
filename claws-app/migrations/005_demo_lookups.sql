-- 005_demo_lookups.sql
-- Persistent log of every postcode lookup. Unlocks the strategic queries:
-- repeated-zone detection, sector × district intelligence, hook→conversion
-- correlation, and lead lifecycle tracking. Phase 1 of the territory-
-- intelligence layer.

create table if not exists app_claws.demo_lookups (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),

  -- Identity. user_id is null for anonymous cache hits (someone hits a
  -- pre-warmed prospect link before authenticating).
  user_id                 uuid references app_claws.users(id) on delete set null,
  email                   text,
  whatsapp_number         text,
  name                    text,

  -- Request
  postcode                text not null,
  cached                  boolean not null default false,
  lookup_session_id       uuid,

  -- Report snapshot (only fields we want to filter / aggregate on later)
  district_label          text,
  top_sector              text,
  total_businesses        integer,
  enriched_count          integer,
  high_opportunity_count  integer,
  sample_outreach_hook    text,
  estimated_value_sgd     numeric,

  -- Cost attribution
  cost_sgd                numeric,

  -- Marketing attribution
  ip_address              text,
  user_agent              text,
  utm_source              text,
  utm_medium              text,
  utm_campaign            text,
  prospect_handle         text,

  -- Engagement lifecycle (denormalised on the row per "velocity > purity")
  status                  text not null default 'new',
  contacted_at            timestamptz,
  meeting_booked          boolean not null default false,
  meeting_completed       boolean not null default false,
  notes                   text
);

create index if not exists demo_lookups_created_idx  on app_claws.demo_lookups (created_at desc);
create index if not exists demo_lookups_user_idx     on app_claws.demo_lookups (user_id, created_at desc);
create index if not exists demo_lookups_postcode_idx on app_claws.demo_lookups (postcode);
create index if not exists demo_lookups_status_idx   on app_claws.demo_lookups (status) where status not in ('won', 'lost', 'dropped');
create index if not exists demo_lookups_session_idx  on app_claws.demo_lookups (lookup_session_id) where lookup_session_id is not null;
