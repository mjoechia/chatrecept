// Demo report generator — uses Claude Haiku to write the sample outreach hook.
// All other report fields are deterministic from the scoring engine.

import Anthropic from '@anthropic-ai/sdk'
import type { ScoredBusiness, ZoneScores } from './signal-scoring'

export interface TerritoryReport {
  postal_code:   string
  address_label: string
  total_count:   number
  zone_scores:   ZoneScores
  composition: {
    sectors: { sector: string; count: number }[]
    has_mobile_count: number
    has_whatsapp_count: number
    has_email_count: number
    has_social_count: number  // IG or FB
  }
  opportunity: {
    likely_active:    number
    possibly_dormant: number
  }
  sample_hook: string
  // Anonymised preview (no business names)
  preview: Array<{
    sector:          string
    area_label:      string
    channels:        string  // e.g. "phone + email + website"
    whatsapp_readiness: string
    activity_signal: string
  }>
}

const HAIKU = 'claude-haiku-4-5-20251001'
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

export async function generateReport(
  postalCode: string,
  addressLabel: string,
  businesses: ScoredBusiness[],
  zone: ZoneScores,
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

  // Preview = 3 anonymised samples (mix of sectors, mix of signals)
  const preview = pickPreview(businesses)

  return {
    postal_code:   postalCode,
    address_label: addressLabel,
    total_count:   businesses.length,
    zone_scores:   zone,
    composition: {
      sectors,
      has_mobile_count:   businesses.filter(b => b.has_mobile).length,
      has_whatsapp_count: businesses.filter(b => b.has_whatsapp).length,
      has_email_count:    businesses.filter(b => b.has_email).length,
      has_social_count:   businesses.filter(b => b.has_instagram || b.has_facebook).length,
    },
    opportunity: {
      likely_active:    businesses.filter(b => b.activity_signal !== 'Possibly Dormant').length,
      possibly_dormant: businesses.filter(b => b.activity_signal === 'Possibly Dormant').length,
    },
    sample_hook,
    preview,
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

function mostCommon(arr: string[]): string {
  if (arr.length === 0) return 'businesses'
  const counts = new Map<string, number>()
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1)
  let best = arr[0]; let bestN = 0
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n }
  return best
}

function simplifyArea(address: string): string {
  // Extract a friendly area name from the OneMap address
  if (/orchard/i.test(address))  return 'Orchard Road'
  if (/raffles/i.test(address))  return 'Raffles Place'
  if (/tanjong pagar/i.test(address)) return 'Tanjong Pagar'
  if (/marina/i.test(address))   return 'Marina Bay'
  if (/jurong/i.test(address))   return 'Jurong'
  if (/woodlands/i.test(address)) return 'Woodlands'
  if (/tampines/i.test(address)) return 'Tampines'
  if (/bedok/i.test(address))    return 'Bedok'
  return 'your area'
}

function pickPreview(businesses: ScoredBusiness[]): TerritoryReport['preview'] {
  // Pick up to 3, prefer sector diversity + signal mix
  const sorted = [...businesses].sort((a, b) => b.reachability_score - a.reachability_score)
  const picked: ScoredBusiness[] = []
  const seenSectors = new Set<string>()

  for (const b of sorted) {
    if (picked.length >= 3) break
    if (seenSectors.has(b.sector) && picked.length < businesses.length - 1) continue
    picked.push(b)
    seenSectors.add(b.sector)
  }
  // Top up if we couldn't fill diversity
  for (const b of sorted) {
    if (picked.length >= 3) break
    if (!picked.includes(b)) picked.push(b)
  }

  return picked.map(b => {
    const channels = [
      b.has_mobile && 'mobile',
      b.has_whatsapp && 'WA',
      b.has_email && 'email',
      b.has_instagram && 'IG',
      b.has_facebook && 'FB',
    ].filter(Boolean).join(' + ') || 'limited'
    return {
      sector:             b.sector,
      area_label:         'this zone',
      channels,
      whatsapp_readiness: b.whatsapp_readiness,
      activity_signal:    b.activity_signal,
    }
  })
}
