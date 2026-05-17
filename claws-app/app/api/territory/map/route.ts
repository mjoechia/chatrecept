import { NextRequest, NextResponse } from 'next/server'
import { postalToLatLng } from '@/lib/onemap'
import { searchNearby, getPlaceDetails, inferSector } from '@/lib/google-places'
import { scrapeSite } from '@/lib/web-scrape'
import { scoreBusiness, aggregateZone } from '@/lib/signal-scoring'
import { generateReport } from '@/lib/demo-report'
import { cacheGet, cacheSet, TTL } from '@/lib/cache'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import type { TerritoryReport } from '@/lib/demo-report'

export const dynamic = 'force-dynamic'

// POST /api/territory/map { postal_code }
// Public route, rate-limited 1/IP/day
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const limit = checkRateLimit(ip, 1)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You've used your free try for today. Enter your email below to try another postal code.",
        reset_at: limit.resetAt },
      { status: 429 }
    )
  }

  let body: { postal_code?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const postalCode = (body.postal_code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(postalCode)) {
    return NextResponse.json({ error: 'Please enter a valid 6-digit Singapore postal code' }, { status: 400 })
  }

  // Check territory cache first (30-day TTL — biggest cost saver)
  const cacheKey = `territory:${postalCode}`
  const cached = await cacheGet<TerritoryReport>(cacheKey)
  if (cached) {
    return NextResponse.json({ ...cached, cached: true })
  }

  // Step 1: postal → lat/lng (free)
  const location = await postalToLatLng(postalCode)
  if (!location) {
    return NextResponse.json({ error: 'Postal code not found in Singapore' }, { status: 404 })
  }

  // Step 2: nearby businesses (Google Places Nearby Search)
  const places = await searchNearby(location.latitude, location.longitude, 500)
  if (places.length === 0) {
    return NextResponse.json({
      error: 'No businesses found in this zone. Try a different postal code.',
    }, { status: 404 })
  }

  // Step 3 + 4: details + site scrape (in parallel, capped at 20)
  const subset = places.slice(0, 20)
  const enriched = await Promise.all(subset.map(async p => {
    const details = await getPlaceDetails(p.place_id)
    if (!details) return null
    const site = details.website ? await scrapeSite(details.website) : null
    const sector = inferSector(details.types)
    return scoreBusiness(details, site, sector)
  }))

  const businesses = enriched.filter(b => b !== null)
  if (businesses.length === 0) {
    return NextResponse.json({
      error: 'Could not gather details for businesses in this zone',
    }, { status: 500 })
  }

  // Step 5: aggregate scores + generate report
  const zone = aggregateZone(businesses)
  const report = await generateReport(postalCode, location.address, businesses, zone)

  await cacheSet(cacheKey, report, TTL.TERRITORY)
  return NextResponse.json(report)
}
