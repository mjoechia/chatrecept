// Persistent lookup logger. Records every territory map call to
// app_claws.demo_lookups so the admin dashboard can reason about leads
// across sessions, and so commercial questions ("repeated zones",
// "hook→conversion", "spend per lead") become queryable.
//
// Fire-and-forget at the call site (`.catch(console.error)`) so a
// Supabase write blip never tanks a user-facing lookup.

import { createServiceClient } from './supabase'
import type { TerritoryReport } from './demo-report'
import type { ClawsUser } from './claws-users'

export interface UtmTags {
  src?:      string
  medium?:   string
  campaign?: string
  prospect?: string
}

export interface RecordLookupArgs {
  postcode:        string
  cached:          boolean
  report:          TerritoryReport
  user?:           ClawsUser | null
  ip?:             string
  userAgent?:      string | null
  sessionId?:      string | null
  utm?:            UtmTags
}

// Per-lookup cost when fresh (matches the value passed to recordUserSpend
// in map/route.ts). Cache hits cost us nothing since they short-circuit
// before any paid API call.
const COST_PER_FRESH_LOOKUP_SGD = 0.95

export async function recordLookup(args: RecordLookupArgs): Promise<void> {
  const svc = createServiceClient()
  const topSector = args.report.composition.sectors[0]?.sector ?? null

  const row = {
    user_id:                args.user?.id           ?? null,
    email:                  args.user?.email        ?? null,
    whatsapp_number:        args.user?.whatsapp_number ?? null,
    name:                   args.user?.name         ?? null,

    postcode:               args.postcode,
    cached:                 args.cached,
    lookup_session_id:      args.sessionId ?? null,

    district_label:         args.report.district_label,
    top_sector:             topSector,
    total_businesses:       args.report.total_count,
    enriched_count:         args.report.enriched_count,
    high_opportunity_count: args.report.breakdown.high_opportunity,
    sample_outreach_hook:   args.report.sample_hook,
    // estimated_value_sgd left null per plan — backfill once we calibrate
    // from real conversion data.

    cost_sgd:               args.cached ? 0 : COST_PER_FRESH_LOOKUP_SGD,

    ip_address:             args.ip          ?? null,
    user_agent:             args.userAgent   ?? null,
    utm_source:             args.utm?.src      ?? null,
    utm_medium:             args.utm?.medium   ?? null,
    utm_campaign:           args.utm?.campaign ?? null,
    prospect_handle:        args.utm?.prospect ?? null,
  }

  const { error } = await svc.from('demo_lookups').insert(row)
  if (error) {
    // Surfaced via the caller's .catch — don't throw and break the response.
    throw new Error(`demo_lookups insert failed: ${error.message}`)
  }
}
