// Hunter.io email finder — given a domain, returns the most-likely corporate email.
// Docs: https://hunter.io/api-documentation/v2

import { cacheGet, cacheSet, TTL } from './cache'

export interface DomainEmails {
  domain: string
  primary_email: string | null
  email_count: number
}

const KEY = () => process.env.HUNTER_IO_API_KEY ?? ''

export async function findEmailByDomain(websiteUrl: string): Promise<DomainEmails | null> {
  const domain = extractDomain(websiteUrl)
  if (!domain) return null

  const cacheKey = `domain:${domain}`
  const cached = await cacheGet<DomainEmails>(cacheKey)
  if (cached) return cached

  if (!KEY()) {
    // No API key configured — return null gracefully, demo still works
    return null
  }

  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=3&api_key=${KEY()}`
  const res = await fetch(url)
  if (!res.ok) {
    console.error('Hunter.io failed', domain, res.status)
    return null
  }

  const json = await res.json()
  const emails = json.data?.emails ?? []
  const primary = emails.find((e: { type: string }) => e.type === 'generic')?.value
              ?? emails[0]?.value
              ?? null

  const result: DomainEmails = {
    domain,
    primary_email: primary,
    email_count:   emails.length,
  }

  await cacheSet(cacheKey, result, TTL.DOMAIN)
  return result
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
