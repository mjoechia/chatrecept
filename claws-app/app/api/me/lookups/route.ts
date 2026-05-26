import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/me/lookups
// Returns the signed-in user's own past searches, deduped by postcode so
// the same zone tapped 5 times doesn't clog the list. Most recent per
// postcode wins. Used by the "Recent searches" panel on AuthedHome.
//
// Capped at 10 unique zones — enough for muscle memory without scrolling.
const MAX_UNIQUE_ZONES = 10
const FETCH_LIMIT      = 50

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.error
  const claws = auth.user

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('demo_lookups')
    .select('id, created_at, postcode, district_label, top_sector, high_opportunity_count, total_businesses, cached')
    .eq('user_id', claws.id)
    .order('created_at', { ascending: false })
    .limit(FETCH_LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dedupe by postcode (keep most recent — rows are already DESC).
  const seen = new Set<string>()
  const unique: typeof data = []
  for (const row of data ?? []) {
    if (seen.has(row.postcode)) continue
    seen.add(row.postcode)
    unique.push(row)
    if (unique.length >= MAX_UNIQUE_ZONES) break
  }

  return NextResponse.json({ rows: unique })
}
