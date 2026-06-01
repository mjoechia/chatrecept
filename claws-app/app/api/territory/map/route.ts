import { NextRequest, NextResponse } from 'next/server'
import { postalToLatLng } from '@/lib/onemap'
import { discoverNearby, getPlaceDetails, inferSector } from '@/lib/google-places'
import { scrapeSite } from '@/lib/web-scrape'
import { scoreBusiness, aggregateZone } from '@/lib/signal-scoring'
import { generateReport } from '@/lib/demo-report'
import { cacheGet, cacheSet, ttlForPostal } from '@/lib/cache'
import { getClientIp } from '@/lib/rate-limit'
import { isOverBudget, recordLookupSpend, isIpOverBudget } from '@/lib/spend-tracker'
import { requireUser } from '@/lib/admin'
import { recordUserSpend, consumeDailyMapAttempt } from '@/lib/claws-users'
import { evaluateLookupPolicy } from '@/lib/limits'
import { checkBurst, recordBurst } from '@/lib/burst-limit'
import { recordLookup, hasRecentLookup } from '@/lib/lookup-log'
import type { TerritoryReport } from '@/lib/demo-report'

export const dynamic = 'force-dynamic'

interface MapRequestBody {
  postal_code?:  string
  cache_only?:   boolean   // if true, never run live lookup — return 503 if uncached
  from_history?: boolean   // true when re-opened from the user's "Recent searches" panel
  session_id?:   string    // lookup_session cookie value — groups multi-zone sessions
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
    recordLookup({
      postcode:  postalCode,
      cached:    true,
      report:    cached,
      ip,
      userAgent: req.headers.get('user-agent'),
      sessionId: body.session_id ?? null,
      utm:       body.utm,
      // user not resolved on cache path (no auth check yet) — admin will
      // see this row anonymised, which is correct for prospect-link hits.
    }).catch(e => console.error('[map] recordLookup (cached) failed', e))
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

  // ── Auth gate (live lookups require a logged-in user) ──────────────────
  const auth = await requireUser()
  if (!auth.ok) return auth.error
  const claws = auth.user

  // ── Policy engine (Phase 1: tier + daily count + daily SGD + monthly SGD) ──
  // Dedup window first (Lever 5): same user + same postcode within 24h gets
  // the same free-pass treatment as from_history. Caller-driven dedup also
  // applies via body.from_history (Recent Searches + Sample zones).
  const dedupHit = body.from_history === true
    ? true
    : await hasRecentLookup({ userId: claws.id, postcode: postalCode })

  const policy = evaluateLookupPolicy(claws, {
    postcode: postalCode,
    dedupHit,
  })
  if (!policy.allowed) {
    return NextResponse.json({
      error:          policy.copy,
      access_blocked: policy.status === 403,
      capped:         policy.status === 429,
      reason:         policy.reason,
      detail:         policy.detail,
    }, { status: policy.status })
  }

  // ── Burst limit (Lever 4) — only after policy decides we'd run live ────
  // Read-only check first; recording happens once we commit to the pipeline
  // (after the IP / global caps below).
  if (!dedupHit) {
    const burst = checkBurst(claws.id)
    if (!burst.ok) {
      return NextResponse.json({
        error:  `Whoa — that's a lot of zones in a few minutes. Try again in ~${burst.retryAfterSec}s.`,
        reason: 'burst',
        retry_after_sec: burst.retryAfterSec,
      }, { status: 429 })
    }
  }

  // ── Per-IP daily SGD cap (defence-in-depth) ─────────────────────────────
  // Each IP gets MAX_DAILY_SPEND_PER_IP_SGD per day. Generous enough that a
  // genuine prospect can try a handful of postal codes; restrictive enough
  // that an abuser hitting 100 codes burns out of their own budget fast.
  // Response intentionally omits the dollar figures — pricing detail stays
  // out of user-visible envelopes.
  if (isIpOverBudget(ip)) {
    return NextResponse.json({
      error: "You've used your free demo budget for today. Try a sample zone below, or come back tomorrow.",
      ip_spend_capped: true,
    }, { status: 429 })
  }

  // ── Global daily SGD cap (safety net across all IPs) ────────────────────
  if (isOverBudget()) {
    return NextResponse.json({
      error: 'Our demo is at high demand today — try one of our example zones, or come back tomorrow.',
      spend_capped: true,
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

  // Enrich the TOP 20. Each Place Details call is ~SGD 0.023, so per-lookup
  // cost is ~SGD +0.23 vs the previous 10-cap — accepted in exchange for
  // doubling the contactable rows shown to the user. UI in TerritoryReportView
  // renders whatever's returned; no further changes needed downstream.
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

  await cacheSet(cacheKey, report, ttlForPostal(postalCode))
  recordLookupSpend(ip)

  // Dedup-hit lookups don't charge the user at all (the same zone was
  // recently paid for — Lever 5). The cache was just cold; the user
  // shouldn't pay twice. Non-dedup live lookups consume spend + daily
  // count + burst slot.
  if (!dedupHit) {
    recordBurst(claws.id)
    await recordUserSpend(claws.auth_user_id, 0.95).catch(e =>
      console.error('[map] recordUserSpend failed', e)
    )
    // Daily count bumped for ALL tiers now (Phase 1 / Lever 1) — trial
    // users get a fresh-count cap too, not just map_once_daily.
    // Skipped when from_history=true: Sample zones and Recent Searches
    // re-opens stay free even on cache miss.
    if (!body.from_history) {
      await consumeDailyMapAttempt(claws.auth_user_id).catch(e =>
        console.error('[map] consumeDailyMapAttempt failed', e)
      )
    }
  }
  recordLookup({
    postcode:  postalCode,
    cached:    false,
    report,
    user:      claws,
    ip,
    userAgent: req.headers.get('user-agent'),
    sessionId: body.session_id ?? null,
    utm:       body.utm,
  }).catch(e => console.error('[map] recordLookup (fresh) failed', e))

  console.log(`[map ${postalCode}] TOTAL ${Date.now() - t0}ms`)
  return NextResponse.json(report)
}
