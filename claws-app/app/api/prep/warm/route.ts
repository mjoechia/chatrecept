import { NextRequest, NextResponse } from 'next/server'
import { postalToLatLng } from '@/lib/onemap'
import { searchNearby, getPlaceDetails, inferSector } from '@/lib/google-places'
import { scrapeSite } from '@/lib/web-scrape'
import { scoreBusiness, aggregateZone } from '@/lib/signal-scoring'
import { generateReport } from '@/lib/demo-report'
import { cacheGet, cacheSet, TTL } from '@/lib/cache'
import type { TerritoryReport } from '@/lib/demo-report'

export const dynamic = 'force-dynamic'

// POST /api/prep/warm { postal_code, secret }
// Admin-only — pre-runs the lookup pipeline so the cached result is ready
// before a prospect clicks their personalised link. Bypasses rate limit and
// daily spend cap (admin use, intentional cost).
//
// Usage (from your laptop):
//   curl -X POST https://claws.chatrecept.chat/api/prep/warm \
//     -H 'Content-Type: application/json' \
//     -d '{"postal_code":"238802","secret":"<WARM_TOKEN>"}'
export async function POST(req: NextRequest) {
  let body: { postal_code?: string; secret?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const expected = process.env.WARM_TOKEN
  if (!expected) {
    return NextResponse.json({ error: 'WARM_TOKEN not configured' }, { status: 500 })
  }
  if (body.secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const postalCode = (body.postal_code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(postalCode)) {
    return NextResponse.json({ error: 'Invalid postal code' }, { status: 400 })
  }

  const cacheKey = `territory:${postalCode}`
  const force = req.nextUrl.searchParams.get('force') === '1'
  const existing = await cacheGet<TerritoryReport>(cacheKey)
  if (existing && !force) {
    return NextResponse.json({ status: 'already_cached', postal_code: postalCode })
  }

  const location = await postalToLatLng(postalCode)
  if (!location) return NextResponse.json({ error: 'Postal code not found' }, { status: 404 })

  const places = await searchNearby(location.latitude, location.longitude, 500)
  if (places.length === 0) return NextResponse.json({ error: 'No businesses found in zone' }, { status: 404 })

  const subset = places.slice(0, 20)
  const enriched = await Promise.all(subset.map(async p => {
    const details = await getPlaceDetails(p.place_id)
    if (!details) return null
    const site = details.website ? await scrapeSite(details.website) : null
    return scoreBusiness(details, site, inferSector(details.types))
  }))

  const businesses = enriched.filter(b => b !== null)
  if (businesses.length === 0) {
    return NextResponse.json({ error: 'Could not enrich businesses' }, { status: 500 })
  }

  const zone   = aggregateZone(businesses)
  const report = await generateReport(postalCode, location.address, businesses, zone)
  await cacheSet(cacheKey, report, TTL.TERRITORY)

  return NextResponse.json({
    status: 'warmed',
    postal_code:  postalCode,
    address:      location.address,
    total_count:  report.total_count,
  })
}
