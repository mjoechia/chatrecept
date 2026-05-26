import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/lookups?range=today|7d|30d|all&status=...&sector=...&uncontacted=1
//
// Returns demo_lookups rows for the admin dashboard. All filters are
// optional; defaults to last-30-days, all statuses, all sectors.
// Capped at 500 rows for now — plenty for the foreseeable future and
// avoids loading megabytes when the table grows.
const MAX_ROWS = 500

const RANGE_DAYS: Record<string, number | null> = {
  today: 1,
  '7d':  7,
  '30d': 30,
  all:   null,
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const url    = new URL(req.url)
  const range  = url.searchParams.get('range')  ?? '30d'
  const status = url.searchParams.get('status') // 'new' | 'contacted' | ...
  const sector = url.searchParams.get('sector') // exact match on top_sector
  const uncontacted = url.searchParams.get('uncontacted') === '1'

  const svc = createServiceClient()
  let q = svc.from('demo_lookups').select('*').order('created_at', { ascending: false }).limit(MAX_ROWS)

  const days = RANGE_DAYS[range] ?? RANGE_DAYS['30d']
  if (days !== null && days !== undefined) {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    q = q.gte('created_at', since)
  }
  if (status) q = q.eq('status', status)
  if (sector) q = q.eq('top_sector', sector)
  if (uncontacted) q = q.eq('status', 'new')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Surface the distinct sector list so the UI can build the filter chips
  // without a second round-trip. Computed from this page's results — fine
  // when most sectors appear in the last 30 days.
  const sectors = Array.from(
    new Set((data ?? []).map(r => r.top_sector).filter((s): s is string => !!s)),
  ).sort()

  return NextResponse.json({ rows: data ?? [], sectors })
}
