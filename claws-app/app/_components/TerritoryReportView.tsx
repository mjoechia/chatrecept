// Renders a TerritoryReport — extracted from AuthedHome so both the
// signed-in dashboard and the public /sample marketing page can share
// the same report visual. Pure presentational; no state, no side
// effects, no API calls.

import type { TerritoryReport } from '@/lib/demo-report'

export default function TerritoryReportView({ report }: { report: TerritoryReport }) {
  return (
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
