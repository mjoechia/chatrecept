export const dynamic = 'force-dynamic'

import GoogleSignInButton from '@/app/_components/GoogleSignInButton'

export default function LoginPage() {
  return (
    <main className="min-h-[70vh] max-w-md mx-auto px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-[#12304f] mb-2">Sign in to JC CLAWs</h1>
      <p className="text-sm text-[#425d7f] mb-8">
        We use Google to verify it&apos;s you. Your daily mapping budget is tracked per account.
      </p>

      <GoogleSignInButton />

      <p className="mt-8 text-xs text-[#94afd5]">
        By signing in you agree that your email and name will be stored to track your mapping usage.
        Admins can disable mapping for any user.
      </p>
    </main>
  )
}
