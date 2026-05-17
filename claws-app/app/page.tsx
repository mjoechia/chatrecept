'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { EXAMPLE_ZONES } from '@/lib/example-zones'
import type { TerritoryReport } from '@/lib/demo-report'

type Preview = { sector: string; channels: string; whatsapp_readiness: string; activity_signal: string }
type PreviewResponse = { postal_code: string; address_label: string; total_count: number; preview: Preview[] }

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

  const [email, setEmail]           = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError]     = useState('')
  const [preview, setPreview]               = useState<PreviewResponse | null>(null)

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
    setError(''); setReport(null); setPreview(null)
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

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    setPreviewError(''); setPreview(null)
    setPreviewLoading(true)
    try {
      const res = await fetch('/api/territory/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postal_code: postalCode, email }),
      })
      const json = await res.json()
      if (!res.ok) { setPreviewError(json.error ?? 'Preview failed'); return }
      setPreview(json)
    } catch (e) {
      setPreviewError(String(e))
    } finally {
      setPreviewLoading(false)
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
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">📍 Zone</p>
            <h2 className="text-xl font-bold text-[#12304f] mt-1">{report.address_label}</h2>
          </div>

          <div className="bg-[#f3f6ff] rounded-lg p-4">
            <p className="text-3xl font-bold text-[#006092]">{report.total_count}</p>
            <p className="text-sm text-[#425d7f] mt-0.5">reachable businesses mapped</p>
          </div>

          {/* Signal scores */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Signal Scores</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <ScoreRow label="Reachability"        value={`${report.zone_scores.reachability_score}/100`} />
              <ScoreRow label="Digital Presence"    value={report.zone_scores.digital_presence} />
              <ScoreRow label="WhatsApp Readiness"  value={`${report.zone_scores.whatsapp_readiness} (${report.zone_scores.whatsapp_readiness_count.high} of ${report.total_count})`} />
              <ScoreRow label="Likelihood of Response" value={report.zone_scores.likelihood} />
            </div>
          </div>

          {/* Composition */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Composition</p>
            <div className="text-sm text-[#425d7f] space-y-1">
              <p>Top sectors: {report.composition.sectors.slice(0, 3).map(s => `${s.sector} (${s.count})`).join(' · ')}</p>
              <p>
                {Math.round(100 * report.composition.has_mobile_count   / report.total_count)}% mobile ·{' '}
                {Math.round(100 * report.composition.has_whatsapp_count / report.total_count)}% WhatsApp ·{' '}
                {Math.round(100 * report.composition.has_email_count    / report.total_count)}% email ·{' '}
                {Math.round(100 * report.composition.has_social_count   / report.total_count)}% IG/FB
              </p>
            </div>
          </div>

          {/* Opportunity */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Opportunity Type</p>
            <div className="text-sm text-[#425d7f] space-y-1">
              <p>Likely-active businesses: <span className="font-semibold text-[#12304f]">{report.opportunity.likely_active}</span></p>
              <p>Possibly-dormant (weak signals): <span className="font-semibold text-[#12304f]">{report.opportunity.possibly_dormant}</span></p>
            </div>
          </div>

          {/* Sample hook */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">Sample Outreach Style</p>
            <div className="bg-[#f3f6ff] border border-[#dde8f5] rounded-lg p-4 text-sm text-[#12304f] font-mono leading-relaxed">
              {report.sample_hook}
            </div>
          </div>
        </section>
      )}

      {/* Preview gate */}
      {report && !preview && (
        <form onSubmit={handlePreview} className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">See 3 Preview Businesses</p>
          <p className="text-sm text-[#425d7f] mb-4">
            Drop your email to preview a sample of the reachable businesses in this zone
            (sector + channels + signal scores, names hidden until activation).
          </p>
          <div className="flex gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yourcompany.sg"
              required
              className="flex-1 border border-[#dde8f5] rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
            />
            <button
              type="submit"
              disabled={previewLoading || !email}
              className="bg-[#006092] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#004d75] disabled:opacity-50 transition-colors"
            >
              {previewLoading ? 'Loading…' : 'See preview →'}
            </button>
          </div>
          {previewError && <p className="mt-3 text-sm text-red-600">{previewError}</p>}
        </form>
      )}

      {/* Preview */}
      {preview && (
        <section className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-3">
            Preview — 3 of {preview.total_count} reachable businesses
          </p>
          <div className="space-y-3">
            {preview.preview.map((p, i) => (
              <div key={i} className="border border-[#dde8f5] rounded-lg p-4 text-sm">
                <p className="font-semibold text-[#12304f]">
                  {i + 1}. <span className="capitalize">{p.sector}</span> · this zone · {p.channels}
                </p>
                <p className="text-xs text-[#94afd5] mt-1">
                  WhatsApp Readiness: <span className="text-[#425d7f] font-medium">{p.whatsapp_readiness}</span>
                  {'  ·  '}
                  Activity: <span className="text-[#425d7f] font-medium">{p.activity_signal}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 bg-[#f3f6ff] rounded-lg p-5 text-center">
            <p className="text-sm text-[#425d7f] mb-3">
              Ready to reach all {preview.total_count} businesses?
            </p>
            <a
              href="/signup"
              className="inline-block bg-[#006092] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#004d75] transition-colors"
            >
              Activate Outreach Zone — SGD 600 / mo →
            </a>
            <p className="text-xs text-[#94afd5] mt-3">3-month minimum · human-supervised first 30 days · cancel anytime after</p>
          </div>
        </section>
      )}
    </main>
  )
}

function ScoreRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-[#f3f6ff] rounded-lg px-3 py-2">
      <span className="text-xs text-[#94afd5]">{label}</span>
      <span className="text-sm font-semibold text-[#12304f]">{value}</span>
    </div>
  )
}
