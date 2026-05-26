// Three-step illustration shared across the anonymous landing and the
// authenticated home page so the brand experience stays consistent. The
// welcome email mirrors the same titles in HTML (lib/welcome-email.ts).

export default function HowItWorks() {
  return (
    <section className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-5 text-center">
        How it works
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-3">
        <Step
          n={1}
          icon="pin_drop"
          title="Enter Postcode"
          body="Drop in any Singapore postal code — Orchard, Tampines, Tuas. We locate the zone."
        />
        <Step
          n={2}
          icon="apartment"
          title="See Businesses"
          body="A scored list of every reachable business nearby — phone, email, IG, FB, WhatsApp."
        />
        <Step
          n={3}
          icon="description"
          title="Get Report"
          body="Once outreach is live, JC CLAWs sends you a WhatsApp report: who replied, what to do next."
        />
      </div>
    </section>
  )
}

interface StepProps {
  n:     number
  icon:  string
  title: string
  body:  string
}

function Step({ n, icon, title, body }: StepProps) {
  return (
    <div className="bg-[#f3f6ff] rounded-lg p-5 text-center relative">
      <span className="absolute top-3 left-3 text-[10px] font-bold tracking-widest text-[#94afd5]">
        {String(n).padStart(2, '0')}
      </span>
      <span
        className="material-symbols-outlined text-[#006092] mt-2"
        style={{ fontSize: 40 }}
      >
        {icon}
      </span>
      <p className="font-semibold text-[#12304f] mt-2">{title}</p>
      <p className="text-xs text-[#425d7f] mt-1 leading-snug">{body}</p>
    </div>
  )
}
