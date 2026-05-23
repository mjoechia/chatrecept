import { createSessionClient } from '@/lib/supabase-server'
import { authConfigured } from '@/lib/admin'
import AnonymousLanding from './_components/AnonymousLanding'
import AuthedHome from './_components/AuthedHome'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Anonymous-by-default if Supabase isn't configured yet (local dev without
  // env vars). Otherwise read the session cookie and decide which view to
  // render server-side — no auth flash.
  let authed = false
  if (authConfigured()) {
    try {
      const supabase = await createSessionClient()
      const { data: { user } } = await supabase.auth.getUser()
      authed = !!user?.email
    } catch {
      authed = false
    }
  }

  return authed ? <AuthedHome /> : <AnonymousLanding />
}
