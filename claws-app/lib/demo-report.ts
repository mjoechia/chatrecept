// Demo report generator — uses Claude Haiku to write the sample outreach hook.
// All other report fields are deterministic from the scoring engine.

import Anthropic from '@anthropic-ai/sdk'
import type { ScoredBusiness, ZoneScores } from './signal-scoring'
import { districtFromPostal } from './sg-districts'

export interface TerritoryReport {
  postal_code:     string
  district_label:  string  // friendly area name from postal prefix, e.g. "Cecil / Tanjong Pagar"
  address_label:   string  // raw geocoded address (e.g. "Singapore 048623")
  total_count:    number   // unique businesses we discovered (post-dedupe)
  total_saturated: boolean // true when Google API hit its cap — there are more in this zone than we fetched
  enriched_count: number   // subset of total_count that we deep-enriched (capped at 20)
  zone_scores:    ZoneScores
  // Multi-dimensional headline breakdown for the report header. Same data
  // we already have, just framed as multiple lenses on the zone.
  breakdown: {
    buildings:        number   // distinct buildings inferred from name patterns
    sectors:          number   // # of represented sectors
    active_listings:  number   // mirrors total_count for clarity in copy
    high_opportunity: number   // mobile + currently-active businesses
  }
  composition: {
    sectors: { sector: string; count: number }[]
    has_mobile_count: number
    has_whatsapp_count: number
    has_email_count: number
    has_social_count: number  // IG or FB
  }
  opportunity: {
    likely_active:    number
    lower_activity:   number
  }
  sample_hook: string
  // Top enriched businesses with full contact details — what prospects see in
  // the free demo. Caps at 10 (the rest stay behind the paywall as part of
  // the activation value prop).
  enriched_businesses: Array<{
    name:             string
    sector:           string
    phone:            string | null
    website:          string | null
    email:            string | null
    instagram_handle: string | null
    facebook_page:    string | null
    whatsapp_link:    string | null
    activity_signal:  string
    reachability_score: number
  }>
}

const HAIKU = 'claude-haiku-4-5-20251001'
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

export async function generateReport(
  postalCode: string,
  addressLabel: string,
  businesses: ScoredBusiness[],
  zone: ZoneScores,
  opts: { totalCount: number; saturated: boolean },
): Promise<TerritoryReport> {
  const topSector = mostCommon(businesses.map(b => b.sector))
  const district  = simplifyArea(addressLabel)

  const sample_hook = await generateHook(district, topSector)

  // Sector counts
  const sectorMap = new Map<string, number>()
  for (const b of businesses) sectorMap.set(b.sector, (sectorMap.get(b.sector) ?? 0) + 1)
  const sectors = [...sectorMap.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count)

  // Top 10 enriched businesses with names + full contact details for the demo.
  // Ordered by reachability score (best first), filtered to those with at
  // least a phone number (otherwise there's nothing to act on).
  const enriched_businesses = [...businesses]
    .filter(b => b.has_phone)
    .sort((a, b) => b.reachability_score - a.reachability_score)
    .slice(0, 10)
    .map(b => ({
      name:               b.name,
      sector:             b.sector,
      phone:              b.phone,
      website:            b.website,
      email:              b.email,
      instagram_handle:   b.instagram_handle,
      facebook_page:      b.facebook_page,
      whatsapp_link:      b.whatsapp_link,
      activity_signal:    b.activity_signal,
      reachability_score: b.reachability_score,
    }))

  // Building count — distinct anchor names extracted from the enriched list.
  // Common SG anchors (malls, towers, hubs) appear as prefix patterns in
  // business names. Falls back to a density estimate when patterns don't match.
  const buildings = countDistinctBuildings(businesses) ||
                    Math.max(1, Math.ceil(businesses.length / 3))

  // High-opportunity: has a mobile number AND is currently active. These are
  // the ones an SDR would prioritise on day 1.
  const high_opportunity = businesses
    .filter(b => b.has_mobile && b.activity_signal === 'Active')
    .length

  return {
    postal_code:     postalCode,
    district_label:  districtFromPostal(postalCode),
    address_label:   addressLabel,
    total_count:     opts.totalCount,
    total_saturated: opts.saturated,
    enriched_count:  businesses.length,
    zone_scores:     zone,
    breakdown: {
      buildings,
      sectors:          sectors.length,
      active_listings:  opts.totalCount,
      high_opportunity,
    },
    composition: {
      sectors,
      has_mobile_count:   businesses.filter(b => b.has_mobile).length,
      has_whatsapp_count: businesses.filter(b => b.has_whatsapp).length,
      has_email_count:    businesses.filter(b => b.has_email).length,
      has_social_count:   businesses.filter(b => b.has_instagram || b.has_facebook).length,
    },
    opportunity: {
      likely_active:    businesses.filter(b => b.activity_signal !== 'Lower recent activity').length,
      lower_activity:   businesses.filter(b => b.activity_signal === 'Lower recent activity').length,
    },
    sample_hook,
    enriched_businesses,
  }
}

async function generateHook(district: string, sector: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Graceful fallback if no API key
    return `Hi [Business] 👋 We work with ${sector} businesses in ${district} on targeted WhatsApp campaigns. Worth a 15-min chat this week?`
  }

  const prompt = `Write a single short WhatsApp outreach message (max 280 chars) from a generic SME growth service to a ${sector} business in ${district}, Singapore. Use a friendly Singaporean professional tone. Include one emoji. End with a clear ask. Output only the message — no quotes, no explanation.`

  const res = await client().messages.create({
    model: HAIKU,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content[0]
  if (text.type === 'text') return text.text.trim()
  return `Hi [Business] 👋 We work with ${sector} businesses in ${district}. Worth a 15-min chat?`
}

// Distinct buildings inferred from business name patterns. Many SG addresses
// share a building prefix ("ION Orchard - Starbucks", "ION Orchard - Sephora").
// We look for repeated anchor tokens to estimate building count.
function countDistinctBuildings(businesses: ScoredBusiness[]): number {
  if (businesses.length === 0) return 0
  const buildingMatchers: { re: RegExp; key: string }[] = [
    { re: /\b(ion\s*orchard|paragon|takashimaya|wisma\s*atria|ngee\s*ann|tangs|lucky\s*plaza|forum|mandarin\s*gallery|313)\b/i, key: 'orchard' },
    { re: /\b(suntec|marina\s*square|raffles\s*city|millenia|esplanade)\b/i, key: 'marina' },
    { re: /\b(jewel|changi\s*airport)\b/i, key: 'changi' },
    { re: /\b(plaza\s*singapura|the\s*centrepoint|orchard\s*central|somerset)\b/i, key: 'somerset' },
    { re: /\b(vivocity|harbourfront)\b/i, key: 'harbourfront' },
    { re: /\b(jem|jcube|imm|westgate|jurong\s*point)\b/i, key: 'jurong' },
    { re: /\b(tampines\s*mall|century\s*square|tampines\s*1)\b/i, key: 'tampines' },
    { re: /\b(bedok\s*mall|heartbeat@bedok|djitsun)\b/i, key: 'bedok' },
    { re: /\b(amk\s*hub|jubilee|nex|hougang\s*mall)\b/i, key: 'northeast' },
    { re: /\b(uic\s*building|asia\s*square|ocbc\s*centre|capital\s*tower|tanjong\s*pagar\s*centre)\b/i, key: 'cbd-towers' },
  ]
  const buildings = new Set<string>()
  let unmatched = 0
  for (const b of businesses) {
    let matched = false
    for (const m of buildingMatchers) {
      if (m.re.test(b.name)) { buildings.add(m.key); matched = true; break }
    }
    if (!matched) unmatched++
  }
  // Add 1 "implied buildings" slot per ~3 unmatched businesses (rough density)
  return buildings.size + Math.ceil(unmatched / 3)
}

function mostCommon(arr: string[]): string {
  if (arr.length === 0) return 'businesses'
  const counts = new Map<string, number>()
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1)
  let best = arr[0]; let bestN = 0
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n }
  return best
}

function simplifyArea(address: string): string {
  // CBD
  if (/raffles/i.test(address))           return 'Raffles Place'
  if (/cecil street|robinson road|shenton way|maxwell|amoy/i.test(address)) return 'CBD'
  if (/tanjong pagar/i.test(address))     return 'Tanjong Pagar'
  if (/marina/i.test(address))            return 'Marina Bay'
  if (/clarke quay|boat quay/i.test(address)) return 'Clarke / Boat Quay'
  if (/chinatown|telok ayer|club street/i.test(address)) return 'Chinatown / Telok Ayer'
  // Central
  if (/orchard/i.test(address))           return 'Orchard Road'
  if (/somerset|dhoby ghaut|bugis|little india|kampong glam/i.test(address)) return 'Central'
  if (/novena|newton/i.test(address))     return 'Novena / Newton'
  if (/holland|tanglin/i.test(address))   return 'Holland / Tanglin'
  // East
  if (/tampines/i.test(address))          return 'Tampines'
  if (/bedok/i.test(address))             return 'Bedok'
  if (/changi|pasir ris/i.test(address))  return 'Changi / Pasir Ris'
  if (/katong|joo chiat|east coast/i.test(address)) return 'East Coast'
  // West
  if (/jurong/i.test(address))            return 'Jurong'
  if (/clementi/i.test(address))          return 'Clementi'
  if (/bukit batok|bukit gombak|choa chu kang/i.test(address)) return 'West'
  // North
  if (/woodlands/i.test(address))         return 'Woodlands'
  if (/yishun|sembawang/i.test(address))  return 'Yishun / Sembawang'
  if (/ang mo kio|bishan|toa payoh/i.test(address)) return 'Central North'
  // Northeast
  if (/sengkang|punggol/i.test(address))  return 'Sengkang / Punggol'
  if (/hougang|serangoon/i.test(address)) return 'Hougang / Serangoon'
  return 'your area'
}

