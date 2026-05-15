// Signal scoring engine — per plan §4.
// Inputs: PlaceDetails + DomainEmails
// Outputs: Reachability (0-100) · Digital Presence · WhatsApp Readiness ·
//          Likelihood of Response · Activity Signal

import type { PlaceDetails } from './google-places'
import type { DomainEmails } from './hunter-io'

export type Level = 'Low' | 'Moderate' | 'High'
export type Likelihood = 'Low' | 'Medium' | 'High'
export type ActivitySignal = 'Active' | 'Moderate' | 'Possibly Dormant'

export interface ScoredBusiness {
  place_id:           string
  name:               string
  sector:             string
  has_phone:          boolean
  has_email:          boolean
  has_website:        boolean
  reachability_score: number       // 0-100
  digital_presence:   Level
  whatsapp_readiness: Level
  likelihood:         Likelihood
  activity_signal:    ActivitySignal
}

export interface ZoneScores {
  reachability_score:  number      // weighted average 0-100
  digital_presence:    Level
  whatsapp_readiness_count: { high: number; medium: number; low: number }
  whatsapp_readiness:  Level
  likelihood:          Likelihood
}

export function scoreBusiness(
  details: PlaceDetails,
  emails: DomainEmails | null,
  sector: string,
): ScoredBusiness {
  const has_phone   = !!details.phone
  const has_email   = !!emails?.primary_email
  const has_website = !!details.website

  // Reachability (0-100) — see plan §4
  let score = 0
  if (has_phone)   score += 30
  if (has_email)   score += 25
  if (has_website) score += 15
  // WhatsApp Business detection requires a check we cannot easily run from
  // server-side, so for MVP we infer from phone being mobile (most SG mobile
  // numbers start with 8 or 9)
  if (has_phone && /\b[89]\d{7}\b/.test(details.phone!)) score += 10
  // Recent review activity (Google Maps engagement)
  if ((details.user_rating_count ?? 0) > 5)  score += 10
  if ((details.user_rating_count ?? 0) > 50) score += 10

  const digital_presence: Level =
    score >= 70 ? 'High'
    : score >= 40 ? 'Moderate'
    : 'Low'

  const whatsapp_readiness: Level =
    (has_phone && /\b[89]\d{7}\b/.test(details.phone!)) ? 'High'
    : has_phone ? 'Moderate'
    : 'Low'

  // Likelihood of response — cold start defaults to Medium per plan §4
  // Refined later from sector_benchmarks data
  const likelihood: Likelihood = 'Medium'

  // Activity signal — Phase 2 moat seed
  // For MVP, use review count as the activity proxy
  const reviewCount = details.user_rating_count ?? 0
  const activity_signal: ActivitySignal =
    reviewCount >= 20 ? 'Active'
    : reviewCount >= 5 ? 'Moderate'
    : 'Possibly Dormant'

  return {
    place_id: details.place_id,
    name:     details.name,
    sector,
    has_phone,
    has_email,
    has_website,
    reachability_score: score,
    digital_presence,
    whatsapp_readiness,
    likelihood,
    activity_signal,
  }
}

export function aggregateZone(businesses: ScoredBusiness[]): ZoneScores {
  if (businesses.length === 0) {
    return {
      reachability_score: 0,
      digital_presence: 'Low',
      whatsapp_readiness_count: { high: 0, medium: 0, low: 0 },
      whatsapp_readiness: 'Low',
      likelihood: 'Medium',
    }
  }

  const reach = Math.round(
    businesses.reduce((sum, b) => sum + b.reachability_score, 0) / businesses.length
  )

  const waCounts = {
    high:   businesses.filter(b => b.whatsapp_readiness === 'High').length,
    medium: businesses.filter(b => b.whatsapp_readiness === 'Moderate').length,
    low:    businesses.filter(b => b.whatsapp_readiness === 'Low').length,
  }

  const waReadinessRatio = waCounts.high / businesses.length
  const whatsapp_readiness: Level =
    waReadinessRatio >= 0.6 ? 'High'
    : waReadinessRatio >= 0.3 ? 'Moderate'
    : 'Low'

  const digital_presence: Level =
    reach >= 70 ? 'High'
    : reach >= 40 ? 'Moderate'
    : 'Low'

  return {
    reachability_score: reach,
    digital_presence,
    whatsapp_readiness_count: waCounts,
    whatsapp_readiness,
    likelihood: 'Medium',
  }
}
