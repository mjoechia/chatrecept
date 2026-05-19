// Admin + auth guards for API routes.

import { NextResponse } from 'next/server'
import { createSessionClient } from './supabase-server'
import { upsertUser, type ClawsUser } from './claws-users'

type AuthResult<T> =
  | { ok: true; user: T; error?: never }
  | { ok: false; user?: never; error: NextResponse }

// Returns true if Supabase env vars are configured. Lets routes return a
// clean error before attempting any auth operation, instead of throwing
// when the Supabase client can't be constructed.
export function authConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

// Require a logged-in user. Upserts the claws user record on first sight.
// Returns the user row (with mapping_enabled / is_admin flags) or a 401.
export async function requireUser(): Promise<AuthResult<ClawsUser>> {
  if (!authConfigured()) {
    return {
      ok: false,
      error: NextResponse.json({
        error: 'Sign-in is not configured yet on this server. Try a sample zone, or check back soon.',
        auth_unavailable: true,
      }, { status: 503 }),
    }
  }

  try {
    const supabase = await createSessionClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return { ok: false, error: NextResponse.json({ error: 'Sign in to use this feature' }, { status: 401 }) }
    }

    const claws = await upsertUser({
      authUserId: user.id,
      email:      user.email,
      name:       (user.user_metadata?.full_name as string | undefined) ?? null,
    })
    return { ok: true, user: claws }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[requireUser]', message)
    return { ok: false, error: NextResponse.json({ error: `Auth error: ${message}` }, { status: 500 }) }
  }
}

// Require an admin. Wraps requireUser + checks is_admin.
export async function requireAdmin(): Promise<AuthResult<ClawsUser>> {
  const res = await requireUser()
  if (!res.ok) return res
  if (!res.user.is_admin) {
    return { ok: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return res
}
