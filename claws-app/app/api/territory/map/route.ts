import { NextRequest, NextResponse } from 'next/server'
import { postalToLatLng } from '@/lib/onemap'
import { discoverNearby, getPlaceDetails, inferSector } from '@/lib/google-places'
import { scrapeSite } from '@/lib/web-scrape'
import { scoreBusiness, aggregateZone } from '@/lib/signal-scoring'
import { generateReport } from '@/lib/demo-report'
import { cacheGet, cacheSet, TTL } from '@/lib/cache'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isOverBudget, recordLookupSpend, getTodaySpend, getDailyCap } from '@/lib/spend-tracker'
import type { TerritoryReport } from '@/lib/demo-report'

export const dynamic = 'force-dynamic'

interface MapRequestBody {
  postal_code?: string
  cache_only?:  boolean    // if true, never run live lookup — return 503 if uncached
  utm?: {
    src?:      string
    medium?:   string
    campaign?: string
    prospect?: string      // optional prospect handle from personalised links
  }
}

// POST /api/territory/map { postal_code, cache_only?, utm? }
// Public route, rate-limited 1/IP/day.
// Guardrails:
//   - Rate limit per IP
//   - Global daily spend cap (MAX_DAILY_SPEND_SGD)
//   - cache_only mode for personalised prospect links
//   - UTM passthrough for attribution
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)

  let body: MapRequestBody
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const postalCode = (body.postal_code ?? '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(postalCode)) {
    return NextResponse.json({ error: 'Please enter a valid 6-digit Singapore postal code' }, { status: 400 })
  }

  // ── Cache check first (free, always allowed) ─────────────────────────────
  const cacheKey = `territory:${postalCode}`
  const cached = await cacheGet<TerritoryReport>(cacheKey)
  if (cached) {
    logLookup({ postalCode, ip, cached: true, utm: body.utm })
    return NextResponse.json({ ...cached, cached: true })
  }

  // ── cache_only mode (personalised prospect links) ───────────────────────
  // Prospect links should ALWAYS hit cache. If they don't, the operator
  // forgot to pre-warm — surface that gracefully without spending API.
  if (body.cache_only) {
    return NextResponse.json({
      error: 'This zone is being prepared. Try again in a few minutes, or contact us for an instant report.',
      cache_only: true,
    }, { status: 503 })
  }

  // ── Rate limit (visitors only — admin warm endpoint bypasses) ───────────
  const limit = checkRateLimit(ip, 1)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "You've used your free try for today. Enter your email below to try another postal code.",
        reset_at: limit.resetAt },
      { status: 429 }
    )
  }

  // ── Global daily spend cap ──────────────────────────────────────────────
  if (isOverBudget()) {
    return NextResponse.json({
      error: 'Our demo is at high demand today — try one of our example zones, or come back tomorrow.',
      spend_capped: true,
      daily_cap_sgd:  getDailyCap(),
      today_spent_sgd: getTodaySpend(),
    }, { status: 429 })
  }

  // ── Live pipeline ───────────────────────────────────────────────────────
  const t0 = Date.now()
  const stage = (name: string, started: number) =>
    console.log(`[map ${postalCode}] ${name} took ${Date.now() - started}ms`)

  const tGeo = Date.now()
  const location = await postalToLatLng(postalCode)
  stage('geocode', tGeo)
  if (!location) {
    console.warn(`[map ${postalCode}] geocode returned null`)
    return NextResponse.json({ error: 'Postal code not found in Singapore' }, { status: 404 })
  }
  console.log(`[map ${postalCode}] geocoded -> ${location.latitude},${location.longitude} (${location.address})`)

  const tSearch = Date.now()
  const { places, saturated } = await discoverNearby(location.latitude, location.longitude, 500)
  stage('nearby_search (popularity + distance, deduped)', tSearch)
  console.log(`[map ${postalCode}] discovered ${places.length} unique places · saturated=${saturated}`)
  if (places.length === 0) {
    return NextResponse.json({
      error: 'No businesses found in this zone. Try a different postal code.',
    }, { status: 404 })
  }

  const subset = places.slice(0, 20)
  const tEnrich = Date.now()
  const enriched = await Promise.all(subset.map(async p => {
    const details = await getPlaceDetails(p.place_id)
    if (!details) return null
    const site = details.website ? await scrapeSite(details.website) : null
    const sector = inferSector(details.types)
    return scoreBusiness(details, site, sector)
  }))
  stage('enrich (parallel x20)', tEnrich)

  const businesses = enriched.filter(b => b !== null)
  console.log(`[map ${postalCode}] enriched ${businesses.length}/${subset.length}`)
  if (businesses.length === 0) {
    return NextResponse.json({ error: 'Could not gather details for businesses in this zone' }, { status: 500 })
  }

  const tReport = Date.now()
  const zone   = aggregateZone(businesses)
  const report = await generateReport(postalCode, location.address, businesses, zone, {
    totalCount: places.length,
    saturated,
  })
  stage('claude_report', tReport)

  await cacheSet(cacheKey, report, TTL.TERRITORY)
  recordLookupSpend()
  logLookup({ postalCode, ip, cached: false, utm: body.utm })

  console.log(`[map ${postalCode}] TOTAL ${Date.now() - t0}ms`)
  return NextResponse.json(report)
}

function logLookup(args: {
  postalCode: string
  ip: string
  cached: boolean
  utm?: MapRequestBody['utm']
}): void {
  // TODO: persist to Supabase demo_lookups table once schema lands
  console.log('[demo lookup]', {
    ts: new Date().toISOString(),
    postal_code: args.postalCode,
    ip: args.ip,
    cached: args.cached,
    utm_src:      args.utm?.src      ?? null,
    utm_medium:   args.utm?.medium   ?? null,
    utm_campaign: args.utm?.campaign ?? null,
    prospect:     args.utm?.prospect ?? null,
  })
}
