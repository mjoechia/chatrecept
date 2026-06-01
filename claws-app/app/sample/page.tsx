'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import TerritoryReportView from '@/app/_components/TerritoryReportView'
import type { TerritoryReport } from '@/lib/demo-report'

// Adapts CTA copy + destination based on whether the visitor is signed
// in. Anonymous → "sign up". Logged-in → "open your dashboard".
function useAuthState() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => r.json())
      .then(j => { if (!cancelled) setAuthed(!!j.authenticated) })
      .catch(() => { if (!cancelled) setAuthed(false) })
    return () => { cancelled = true }
  }, [])
  return authed
}

// Public sales / storytelling page. Long-scroll, six sections.
// Hero has a live demo: postcode input calls /api/territory/map with
// cache_only=true, which the existing route happily serves to
// anonymous visitors (cache check sits before the auth gate). All
// other content is static; all CTAs link to / with ?ref=sample for
// attribution.
//
// Pre-warmed demo postcodes (admin maps each once after deploy):
//   238801  Orchard
//   529510  Tampines
//   638886  Tuas
//   119620  Buona Vista
//   758500  Yishun
const DEMO_ZONES = [
  { postal: '238801', label: 'Orchard',      hint: 'CBD retail & F&B'     },
  { postal: '529510', label: 'Tampines',     hint: 'Heartland mixed'      },
  { postal: '638886', label: 'Tuas',         hint: 'Industrial / logistics' },
  { postal: '119620', label: 'Buona Vista',  hint: 'Tech / research'      },
  { postal: '758500', label: 'Yishun',       hint: 'Heartland north'      },
]

export default function SamplePage() {
  const authed = useAuthState()
  return (
    <main className="bg-[#f3f6ff]">
      <Hero authed={authed} />
      <HowItWorks />
      <SampleDashboard />
      <WhoUsesIt />
      <Benefits />
      <FinalCta authed={authed} />
    </main>
  )
}

// ── 1. Hero ────────────────────────────────────────────────────────────

function Hero({ authed }: { authed: boolean | null }) {
  const [postcode, setPostcode] = useState('238801')
  const [loading,  setLoading]  = useState(false)
  const [report,   setReport]   = useState<TerritoryReport | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  // CTA copy adapts: anonymous → conversion-focused; logged-in → open-
  // dashboard, since they're already signed up.
  const ctaLabel = authed ? 'Open your dashboard →' : 'Get your own zones →'
  const secondaryLink = authed
    ? { href: '/?ref=tour',   text: 'Skip the tour, open dashboard →' }
    : { href: '/?ref=sample', text: 'Or jump straight to signup →' }

  async function runDemo(p: string) {
    setError(null); setReport(null)
    setLoading(true)
    try {
      const res = await fetch('/api/territory/map', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postal_code: p, cache_only: true }),
      })
      const json = await res.json()
      if (res.ok) {
        setReport(json as TerritoryReport)
      } else {
        setError(
          'This zone isn\'t pre-warmed yet — try one of the instant zones below.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="max-w-5xl mx-auto px-6 pt-16 pb-12">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold text-[#12304f] mb-4 leading-tight">
          Find Businesses Around Any Singapore Postcode in Seconds
        </h1>
        <p className="text-base md:text-lg text-[#425d7f] max-w-2xl mx-auto leading-relaxed">
          Turn any Singapore postcode into a list of verified local businesses
          with contact information and automated outreach tracking.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[#425d7f]">
          <span className="inline-flex items-center gap-1"><Check />Business Name</span>
          <span className="inline-flex items-center gap-1"><Check />Phone</span>
          <span className="inline-flex items-center gap-1"><Check />Email</span>
          <span className="inline-flex items-center gap-1"><Check />IG + FB</span>
          <span className="inline-flex items-center gap-1"><Check />WhatsApp</span>
          <span className="inline-flex items-center gap-1"><Check />AI Scoring</span>
          <span className="inline-flex items-center gap-1"><Check />Outreach Reports</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#dde8f5] shadow-sm p-6 max-w-2xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-2">
          Try it now — no signup
        </p>
        <div className="flex gap-3">
          <input
            value={postcode}
            onChange={e => setPostcode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="238801"
            maxLength={6}
            inputMode="numeric"
            className="flex-1 border border-[#dde8f5] rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#006092]"
          />
          <button
            onClick={() => runDemo(postcode)}
            disabled={loading || postcode.length !== 6}
            className="bg-[#006092] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#004d75] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading…' : 'See it in action →'}
          </button>
        </div>

        {error && (
          <div className="mt-4">
            <p className="text-xs text-[#94afd5] mb-2">{error}</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_ZONES.map(z => (
                <button
                  key={z.postal}
                  onClick={() => { setPostcode(z.postal); runDemo(z.postal) }}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 border border-[#dde8f5] rounded-full bg-[#f3f6ff] hover:bg-[#dde8f5] text-[#425d7f] hover:text-[#12304f] disabled:opacity-50 transition-colors"
                  title={z.hint}
                >
                  {z.postal} — {z.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 text-center">
          <a
            href={secondaryLink.href}
            className="text-xs text-[#006092] hover:underline"
          >
            {secondaryLink.text}
          </a>
        </div>
      </div>

      {report && (
        <div className="mt-10 max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-3 text-center">
            ↓ Real report for {report.postal_code}
          </p>
          <TerritoryReportView report={report} />
          <div className="text-center mt-2 mb-8">
            <a
              href={`/?p=${report.postal_code}&autorun=1&ref=${authed ? 'tour' : 'sample'}`}
              className="inline-block bg-[#006092] text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-[#004d75] transition-colors"
            >
              {ctaLabel}
            </a>
          </div>
        </div>
      )}
    </section>
  )
}

// ── 2. How It Works ────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section className="bg-white border-y border-[#dde8f5] py-16">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-[#12304f] mb-2 text-center">
          How JC CLAWs Works
        </h2>
        <p className="text-sm text-[#94afd5] text-center mb-12 uppercase tracking-wider font-semibold">
          Four steps. Thirty seconds each.
        </p>

        <div className="space-y-10">
          {/* Step 1 */}
          <StepCard
            n={1}
            icon="pin_drop"
            title="Enter Any Singapore Postcode"
            body="Just a 6-digit postcode. JC CLAWs identifies the Planning Area, business zone, nearby commercial buildings, and prospect density."
          >
            <SampleInset>
              <p><Lab>Postcode</Lab>238801</p>
              <p><Lab>Area</Lab>Orchard Road</p>
              <p><Lab>Businesses Found</Lab>427</p>
              <p><Lab>High-Value Prospects</Lab>83</p>
              <p><Lab>Estimated Outreach Potential</Lab>$48,000+</p>
            </SampleInset>
          </StepCard>

          {/* Step 2 */}
          <StepCard
            n={2}
            icon="apartment"
            title="Discover Businesses Nearby"
            body="Every reachable business in the zone is collected and scored by AI on online presence, contact completeness, and outreach potential. Focus on the best opportunities first."
          >
            <SampleInset>
              <table className="w-full text-xs">
                <thead className="text-[#94afd5] uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="text-left pb-2">Business</th>
                    <th className="text-left pb-2">Sector</th>
                    <th className="text-right pb-2">Score</th>
                    <th className="text-right pb-2">Phone</th>
                    <th className="text-right pb-2">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dde8f5]">
                  {[
                    ['ABC Dental',         'Healthcare',   92],
                    ['XYZ Trading',        'Wholesale',    88],
                    ['Prime Services',     'Professional', 84],
                    ['Elite Engineering',  'Industrial',   80],
                  ].map(([name, sector, score]) => (
                    <tr key={name as string}>
                      <td className="py-1.5 text-[#12304f] font-medium">{name}</td>
                      <td className="py-1.5 text-[#425d7f]">{sector}</td>
                      <td className="py-1.5 text-right font-mono text-[#006092] font-semibold">{score}</td>
                      <td className="py-1.5 text-right text-emerald-600">✓</td>
                      <td className="py-1.5 text-right text-emerald-600">✓</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SampleInset>
          </StepCard>

          {/* Step 3 */}
          <StepCard
            n={3}
            icon="campaign"
            title="Launch Outreach"
            body="WhatsApp, email, Facebook Messenger, phone — all from one dashboard. Track every reply, open, and meeting booked."
          >
            <SampleInset>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-3">
                Campaign: Orchard Retail Outreach
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <StatTile label="Contacted"  value="125" />
                <StatTile label="Delivered"  value="119" sub="95%" />
                <StatTile label="Open rate"  value="84%" />
                <StatTile label="Replies"    value="23"  sub="18%" />
                <StatTile label="Meetings"   value="8"   sub="6%" />
              </div>
            </SampleInset>
          </StepCard>

          {/* Step 4 */}
          <StepCard
            n={4}
            icon="schedule_send"
            title="Receive WhatsApp Reports"
            body="No need to log in every day. JC CLAWs sends a single morning digest to your WhatsApp: who replied, who needs you, and what to do next."
          >
            <SampleInset className="bg-[#e6f4ea] p-4">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-xs font-semibold text-[#12304f]">JC CLAWs · Daily Report</p>
                <p className="text-[10px] text-[#425d7f]">09:00 SGT</p>
              </div>
              <p className="text-sm font-semibold text-[#12304f] mb-2">📍 Orchard Campaign</p>
              <div className="grid grid-cols-2 gap-1.5 text-xs mb-3">
                <StatChip label="Sent"     value="125" />
                <StatChip label="Replied"  value="23"  sub="18%" />
                <StatChip label="Interested" value="9" />
                <StatChip label="Meetings" value="4"   sub="scheduled" />
              </div>
              <p className="text-[11px] font-semibold text-[#12304f] mb-2">⚡ Top leads need you:</p>
              <div className="space-y-1.5">
                {[
                  ['ABC Dental',     'Interested in appointment booking automation'],
                  ['XYZ Trading',    'Requested quotation'],
                  ['Prime Services', 'Wants product demo'],
                ].map(([name, msg]) => (
                  <div key={name} className="bg-white rounded-lg px-2.5 py-1.5">
                    <p className="text-[11px] font-semibold text-[#12304f]">{name}</p>
                    <p className="text-[10px] text-[#425d7f] italic mt-0.5">&ldquo;{msg}&rdquo;</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-[#cfe5d4] text-[10px] text-[#006092] font-semibold text-center">
                View dashboard →
              </div>
            </SampleInset>
          </StepCard>
        </div>
      </div>
    </section>
  )
}

// ── 3. Sample Dashboard ────────────────────────────────────────────────

function SampleDashboard() {
  const overview = [
    { label: 'Postcodes Analysed',  value: '42'      },
    { label: 'Businesses Found',    value: '8,732'   },
    { label: 'Contactable',         value: '6,984'   },
    { label: 'Active Campaigns',    value: '12'      },
    { label: 'Total Replies',       value: '537'     },
    { label: 'Meetings Generated',  value: '91'      },
  ]

  const performance = [
    ['Businesses Found',     '8,732'],
    ['Contacts Verified',    '6,984'],
    ['Messages Sent',        '4,108'],
    ['Replies',              '537'],
    ['Positive Responses',   '164'],
    ['Meetings',             '91'],
  ]

  const funnel = [
    { label: 'Businesses Found',  value: 8732, pct: 100 },
    { label: 'Contactable',       value: 6984, pct:  80 },
    { label: 'Contacted',         value: 4108, pct:  47 },
    { label: 'Replies',           value:  537, pct:   6 },
    { label: 'Interested',        value:  164, pct:   2 },
    { label: 'Meetings',          value:   91, pct:   1 },
  ]

  return (
    <section className="py-16">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-[#12304f] mb-2 text-center">
          What Your Dashboard Looks Like
        </h2>
        <p className="text-sm text-[#94afd5] text-center mb-10 uppercase tracking-wider font-semibold">
          Sample numbers from a 3-month active campaign
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Territory Overview */}
          <div className="bg-white rounded-xl border border-[#dde8f5] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-3">
              Territory Overview
            </p>
            <div className="grid grid-cols-2 gap-3">
              {overview.map(s => (
                <div key={s.label} className="bg-[#f3f6ff] rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-[#006092] leading-none">{s.value}</p>
                  <p className="text-[10px] text-[#425d7f] mt-1 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Revenue Pipeline</p>
              <p className="text-2xl font-bold text-emerald-800 leading-none mt-1">$284,000</p>
            </div>
          </div>

          {/* Campaign Performance */}
          <div className="bg-white rounded-xl border border-[#dde8f5] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-3">
              Campaign Performance
            </p>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[#dde8f5]">
                {performance.map(([label, value]) => (
                  <tr key={label}>
                    <td className="py-2 text-[#425d7f]">{label}</td>
                    <td className="py-2 text-right font-mono font-semibold text-[#12304f]">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lead Funnel */}
          <div className="bg-white rounded-xl border border-[#dde8f5] p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-3">
              Lead Funnel
            </p>
            <div className="space-y-2">
              {funnel.map((f, i) => (
                <div key={f.label}>
                  <div className="flex items-baseline justify-between text-xs mb-0.5">
                    <span className="text-[#425d7f]">{f.label}</span>
                    <span className="font-mono font-semibold text-[#12304f]">{f.value.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-[#f3f6ff] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#006092]"
                      style={{ width: `${f.pct}%` }}
                    />
                  </div>
                  {i < funnel.length - 1 && (
                    <div className="text-center text-[#dde8f5] text-xs leading-none my-1">↓</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── 4. Who Uses It ─────────────────────────────────────────────────────

function WhoUsesIt() {
  const personas = [
    { icon: 'groups',       title: 'B2B Sales Teams',          body: 'Find prospects around target territories instantly.' },
    { icon: 'shield_person', title: 'Insurance Agents',         body: 'Identify nearby SMEs and retail businesses to quote.' },
    { icon: 'speed',        title: 'Digital Marketing Agencies', body: 'Build local prospect lists for client pitches.' },
    { icon: 'memory',       title: 'IT & Software Companies',  body: 'Target businesses likely to need technology upgrades.' },
    { icon: 'work',         title: 'Recruitment Agencies',      body: 'Discover local employers actively hiring.' },
    { icon: 'apartment',    title: 'Property Agents',           body: 'Find businesses expanding into new locations.' },
  ]

  return (
    <section className="bg-white border-y border-[#dde8f5] py-16">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-[#12304f] mb-2 text-center">
          Who Uses JC CLAWs
        </h2>
        <p className="text-sm text-[#94afd5] text-center mb-10 uppercase tracking-wider font-semibold">
          Built for everyone whose pipeline is local
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {personas.map(p => (
            <div key={p.title} className="bg-[#f3f6ff] rounded-xl p-5 border border-[#dde8f5]">
              <span className="material-symbols-outlined text-[#006092]" style={{ fontSize: 32 }}>
                {p.icon}
              </span>
              <p className="font-semibold text-[#12304f] mt-2">{p.title}</p>
              <p className="text-xs text-[#425d7f] mt-1 leading-snug">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── 5. Benefits ────────────────────────────────────────────────────────

function Benefits() {
  const benefits = [
    { icon: 'schedule',       title: 'Save Hours of Prospecting',  body: 'No manual Google searching. One postcode, hundreds of leads.' },
    { icon: 'travel_explore', title: 'Reach More Businesses',      body: 'Find every reachable business in the zone — not just the ones that Google ranked.' },
    { icon: 'verified',       title: 'Better Lead Quality',        body: 'AI scoring prioritises businesses most likely to reply.' },
    { icon: 'monitoring',     title: 'Track Everything',           body: 'Outreach, replies, and meetings — all in one place.' },
    { icon: 'forum',          title: 'Direct WhatsApp Reporting',  body: 'Updates land in your pocket every morning. No need to open the app.' },
  ]

  return (
    <section className="py-16">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-[#12304f] mb-2 text-center">
          Why Teams Choose JC CLAWs
        </h2>
        <p className="text-sm text-[#94afd5] text-center mb-10 uppercase tracking-wider font-semibold">
          Five outcomes you get from day one
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {benefits.map(b => (
            <div key={b.title} className="bg-white rounded-xl p-5 border border-[#dde8f5] shadow-sm">
              <span className="material-symbols-outlined text-[#006092]" style={{ fontSize: 32 }}>
                {b.icon}
              </span>
              <p className="font-semibold text-[#12304f] mt-2">{b.title}</p>
              <p className="text-xs text-[#425d7f] mt-1 leading-snug">{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── 6. Final CTA ───────────────────────────────────────────────────────

function FinalCta({ authed }: { authed: boolean | null }) {
  const ladder = [
    'Enter a postcode.',
    'Discover nearby businesses.',
    'Launch outreach.',
    'Get replies.',
    'Book meetings.',
    'Grow revenue.',
  ]

  // Headline + button copy adapt: anonymous gets the conversion-focused
  // pitch, logged-in users get a "ready when you are" version that goes
  // straight to the dashboard.
  const heading = authed
    ? 'Ready to Map Your Next Zone?'
    : 'Turn Any Singapore Postcode Into New Business Opportunities'
  const buttonLabel = authed
    ? 'Open your dashboard →'
    : 'Start Prospecting with JC CLAWs Today →'
  const ctaHref = authed ? '/?ref=tour' : '/?ref=sample'
  const subtitle = authed
    ? 'You\'re already signed in — pick a postcode and go.'
    : 'Free trial. No credit card. Just a Singapore postcode.'

  return (
    <section className="bg-[#12304f] text-white py-20">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-6">
          {heading}
        </h2>
        <ul className="text-base text-[#94afd5] mb-8 space-y-1">
          {ladder.map(l => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <a
          href={ctaHref}
          className="inline-block bg-[#006092] hover:bg-[#0a7ab8] text-white px-8 py-4 rounded-xl text-base font-semibold transition-colors shadow-lg"
        >
          {buttonLabel}
        </a>
        <p className="text-xs text-[#94afd5] mt-4">
          {subtitle}
        </p>
      </div>
    </section>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="#10b981" aria-hidden>
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
  )
}

function StepCard({ n, icon, title, body, children }: {
  n:        number
  icon:     string
  title:    string
  body:     string
  children: React.ReactNode
}) {
  return (
    <div className="bg-[#f3f6ff] rounded-2xl border border-[#dde8f5] p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-bold tracking-widest text-[#94afd5]">STEP {n}</span>
          <span className="material-symbols-outlined text-[#006092]" style={{ fontSize: 28 }}>{icon}</span>
        </div>
        <h3 className="text-xl font-bold text-[#12304f] mb-2">{title}</h3>
        <p className="text-sm text-[#425d7f] leading-relaxed">{body}</p>
      </div>
      <div>
        {children}
      </div>
    </div>
  )
}

function SampleInset({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-[#dde8f5] p-5 text-sm text-[#425d7f] space-y-1 ${className ?? ''}`}>
      {children}
    </div>
  )
}

function Lab({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider text-[#94afd5] mr-2">{children}</span>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg px-2 py-2 text-center border border-[#dde8f5]">
      <p className="text-[9px] uppercase tracking-wider text-[#94afd5]">{label}</p>
      <p className="text-base font-bold text-[#12304f] leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-[#425d7f]">{sub}</p>}
    </div>
  )
}

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg px-2.5 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-[#94afd5]">{label}</p>
      <p className="text-sm font-bold text-[#12304f] leading-tight">
        {value}
        {sub && <span className="text-[9px] font-medium text-[#425d7f] ml-1">{sub}</span>}
      </p>
    </div>
  )
}
