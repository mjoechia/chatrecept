import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { upsertUser } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

// GET /auth/callback?code=... — exchanges OAuth code for a Supabase session,
// then upserts the claws.users row.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const searchParams = url.searchParams
  // Railway puts the public host in x-forwarded-host; req.url's host header
  // reflects the internal upstream (e.g. localhost:8080), which would send
  // post-login redirects to the wrong origin.
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_code`)
  }

  const supabase = await createSessionClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  // Upsert the claws user record now that the session is established.
  // Capture the row so we can route admins to /admin by default.
  let isAdmin = false
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) {
    try {
      const claws = await upsertUser({
        authUserId:     user.id,
        email:          user.email,
        name:           (user.user_metadata?.full_name      as string | undefined) ?? null,
        whatsappNumber: (user.user_metadata?.whatsapp_number as string | undefined) ?? null,
      })
      isAdmin = claws.is_admin
    } catch (e) {
      console.error('[auth/callback] upsertUser failed', e)
    }
  }

  // Admin default landing — only when `next` is the bare home route; any
  // explicit destination (e.g. /auth/set-password, /?p=...&autorun=1) wins.
  const destination = isAdmin && next === '/' ? '/admin' : next
  return NextResponse.redirect(`${origin}${destination}`)
}
