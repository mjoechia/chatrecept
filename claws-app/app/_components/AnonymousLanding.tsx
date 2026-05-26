import EmailSignupForm from './EmailSignupForm'
import GoogleSignInButton from './GoogleSignInButton'
import HowItWorks from './HowItWorks'

export default function AnonymousLanding() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      {/* Hero */}
      <section className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-[#12304f] mb-3">
          JC CLAWs — AI Territory Intelligence
        </h1>
        <p className="text-sm md:text-base text-[#425d7f] max-w-xl mx-auto">
          Map Singapore postcodes, see the reachable businesses, and get a
          WhatsApp report on outreach.
        </p>
      </section>

      <HowItWorks />

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
