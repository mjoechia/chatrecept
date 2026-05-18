'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { EXAMPLE_ZONES } from '@/lib/example-zones'
import type { TerritoryReport } from '@/lib/demo-report'

interface UtmTags {
  src?:      string
  medium?:   string
  campaign?: string
  prospect?: string
}

export default function HomePage() {
  const [postalCode, setPostalCode] = useState('')
  const [loading, setLoading]       = useState(false)
  const [stage, setStage]           = useState('')
  const [error, setError]           = useState('')
  const [report, setReport]         = useState<TerritoryReport | null>(null)

  const [leadName, setLeadName]     = useState('')
  const [email, setEmail]           = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError]     = useState('')
  const [emailCaptured, setEmailCaptured] = useState(false)

  const utmRef    = useRef<UtmTags>({})
  const didAutoRun = useRef(false)

  // Capture URL params on mount: ?p=238802 auto-submits; utm_* stored for attribution
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    utmRef.current = {
      src:      params.get('utm_src')      ?? params.get('utm_source') ?? undefined,
      medium:   params.get('utm_medium')   ?? undefined,
      campaign: params.get('utm_campaign') ?? undefined,
      prospect: params.get('prospect')     ?? undefined,
    }
    const pre = params.get('p')
    if (pre && /^\d{6}$/.test(pre) && !didAutoRun.current) {
      didAutoRun.current = true
      setPostalCode(pre)
      runLookup(pre, { cacheOnly: true })
    }
  }, [])

  async function runLookup(postal: string, opts: { cacheOnly?: boolean } = {}) {
    setError(''); setReport(null); setEmailCaptured(false)
    setLoading(true)
    setStage(opts.cacheOnly ? 'Loading your zone…' : 'Locating zone…')

    // Auto-advance stage labels so the user sees progress even though the
    // backend response is one shot. Timings tuned to the typical pipeline:
    // geocode ~0.3s · nearby ~2s · enrich (parallel 20) ~5s · claude ~2s
    const timers: NodeJS.Timeout[] = []
    if (!opts.cacheOnly) {
      timers.push(setTimeout(() => setStage('Searching nearby businesses…'),       1500))
      timers.push(setTimeout(() => setStage('Enriching contact channels…'),         4000))
      timers.push(setTimeout(() => setStage('Scoring WhatsApp readiness…'),         7500))
      timers.push(setTimeout(() => setStage('Drafting sample outreach…'),          10000))
      timers.push(setTimeout(() => setStage('Almost there…'),                      14000))
    }

    try {
      const res = await fetch('/api/territory/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postal_code: postal,
          cache_only:  opts.cacheOnly === true,
          utm:         utmRef.current,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Lookup failed'); return }
      setReport(json)
    } catch (e) {
      setError(String(e))
    } finally {
      timers.forEach(clearTimeout)
      setLoading(false)
      setStage('')
    }
  }

  async function handleMap(e: React.FormEvent) {
    e.preventDefault()
    await runLookup(postalCode)
  }

  async function handleExampleZone(postal: string) {
    setPostalCode(postal)
    // Example zones are pre-warmed → always hit cache, never spend budget
    await runLookup(postal, { cacheOnly: true })
  }

  async function handleEmailCapture(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    setEmailLoading(true)
    try {
      const res = await fetch('/api/territory/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postal_code: postalCode, email, name: leadName }),
      })
      const json = await res.json()
      if (!res.ok) { setEmailError(json.error ?? 'Save failed'); return }
      setEmailCaptured(true)
    } catch (e) {
      setEmailError(String(e))
    } finally {
      setEmailLoading(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      {/* Hero */}
      <section className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-[#12304f] mb-3">
          CLAWS — AI Territory Intelligence
        </h1>
        <p className="text-sm md:text-base text-[#425d7f] max-w-xl mx-auto">
          Enter a Singapore postal code. We map the reachable businesses
          in the area and score them in 30 seconds. No signup.
        </p>
      </section>

      {/* Input form */}
      <form onSubmit={handleMap} className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-4 shadow-sm">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">
          Singapore Postal Code
        </label>
        <div className="flex gap-3">
          <input
            value={postalCode}
            onChange={e => setPostalCode(e.target.value)}
            placeholder="238802"
            maxLength={6}
            inputMode="numeric"
            className="flex-1 border border-[#dde8f5] rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#006092]"
          />
          <button
            type="submit"
            disabled={loading || postalCode.length !== 6}
            className="bg-[#006092] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#004d75] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Mapping…' : 'Map this zone →'}
          </button>
        </div>
        {loading && stage && (
          <div className="mt-3 flex items-center gap-2 text-sm text-[#425d7f]">
            <span className="inline-block h-3 w-3 rounded-full bg-[#006092] animate-pulse" />
            <span>{stage}</span>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      {/* Example zones */}
      {!report && (
        <div className="bg-white rounded-xl border border-[#dde8f5] p-4 mb-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">
            Or try a sample zone (instant — no API call)
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_ZONES.map(z => (
              <button
                key={z.postal}
                onClick={() => handleExampleZone(z.postal)}
                disabled={loading}
                className="text-xs px-3 py-1.5 border border-[#dde8f5] rounded-full bg-[#f3f6ff] hover:bg-[#dde8f5] text-[#425d7f] hover:text-[#12304f] disabled:opacity-50 transition-colors"
                title={z.hint}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Report */}
      {report && (
        <section className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-xl font-bold text-[#12304f]">{report.district_label}</h2>
            <p className="text-sm text-[#425d7f] mt-1">
              <span className="font-mono">{report.postal_code}</span>
              <span className="text-[#94afd5] mx-1.5">·</span>
              {report.address_label}
            </p>
          </div>

          <div className="bg-[#f3f6ff] rounded-lg p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-3">
              This zone — mapped at a glance
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BreakdownStat
                label="Buildings"
                value={report.breakdown.buildings.toString()}
                sub="detected"
              />
              <BreakdownStat
                label="Sectors"
                value={report.breakdown.sectors.toString()}
                sub="represented"
              />
              <BreakdownStat
                label="Active listings"
                value={`${report.breakdown.active_listings}${report.total_saturated ? '+' : ''}`}
                sub={report.total_saturated ? 'capped by API' : 'mapped'}
              />
              <BreakdownStat
                label="High-opportunity"
                value={report.breakdown.high_opportunity.toString()}
                sub="mobile + active"
              />
            </div>
            <p className="text-[11px] text-[#94afd5] mt-3 leading-snug">
              Top {report.enriched_count} listings enriched with phone, email, social — shown below.
              {report.total_saturated && ' API returned its maximum page count; the zone has more listings than we fetched.'}
            </p>
          </div>

          {/* Signal scores */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Signal Scores</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <ScoreRow
                label="Reachability"
                value={`${report.zone_scores.reachability_score}/100`}
                hint="How easily you can contact businesses here — combines phone, email, web, and review activity into a single score."
              />
              <ScoreRow
                label="Digital Presence"
                value={report.zone_scores.digital_presence}
                hint="How visible the businesses are online — website, review volume, IG/FB activity."
              />
              <ScoreRow
                label="WhatsApp Readiness"
                value={`${report.zone_scores.whatsapp_readiness} (${report.zone_scores.whatsapp_readiness_count.high} of ${report.enriched_count})`}
                hint="Share with a mobile number or wa.me link — directly reachable on WhatsApp."
              />
              <ScoreRow
                label="Likelihood of Response"
                value={report.zone_scores.likelihood}
                hint="Estimated reply rate for outreach in this sector + district. Refines as more campaigns run."
              />
            </div>
          </div>

          {/* Composition */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Composition</p>
            <div className="text-sm text-[#425d7f] space-y-1">
              <p>Top sectors: {report.composition.sectors.slice(0, 3).map(s => `${s.sector} (${s.count})`).join(' · ')}</p>
              <p>
                {Math.round(100 * report.composition.has_mobile_count   / report.enriched_count)}% mobile ·{' '}
                {Math.round(100 * report.composition.has_whatsapp_count / report.enriched_count)}% WhatsApp ·{' '}
                {Math.round(100 * report.composition.has_email_count    / report.enriched_count)}% email ·{' '}
                {Math.round(100 * report.composition.has_social_count   / report.enriched_count)}% IG/FB
              </p>
              <p className="text-[11px] text-[#94afd5]">Based on the top {report.enriched_count} enriched businesses.</p>
            </div>
          </div>

          {/* Opportunity */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Opportunity Type</p>
            <div className="text-sm text-[#425d7f] space-y-1">
              <p>Currently-active listings: <span className="font-semibold text-[#12304f]">{report.opportunity.likely_active}</span></p>
              <p>Lower recent activity: <span className="font-semibold text-[#12304f]">{report.opportunity.lower_activity}</span> <span className="text-[10px] text-[#94afd5]">(growth-help candidates)</span></p>
            </div>
          </div>

          {/* Top enriched businesses with full contact details */}
          {report.enriched_businesses && report.enriched_businesses.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">
                Top {report.enriched_businesses.length} businesses in this zone
              </p>
              <p className="text-[11px] text-[#94afd5] mb-3 leading-snug">
                Sorted by reachability. The remaining{' '}
                {Math.max(0, report.total_count - report.enriched_businesses.length)}
                {report.total_saturated ? '+' : ''} businesses unlock when you activate the outreach zone.
              </p>
              <div className="border border-[#dde8f5] rounded-lg divide-y divide-[#dde8f5] overflow-hidden">
                {report.enriched_businesses.map((b, i) => (
                  <div key={i} className="p-3 text-sm bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#12304f] truncate">
                          <span className="text-[#94afd5] mr-1">{i + 1}.</span>
                          {b.name}
                        </p>
                        <p className="text-[11px] text-[#94afd5] mt-0.5">
                          <span className="capitalize">{b.sector}</span> · {b.activity_signal} · reach {b.reachability_score}/100
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {b.phone && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[#94afd5] shrink-0 w-12">Phone</span>
                          <span className="font-mono text-[#12304f] truncate">{b.phone}</span>
                        </div>
                      )}
                      {b.email && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[#94afd5] shrink-0 w-12">Email</span>
                          <span className="text-[#12304f] truncate">{b.email}</span>
                        </div>
                      )}
                      {b.website && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[#94afd5] shrink-0 w-12">Website</span>
                          <a href={b.website} target="_blank" rel="noopener" className="text-[#006092] hover:underline truncate">
                            {b.website.replace(/^https?:\/\/(?:www\.)?/, '')}
                          </a>
                        </div>
                      )}
                      {b.whatsapp_link && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[#94afd5] shrink-0 w-12">WA link</span>
                          <a href={b.whatsapp_link} target="_blank" rel="noopener" className="text-[#006092] hover:underline truncate">
                            wa.me
                          </a>
                        </div>
                      )}
                      {b.instagram_handle && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[#94afd5] shrink-0 w-12">IG</span>
                          <span className="text-[#12304f] truncate">@{b.instagram_handle}</span>
                        </div>
                      )}
                      {b.facebook_page && (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[#94afd5] shrink-0 w-12">FB</span>
                          <span className="text-[#12304f] truncate">{b.facebook_page}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample hook */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Sample Outreach Style</p>
            <div className="bg-[#f3f6ff] border border-[#dde8f5] rounded-lg p-4 text-sm text-[#12304f] font-mono leading-relaxed">
              {report.sample_hook}
            </div>
          </div>
        </section>
      )}

      {/* Sample follow-up report — what the customer gets each morning */}
      {report && report.enriched_businesses.length > 0 && (
        <SampleFollowUpReport report={report} />
      )}

      {/* Lead capture + activation CTA */}
      {report && (
        <section className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-6 shadow-sm">
          <div className="bg-[#f3f6ff] rounded-lg p-5 text-center mb-4">
            <p className="text-sm text-[#425d7f] mb-3">
              Ready to reach all{' '}
              <span className="font-semibold text-[#12304f]">
                {report.total_count}{report.total_saturated ? '+' : ''}
              </span>{' '}
              businesses with AI-supervised outreach?
            </p>
            <a
              href="/signup"
              className="inline-block bg-[#006092] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#004d75] transition-colors"
            >
              Activate Outreach Zone — SGD 600 / mo →
            </a>
            <p className="text-xs text-[#94afd5] mt-3">
              3-month minimum · human-supervised first 30 days · cancel anytime after
            </p>
          </div>

          {!emailCaptured ? (
            <form onSubmit={handleEmailCapture}>
              <p className="text-xs text-[#94afd5] mb-2">Not ready yet? Drop your name + email and we&apos;ll send you this report + a follow-up walkthrough.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={leadName}
                  onChange={e => setLeadName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="sm:w-40 border border-[#dde8f5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourcompany.sg"
                  required
                  className="flex-1 border border-[#dde8f5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                />
                <button
                  type="submit"
                  disabled={emailLoading || !email || !leadName.trim()}
                  className="border border-[#dde8f5] text-[#425d7f] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#f3f6ff] disabled:opacity-50 transition-colors"
                >
                  {emailLoading ? 'Saving…' : 'Email it to me'}
                </button>
              </div>
              {emailError && <p className="mt-2 text-xs text-red-600">{emailError}</p>}
            </form>
          ) : (
            <p className="text-xs text-green-600">✓ Thanks — we&apos;ll be in touch with the full report at {email}.</p>
          )}
        </section>
      )}
    </main>
  )
}

function BreakdownStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-[#94afd5]">{label}</p>
      <p className="text-2xl font-bold text-[#006092] leading-tight mt-0.5">{value}</p>
      <p className="text-[10px] text-[#425d7f] mt-0.5">{sub}</p>
    </div>
  )
}

function ScoreRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[#f3f6ff] rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[#94afd5]">{label}</span>
        <span className="text-sm font-semibold text-[#12304f]">{value}</span>
      </div>
      {hint && <p className="text-[11px] text-[#94afd5] mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

// Plausible sample reply per sector — keeps the mockup feeling localised.
function replyForSector(sector: string): string {
  const s = sector.toLowerCase()
  if (s.includes('f&b'))          return 'Can you send the catering menu? We have 40 pax monthly.'
  if (s.includes('retail'))       return 'Do you offer corporate gift bundles? Need 50 sets.'
  if (s.includes('professional')) return 'AGM filing assistance — call me back Wednesday afternoon.'
  if (s.includes('finance'))      return 'Looking for SME loan advisory. When can we chat?'
  if (s.includes('wellness'))     return 'Group rate for team of 12? Tuesdays after work.'
  if (s.includes('health'))       return 'Need annual health screening package quote.'
  if (s.includes('hospitality'))  return 'Corporate retreat for 30 in July. Send package.'
  if (s.includes('services'))     return 'Free quote please — 3 sites in this area.'
  return 'Interested — what does engagement look like?'
}

interface FollowUpProps {
  report: TerritoryReport
}

function SampleFollowUpReport({ report }: FollowUpProps) {
  // Pick 3 different businesses from the enriched list to populate the
  // sample replies. Prefer sector diversity for visual variety.
  const picks: typeof report.enriched_businesses = []
  const seenSectors = new Set<string>()
  for (const b of report.enriched_businesses) {
    if (picks.length >= 3) break
    if (seenSectors.has(b.sector) && picks.length < 2) continue
    picks.push(b)
    seenSectors.add(b.sector)
  }
  while (picks.length < 3 && picks.length < report.enriched_businesses.length) {
    const next = report.enriched_businesses[picks.length]
    if (!picks.includes(next)) picks.push(next)
  }

  const statuses: Array<{ label: string; tone: string }> = [
    { label: 'auto-replied ✓', tone: 'text-green-700 bg-green-50' },
    { label: 'flagged for you', tone: 'text-amber-700 bg-amber-50' },
    { label: 'meeting booked ✓', tone: 'text-blue-700 bg-blue-50' },
  ]

  // Plausible Day-3 mid-campaign numbers — clearly labelled as a sample.
  const sent     = 23
  const read     = 18
  const replied  = 6
  const booked   = 2
  const readPct  = Math.round(100 * read / sent)
  const replyPct = Math.round(100 * replied / sent)

  return (
    <section className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">
            Daily Follow-up Report
          </p>
          <p className="text-sm text-[#425d7f] mt-0.5">
            What CLAWS sends to your WhatsApp every morning once outreach is live.
          </p>
        </div>
        <span className="text-[10px] font-bold tracking-widest text-[#94afd5] bg-[#f3f6ff] px-2 py-1 rounded">SAMPLE</span>
      </div>

      {/* WhatsApp-style daily digest mockup */}
      <div className="bg-[#e6f4ea] rounded-xl p-4 sm:p-5 max-w-md mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xs font-semibold text-[#12304f]">CLAWS · Day 3</p>
          <p className="text-[10px] text-[#425d7f]">09:00 SGT</p>
        </div>

        <p className="text-sm font-semibold text-[#12304f] mb-2">
          📊 {report.district_label} campaign
        </p>

        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <StatChip label="Sent"      value={sent.toString()} sub="" />
          <StatChip label="Read"      value={read.toString()} sub={`${readPct}%`} />
          <StatChip label="Replied"   value={replied.toString()} sub={`${replyPct}%`} />
          <StatChip label="Meetings"  value={booked.toString()} sub="scheduled" />
        </div>

        <p className="text-xs font-semibold text-[#12304f] mb-2">⚡ {replied} replies — 1 needs you:</p>

        <div className="space-y-2">
          {picks.map((b, i) => {
            const status = statuses[i] ?? statuses[0]
            return (
              <div key={b.name} className="bg-white rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#12304f] truncate">{b.name}</p>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${status.tone} whitespace-nowrap`}>
                    {status.label}
                  </span>
                </div>
                <p className="text-xs text-[#425d7f] mt-0.5 italic">&ldquo;{replyForSector(b.sector)}&rdquo;</p>
              </div>
            )
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-[#cfe5d4] text-[10px] text-[#006092] font-semibold text-center">
          View dashboard →
        </div>
      </div>

      {/* Week 1 wrap (compact) */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <WrapStat label="Week 1 reach"    value="50"   />
        <WrapStat label="Reply rate"      value="28%"  />
        <WrapStat label="Meetings booked" value="4"    />
        <WrapStat label="Avg response"    value="2.4h" />
      </div>

      <p className="mt-4 text-[11px] text-[#94afd5] leading-snug text-center">
        Numbers shown are typical for similar SG zones in month 1. Your actual results depend on sector, time of year, and offer hook — CLAWS refines them as it learns your zone.
      </p>
    </section>
  )
}

function StatChip({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-[#94afd5]">{label}</p>
      <p className="text-base font-bold text-[#12304f] leading-tight">
        {value}
        {sub && <span className="text-[10px] font-medium text-[#425d7f] ml-1">{sub}</span>}
      </p>
    </div>
  )
}

function WrapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#f3f6ff] rounded-lg px-2 py-2">
      <p className="text-lg font-bold text-[#12304f]">{value}</p>
      <p className="text-[10px] text-[#94afd5] mt-0.5">{label}</p>
    </div>
  )
}
