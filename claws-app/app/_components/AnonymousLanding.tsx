import EmailSignupForm from './EmailSignupForm'
import GoogleSignInButton from './GoogleSignInButton'

export default function AnonymousLanding() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      {/* Hero */}
      <section className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-[#12304f] mb-3">
          JC CLAWs — AI Territory Intelligence
        </h1>
        <p className="text-sm md:text-base text-[#425d7f] max-w-xl mx-auto">
          Map Singapore postcodes, see the reachable businesses, and get daily
          outreach reports on WhatsApp.
        </p>
      </section>

      {/* How it works — three-step illustration */}
      <section className="bg-white rounded-xl border border-[#dde8f5] p-6 mb-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-5 text-center">
          How it works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-3">
          <Step
            n={1}
            icon="pin_drop"
            title="Enter postcode"
            body="Drop in any Singapore postal code — Orchard, Tampines, Tuas. We locate the zone."
          />
          <Step
            n={2}
            icon="apartment"
            title="See the businesses"
            body="A scored list of every reachable business nearby — phone, email, IG, FB, WhatsApp."
          />
          <Step
            n={3}
            icon="schedule_send"
            title="Get daily CLAWs reports"
            body="Once outreach is on, JC CLAWs WhatsApps you each morning: who replied, what to do."
          />
        </div>
      </section>

      {/* Sign up */}
      <section className="bg-white rounded-xl border border-[#dde8f5] p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#94afd5] mb-4 text-center">
          Get started
        </p>
        <div className="max-w-xs mx-auto space-y-4">
          <EmailSignupForm />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#dde8f5]" />
            <span className="text-[10px] uppercase tracking-wider text-[#94afd5]">or</span>
            <div className="flex-1 h-px bg-[#dde8f5]" />
          </div>
          <GoogleSignInButton label="Sign up with Google" />
        </div>
        <p className="mt-5 text-xs text-[#94afd5] text-center leading-snug">
          By signing up you agree that your email and name will be stored to track
          your mapping usage. New accounts start as pending — an admin approves
          access before live lookups.
        </p>
      </section>
    </main>
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
