export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About JC CLAWs — The Precision Predator for SME Sales',
  description: 'The AI SDR your small business never has to hire — maps your area, talks to leads on WhatsApp, books meetings.',
}

// Design system colors (from the about-page brief — distinct from the demo page)
const C = {
  bg:               '#f8f9ff',
  surface:          '#f8f9ff',
  surfaceLow:       '#eff4ff',
  surfaceHigh:      '#dce9ff',
  surfaceLowest:    '#ffffff',
  onBg:             '#0b1c30',
  onSurface:        '#0b1c30',
  onSurfaceVariant: '#41484a',
  outlineVariant:   '#c0c8ca',
  primary:          '#00252c',
  primaryContainer: '#0d3b45',
  onPrimary:        '#ffffff',
  secondary:        '#506600',     // dark olive (used for small badges)
  secondaryFixed:   '#c3f400',     // lime (used for emphasis text + accents)
  onSecondaryFixed: '#161e00',
  onSecondary:      '#ffffff',
  onTertiaryCont:   '#00b2a0',
  error:            '#ba1a1a',
} as const

export default function AboutPage() {
  return (
    <main className="font-inter" style={{ backgroundColor: C.bg, color: C.onBg, minHeight: '100vh' }}>

      {/* Hero */}
      <section className="px-4 md:px-8 py-12" style={{ backgroundColor: C.surface }}>
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          <span className="text-xs font-semibold tracking-[0.18em]" style={{ color: C.secondary }}>
            THE PRECISION PREDATOR
          </span>
          <h1 className="font-hanken text-3xl md:text-5xl font-bold leading-tight" style={{ color: C.primary }}>
            The AI SDR Your Small Business Never Has to Hire.
          </h1>
          <p className="text-base" style={{ color: C.onSurfaceVariant }}>
            Map your area, talk to leads on WhatsApp in your brand voice, and book meetings while you focus on the work that pays.
          </p>
          <div className="mt-6 rounded-xl shadow-md h-64 flex items-center justify-center text-sm"
            style={{ backgroundColor: C.primaryContainer, color: C.secondaryFixed }}>
            <div className="text-center px-6">
              <span className="material-symbols-outlined" style={{ fontSize: 48 }}>map</span>
              <p className="mt-2 font-semibold tracking-wide">Territory map · Reachability scoring · WhatsApp outreach</p>
            </div>
          </div>
        </div>
      </section>

      {/* Problem / Solution Bento */}
      <section className="px-4 md:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-hanken text-2xl md:text-3xl font-semibold mb-6" style={{ color: C.primary }}>
            Sales is a Grind. We Automate it.
          </h2>
          <div className="flex flex-col gap-3">
            {/* Card 1 — light */}
            <div className="p-6 rounded-xl shadow-sm border"
              style={{ backgroundColor: C.surfaceLowest, borderColor: C.outlineVariant }}>
              <div className="flex items-center gap-1 mb-2" style={{ color: C.error }}>
                <span className="material-symbols-outlined">cancel</span>
                <span className="text-xs font-semibold tracking-wider">THE PAIN</span>
              </div>
              <p className="font-bold mb-4" style={{ color: C.onSurface }}>
                &quot;I don&apos;t know who to talk to or where to find them.&quot;
              </p>
              <div className="flex items-center gap-1 mb-2" style={{ color: C.onTertiaryCont }}>
                <span className="material-symbols-outlined">check_circle</span>
                <span className="text-xs font-semibold tracking-wider">JC CLAWs SOLUTION</span>
              </div>
              <p className="text-sm" style={{ color: C.onSurfaceVariant }}>
                Autonomous mapping of every reachable business in your target SG postal codes.
              </p>
            </div>

            {/* Card 2 — dark */}
            <div className="p-6 rounded-xl shadow-sm" style={{ backgroundColor: C.primary, color: C.onPrimary }}>
              <div className="flex items-center gap-1 mb-2" style={{ color: C.secondaryFixed }}>
                <span className="material-symbols-outlined">bolt</span>
                <span className="text-xs font-semibold tracking-wider">THE PREDATOR EDGE</span>
              </div>
              <p className="font-bold mb-4">
                &quot;I hate cold calling and monitoring LinkedIn all day.&quot;
              </p>
              <p className="text-sm opacity-90">
                JC CLAWs engages leads directly on WhatsApp using Voice Training that mimics your exact closing style.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Math */}
      <section className="px-4 md:px-8 py-12" style={{ backgroundColor: C.surfaceLow }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="font-hanken text-2xl md:text-3xl font-semibold mb-1" style={{ color: C.primary }}>
            Why SGD 600/mo is Cheap
          </h2>
          <p className="text-sm mb-6" style={{ color: C.onSurfaceVariant }}>
            The reality of building a sales team in Singapore.
          </p>
          <div className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: C.surfaceLowest, borderColor: C.outlineVariant }}>
            <table className="w-full text-left border-collapse">
              <thead style={{ backgroundColor: C.surfaceHigh }}>
                <tr>
                  <th className="p-3 text-sm font-semibold" style={{ color: C.onSurface }}>Option</th>
                  <th className="p-3 text-sm font-semibold" style={{ color: C.onSurface }}>Cost / Month</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr style={{ borderBottom: `1px solid ${C.outlineVariant}` }}>
                  <td className="p-3">Junior SDR (basic + CPF)</td>
                  <td className="p-3 font-bold" style={{ color: C.error }}>~$6,000</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${C.outlineVariant}` }}>
                  <td className="p-3">Lead Gen Agency</td>
                  <td className="p-3 font-bold" style={{ color: C.onSurfaceVariant }}>$3,000 – $5,000</td>
                </tr>
                <tr style={{ backgroundColor: `${C.secondaryFixed}1a` }}>
                  <td className="p-3 font-bold" style={{ color: C.primary }}>JC CLAWs AI</td>
                  <td className="p-3 font-bold text-lg" style={{ color: C.primary }}>$600</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm italic text-center" style={{ color: C.onSurfaceVariant }}>
            No leave, no MC, no CPF. Just results.
          </p>
        </div>
      </section>

      {/* ROI Scenarios */}
      <section className="px-4 md:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-hanken text-2xl md:text-3xl font-semibold mb-6" style={{ color: C.primary }}>
            Local ROI Scenarios
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <RoiCard
              title="F&B (Orchard / CBD)"
              badge="HIGH CONFIDENCE"
              body="Targeting corporate offices for catering. JC CLAWs maps 200 nearby buildings and secures 15 recurring lunch contracts in month one."
            />
            <RoiCard
              title="Audit & Tax Firms"
              badge="PRECISION"
              body="Reaching out to new ACRA registrations. JC CLAWs initiates contact within 4 hours of registration, before the competition even wakes up."
            />
            <RoiCard
              title="Retail Re-engagement"
              badge="REVENUE BOOSTER"
              body="Reviving 500 dormant customers via personalised WhatsApp offers. JC CLAWs handles 100 simultaneous conversations to drive weekend footfall."
            />
          </div>
        </div>
      </section>

      {/* What JC CLAWs is NOT */}
      <section className="px-4 md:px-8 py-12" style={{ backgroundColor: C.primary, color: C.onPrimary }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="font-hanken text-2xl md:text-3xl font-semibold mb-6">What JC CLAWs is NOT</h2>
          <ul className="flex flex-col gap-3">
            <li className="flex gap-3 items-start">
              <span className="material-symbols-outlined" style={{ color: C.secondaryFixed }}>do_not_disturb_on</span>
              <p className="text-sm">
                <strong>Not a Chatbot.</strong> It doesn&apos;t wait for people to visit your site. It goes out and hunts.
              </p>
            </li>
            <li className="flex gap-3 items-start">
              <span className="material-symbols-outlined" style={{ color: C.secondaryFixed }}>do_not_disturb_on</span>
              <p className="text-sm">
                <strong>Not a LinkedIn bot.</strong> We don&apos;t spam InMails that get ignored. We use the platform Singaporeans actually use: WhatsApp.
              </p>
            </li>
            <li className="flex gap-3 items-start">
              <span className="material-symbols-outlined" style={{ color: C.secondaryFixed }}>do_not_disturb_on</span>
              <p className="text-sm">
                <strong>Not a template filler.</strong> JC CLAWs is trained on your specific voice, slang, and technical jargon.
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* Technical Moat */}
      <section className="px-4 md:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-hanken text-2xl md:text-3xl font-semibold mb-6" style={{ color: C.primary }}>
            Our Technical Moat
          </h2>
          <div className="grid grid-cols-1 gap-6">
            <Moat
              icon="security"
              title="WhatsApp Deliverability"
              body="Proprietary warming protocols, randomised cadence and quality-score monitoring keep your messages landing in &lsquo;Chat&rsquo; not &lsquo;Spam&rsquo;."
            />
            <Moat
              icon="record_voice_over"
              title="Voice Training"
              body="We ingest your last 100 successful emails and texts to build a semantic twin of your brand voice."
            />
            <Moat
              icon="hub"
              title="SG SME Interaction Graph"
              body="Every campaign teaches JC CLAWs what works by sector × district. By month 6, a new tenant gets benchmarked reply rates before they launch."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 md:px-8 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-hanken text-3xl md:text-5xl font-bold mb-6" style={{ color: C.primary }}>
            Ready to let the Predator loose?
          </h2>
          <a
            href="/"
            className="inline-block w-full md:w-auto md:px-12 py-4 rounded-xl shadow-lg uppercase tracking-widest font-semibold text-sm transition-all duration-200 active:scale-95"
            style={{ backgroundColor: C.secondaryFixed, color: C.onSecondaryFixed }}
          >
            Map My Zone — Start the Demo
          </a>
          <p className="mt-6 text-sm" style={{ color: C.onSurfaceVariant }}>
            Onboarding takes 15 minutes. Results take 24 hours.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: C.primary, borderTop: `1px solid ${C.outlineVariant}` }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="font-hanken text-2xl font-black" style={{ color: C.secondaryFixed }}>JC CLAWs</span>
            <p className="text-sm text-center md:text-left" style={{ color: '#a4cdda' }}>
              © 2026 ChatRecept. The Precision Predator for SME Sales.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm" style={{ color: '#a4cdda' }}>
            <a href="/" className="hover:underline underline-offset-4">Demo</a>
            <a href="/about" className="hover:underline underline-offset-4">About</a>
            <a href="https://chatrecept.chat/" className="hover:underline underline-offset-4">ChatRecept</a>
          </div>
        </div>
      </footer>
    </main>
  )
}

function RoiCard({ title, badge, body }: { title: string; badge: string; body: string }) {
  return (
    <div className="p-6 rounded-xl border"
      style={{
        background: `linear-gradient(135deg, ${C.surface} 0%, ${C.surfaceLow} 100%)`,
        borderColor: '#7ca5b1',
        borderStyle: 'dashed',
      }}>
      <div className="flex justify-between items-start mb-3 gap-2">
        <h3 className="font-bold text-sm" style={{ color: C.primary }}>{title}</h3>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
          style={{ backgroundColor: C.secondary, color: C.onSecondary }}>
          {badge}
        </span>
      </div>
      <p className="text-sm" style={{ color: C.onSurfaceVariant }}>{body}</p>
    </div>
  )
}

function Moat({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="p-3 rounded-lg" style={{ backgroundColor: C.primaryContainer }}>
        <span className="material-symbols-outlined" style={{ color: C.secondaryFixed }}>{icon}</span>
      </div>
      <div>
        <h4 className="font-bold text-sm mb-1" style={{ color: C.primary }}>{title}</h4>
        <p className="text-sm" style={{ color: C.onSurfaceVariant }}>{body}</p>
      </div>
    </div>
  )
}
