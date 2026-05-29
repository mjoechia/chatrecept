import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase-server'
import { authConfigured } from '@/lib/admin'
import { upsertUser } from '@/lib/claws-users'
import EmailSignInForm from '@/app/_components/EmailSignInForm'
import GoogleSignInButton from '@/app/_components/GoogleSignInButton'

export const dynamic = 'force-dynamic'

// Server-side gate against already-authed visitors. If someone with a
// live session lands here (old bookmark, accidental click on the header
// link), bounce them to the dashboard instead of showing a sign-in
// form they don't need — that was the source of "wait, am I actually
// signed in?" confusion.
export default async function LoginPage() {
  if (authConfigured()) {
    try {
      const supabase = await createSessionClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        // upsertUser is the source of truth for is_admin; same lookup
        // /auth/callback uses to decide the post-login destination.
        let isAdmin = false
        try {
          const claws = await upsertUser({
            authUserId:     user.id,
            email:          user.email,
            name:           (user.user_metadata?.full_name       as string | undefined) ?? null,
            whatsappNumber: (user.user_metadata?.whatsapp_number as string | undefined) ?? null,
          })
          isAdmin = claws.is_admin
        } catch {
          // If upsert fails (e.g. migration not applied), fall through to
          // the safer redirect target — the dashboard, not the admin view.
        }
        redirect(isAdmin ? '/admin' : '/')
      }
    } catch {
      // Same safe fallback — render the sign-in form below.
    }
  }

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
