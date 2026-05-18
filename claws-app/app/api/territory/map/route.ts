import { NextRequest, NextResponse } from 'next/server'
import { postalToLatLng } from '@/lib/onemap'
import { discoverNearby, getPlaceDetails, inferSector } from '@/lib/google-places'
import { scrapeSite } from '@/lib/web-scrape'
import { scoreBusiness, aggregateZone } from '@/lib/signal-scoring'
import { generateReport } from '@/lib/demo-report'
import { cacheGet, cacheSet, ttlForPostal } from '@/lib/cache'
import { getClientIp } from '@/lib/rate-limit'
import {
  isOverBudget, recordLookupSpend, getTodaySpend, getDailyCap,
  isIpOverBudget, getIpSpend, getIpDailyCap,
} from '@/lib/spend-tracker'
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
// Public route. Guardrails:
//   - Per-IP daily SGD cap   (MAX_DAILY_SPEND_PER_IP_SGD, default 20)
//   - Global daily SGD cap   (MAX_DAILY_SPEND_SGD, default 20) — safety net
//   - cache_only mode for personalised prospect links (always free)
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

  // ── Per-IP daily SGD cap (primary defence) ──────────────────────────────
  // Each IP gets MAX_DAILY_SPEND_PER_IP_SGD per day. Generous enough that a
  // genuine prospect can try a handful of postal codes; restrictive enough
  // that an abuser hitting 100 codes burns out of their own budget fast.
  if (isIpOverBudget(ip)) {
    return NextResponse.json({
      error: "You've used your free demo budget for today. Try a sample zone below, or come back tomorrow.",
      ip_spend_capped: true,
      ip_cap_sgd:      getIpDailyCap(),
      ip_spent_sgd:    Number(getIpSpend(ip).toFixed(2)),
    }, { status: 429 })
  }

  // ── Global daily SGD cap (safety net across all IPs) ────────────────────
  if (isOverBudget()) {
    return NextResponse.json({
      error: 'Our demo is at high demand today — try one of our example zones, or come back tomorrow.',
      spend_capped:    true,
      daily_cap_sgd:   getDailyCap(),
      today_spent_sgd: Number(getTodaySpend().toFixed(2)),
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

  // Enrich the TOP 10 — the UI renders 10 named businesses anyway, and each
  // Place Details call is the most expensive line item (~SGD 0.023). Dropping
  // from 20 → 10 cuts per-lookup cost by ~30% (~SGD 0.23) with zero visible
  // change in the report.
  const subset = places.slice(0, 10)
  const tEnrich = Date.now()
  const enriched = await Promise.all(subset.map(async p => {
    const details = await getPlaceDetails(p.place_id)
    if (!details) return null
    const site = details.website ? await scrapeSite(details.website) : null
    const sector = inferSector(details.types)
    return scoreBusiness(details, site, sector)
  }))
  stage('enrich (parallel x10)', tEnrich)

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

  await cacheSet(cacheKey, report, ttlForPostal(postalCode))
  recordLookupSpend(ip)
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
