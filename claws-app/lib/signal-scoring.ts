// Signal scoring engine — per plan §4, re-weighted 2026-05 for SG SME reality.
//
// WhatsApp is the primary channel. Mobile phone presence is worth more than
// email; emails from website scrape are worth more than nothing but secondary.
// Recent Google review activity is the strongest "is this business alive"
// proxy.

import type { PlaceDetails } from './google-places'
import type { SiteSignals } from './web-scrape'

export type Level = 'Low' | 'Moderate' | 'High'
export type Likelihood = 'Low' | 'Medium' | 'High'
export type ActivitySignal = 'Active' | 'Moderate' | 'Possibly Dormant'

export interface ScoredBusiness {
  place_id:           string
  name:               string
  sector:             string
  has_phone:          boolean
  has_mobile:         boolean
  has_email:          boolean
  has_website:        boolean
  has_whatsapp:       boolean
  has_instagram:      boolean
  has_facebook:       boolean
  reachability_score: number       // 0-100
  digital_presence:   Level
  whatsapp_readiness: Level
  likelihood:         Likelihood
  activity_signal:    ActivitySignal
}

export interface ZoneScores {
  reachability_score:       number      // weighted average 0-100
  digital_presence:         Level
  whatsapp_readiness_count: { high: number; medium: number; low: number }
  whatsapp_readiness:       Level
  likelihood:               Likelihood
}

// Singapore mobile = 8 digits starting with 8 or 9. Google's
// internationalPhoneNumber is formatted with spaces ("+65 8123 4567") so we
// strip non-digits before matching to avoid false negatives.
function isSgMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 8  && /^[89]/.test(digits))  return true   // local format
  if (digits.length === 10 && /^65[89]/.test(digits)) return true  // international
  return false
}

export function scoreBusiness(
  details: PlaceDetails,
  site: SiteSignals | null,
  sector: string,
): ScoredBusiness {
  const has_phone     = !!details.phone
  const has_mobile    = has_phone && isSgMobile(details.phone!)
  const has_email     = !!site?.primary_email
  const has_website   = !!details.website
  // SG context: a mobile number IS a WhatsApp number 95% of the time. An
  // explicit wa.me link on the website is bonus confidence, not a requirement.
  const has_whatsapp  = has_mobile || !!site?.has_whatsapp_business
  const has_instagram = !!site?.instagram_handle
  const has_facebook  = !!site?.facebook_page

  const reviewCount = details.user_rating_count ?? 0

  // Reachability (0-100) — re-weighted for SG SME reality
  let score = 0
  if (has_mobile)              score += 45  // WhatsApp = primary channel
  else if (has_phone)          score += 20  // Landline only — much weaker
  if (reviewCount >= 50)       score += 20
  else if (reviewCount >= 10)  score += 12
  else if (reviewCount >= 1)   score += 5
  if (has_whatsapp)            score += 15
  if (has_website)             score += 10
  if (has_email)               score += 10
  if (has_instagram || has_facebook) score += 10
  score = Math.min(100, score)

  const digital_presence: Level =
    score >= 70 ? 'High'
    : score >= 40 ? 'Moderate'
    : 'Low'

  // Has wa.me link OR mobile -> High (you can WhatsApp them)
  // Landline only -> Moderate (might still be on WA Business but uncertain)
  // No phone -> Low
  const whatsapp_readiness: Level =
    has_whatsapp ? 'High'
    : has_phone  ? 'Moderate'
    : 'Low'

  // Likelihood — cold start defaults to Medium; refined later from sector_benchmarks
  const likelihood: Likelihood = 'Medium'

  // Activity signal — Phase 2 moat seed
  const activity_signal: ActivitySignal =
    reviewCount >= 20 ? 'Active'
    : reviewCount >= 5 ? 'Moderate'
    : 'Possibly Dormant'

  return {
    place_id: details.place_id,
    name:     details.name,
    sector,
    has_phone,
    has_mobile,
    has_email,
    has_website,
    has_whatsapp,
    has_instagram,
    has_facebook,
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

  const waReadinessRatio = (waCounts.high + waCounts.medium * 0.5) / businesses.length
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
