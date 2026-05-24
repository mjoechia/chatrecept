export const dynamic = 'force-dynamic'

import EmailSignInForm from '@/app/_components/EmailSignInForm'
import GoogleSignInButton from '@/app/_components/GoogleSignInButton'

export default function LoginPage() {
  return (
    <main className="min-h-[70vh] max-w-md mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#12304f] mb-2">Sign in to JC CLAWs</h1>
        <p className="text-sm text-[#425d7f]">
          Your daily mapping budget is tracked per account.
        </p>
      </div>

      <div className="bg-white border border-[#dde8f5] rounded-xl p-6 shadow-sm space-y-4">
        <EmailSignInForm />

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[#dde8f5]" />
          <span className="text-[10px] uppercase tracking-wider text-[#94afd5]">or</span>
          <div className="flex-1 h-px bg-[#dde8f5]" />
        </div>

        <GoogleSignInButton />
      </div>

      <p className="mt-6 text-center text-xs text-[#94afd5]">
        New to JC CLAWs?{' '}
        <a href="/" className="text-[#006092] hover:underline font-semibold">
          Create an account
        </a>
      </p>
    </main>
  )
}
