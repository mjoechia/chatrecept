import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase-server'
import { authConfigured } from '@/lib/admin'
import { upsertUser } from '@/lib/claws-users'
import EmailSignInForm from '@/app/_components/EmailSignInForm'
import GoogleSignInButton from '@/app/_components/GoogleSignInButton'

export const dynamic = 'force-dynamic'

// Server-side gate against already-authed visitors. If someone with a
// live session lands here (old bookmark, accidental click on the header
// link), bounce them to the dashboard instead of showing a sign-in form.
//
// CRITICAL: redirect() throws a NEXT_REDIRECT exception that Next.js
// must be allowed to propagate. If it lands inside a try/catch, the
// catch silently swallows the redirect and the page renders the form
// instead. So we do every step that might fail inside try/catches that
// only set state, then call redirect() at the top level once we know
// where to go.
export default async function LoginPage() {
  let destination: string | null = null

  if (authConfigured()) {
    let userEmail:     string | null = null
    let authUserId:    string | null = null
    let userMetadata:  Record<string, unknown> | null = null

    try {
      const supabase = await createSessionClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        userEmail    = user.email
        authUserId   = user.id
        userMetadata = user.user_metadata as Record<string, unknown> | null
      }
    } catch {
      // Session read failed — render the form below.
    }

    if (userEmail && authUserId) {
      let isAdmin = false
      try {
        const claws = await upsertUser({
          authUserId,
          email:          userEmail,
          name:           (userMetadata?.full_name       as string | undefined) ?? null,
          whatsappNumber: (userMetadata?.whatsapp_number as string | undefined) ?? null,
        })
        isAdmin = claws.is_admin
      } catch {
        // upsert failed (e.g. migration not applied yet) — fall through to
        // the safer non-admin destination.
      }
      destination = isAdmin ? '/admin' : '/'
    }
  }

  if (destination) redirect(destination)

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
