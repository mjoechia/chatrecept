// Website scraper — fetches a business homepage and extracts contact info
// directly from the HTML. ~100x cheaper than Hunter.io for SG SME use case,
// where most reachable signals are publicly published (mailto links,
// WhatsApp wa.me URLs, Instagram/Facebook handles).
//
// Coverage trade-off: we miss JS-rendered SPAs and pages behind a login.
// For SG SMEs (hawker, F&B, retail, salon, services) this is rare —
// most use simple Wix/Wordpress/static HTML sites.

import { cacheGet, cacheSet, TTL } from './cache'

export interface SiteSignals {
  domain:               string
  primary_email:        string | null
  email_count:          number
  whatsapp_link:        string | null   // first wa.me / api.whatsapp.com URL found
  whatsapp_phone:       string | null   // E.164 if extractable
  instagram_handle:     string | null   // e.g. "acme_lunch_bar"
  facebook_page:        string | null   // e.g. "acmelunchbar"
  has_whatsapp_business: boolean        // true if WhatsApp link or Business badge detected
}

const FETCH_TIMEOUT_MS = 5000
const USER_AGENT = 'Mozilla/5.0 (compatible; JCClawsBot/0.1; +https://chatrecept.chat/claws)'

export async function scrapeSite(websiteUrl: string): Promise<SiteSignals | null> {
  const domain = extractDomain(websiteUrl)
  if (!domain) return null

  const cacheKey = `site:${domain}`
  const cached = await cacheGet<SiteSignals>(cacheKey)
  if (cached) return cached

  const html = await fetchHomepage(websiteUrl)
  if (!html) {
    // Cache the negative result so we don't retry dead sites for 180 days
    const empty: SiteSignals = {
      domain, primary_email: null, email_count: 0,
      whatsapp_link: null, whatsapp_phone: null,
      instagram_handle: null, facebook_page: null,
      has_whatsapp_business: false,
    }
    await cacheSet(cacheKey, empty, TTL.DOMAIN)
    return empty
  }

  const signals: SiteSignals = {
    domain,
    primary_email:         pickBestEmail(extractEmails(html, domain)),
    email_count:           extractEmails(html, domain).length,
    whatsapp_link:         extractWhatsappLink(html),
    whatsapp_phone:        extractWhatsappPhone(html),
    instagram_handle:      extractInstagramHandle(html),
    facebook_page:         extractFacebookPage(html),
    has_whatsapp_business: false, // set below
  }
  signals.has_whatsapp_business = !!signals.whatsapp_link || !!signals.whatsapp_phone

  await cacheSet(cacheKey, signals, TTL.DOMAIN)
  return signals
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchHomepage(url: string): Promise<string | null> {
  const normalized = url.startsWith('http') ? url : `https://${url}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(normalized, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ── Extractors ───────────────────────────────────────────────────────────────

function extractEmails(html: string, domain: string): string[] {
  // Match emails in mailto: links and plain text
  const matches = html.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
  const seen = new Set<string>()
  for (const m of matches) {
    const email = m[0].toLowerCase()
    if (isJunkEmail(email)) continue
    // Prefer emails matching the site's own domain
    seen.add(email)
  }
  return [...seen]
}

function isJunkEmail(email: string): boolean {
  // Filter common boilerplate
  if (email.startsWith('noreply@')) return true
  if (email.startsWith('no-reply@')) return true
  if (email.startsWith('donotreply@')) return true
  if (email.endsWith('@sentry.io')) return true
  if (email.endsWith('@wixpress.com')) return true
  if (email.endsWith('@example.com')) return true
  // Track tracking pixels / unsubscribe
  if (email.includes('unsubscribe')) return true
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(email)) return true
  return false
}

function pickBestEmail(emails: string[]): string | null {
  if (emails.length === 0) return null
  // Prefer generic "contact-like" inboxes over personal addresses
  const priorityPrefixes = ['hello@', 'hi@', 'contact@', 'info@', 'enquiry@', 'enquiries@', 'sales@', 'admin@']
  for (const prefix of priorityPrefixes) {
    const match = emails.find(e => e.startsWith(prefix))
    if (match) return match
  }
  return emails[0]
}

function extractWhatsappLink(html: string): string | null {
  const patterns = [
    /https?:\/\/wa\.me\/[+]?[\d]+/i,
    /https?:\/\/api\.whatsapp\.com\/send\?phone=[+]?[\d]+/i,
    /https?:\/\/web\.whatsapp\.com\/send\?phone=[+]?[\d]+/i,
    /https?:\/\/chat\.whatsapp\.com\/[\w-]+/i,
  ]
  for (const pat of patterns) {
    const m = html.match(pat)
    if (m) return m[0]
  }
  return null
}

function extractWhatsappPhone(html: string): string | null {
  // Try to pull the phone number out of wa.me or api.whatsapp.com URLs
  const m = html.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=)\+?(\d{8,15})/i)
  if (!m) return null
  const digits = m[1]
  // Singapore numbers are 8 digits, often prefixed with 65
  if (digits.length === 8 && /^[89]/.test(digits)) return `+65${digits}`
  if (digits.startsWith('65') && digits.length === 10) return `+${digits}`
  return `+${digits}`
}

function extractInstagramHandle(html: string): string | null {
  const m = html.match(/instagram\.com\/([A-Za-z0-9_.]+)(?:[/?"'\s]|$)/i)
  if (!m) return null
  const handle = m[1]
  if (['p', 'reel', 'explore', 'tv'].includes(handle.toLowerCase())) return null
  return handle
}

function extractFacebookPage(html: string): string | null {
  const m = html.match(/facebook\.com\/([A-Za-z0-9_.-]+)(?:[/?"'\s]|$)/i)
  if (!m) return null
  const page = m[1]
  if (['sharer', 'tr', 'plugins', 'dialog', 'login'].includes(page.toLowerCase())) return null
  return page
}
