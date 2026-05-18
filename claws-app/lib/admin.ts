// Admin + auth guards for API routes.

import { NextResponse } from 'next/server'
import { createSessionClient } from './supabase-server'
import { upsertUser, type ClawsUser } from './claws-users'

type AuthResult<T> =
  | { ok: true; user: T; error?: never }
  | { ok: false; user?: never; error: NextResponse }

// Require a logged-in user. Upserts the claws user record on first sight.
// Returns the user row (with mapping_enabled / is_admin flags) or a 401.
export async function requireUser(): Promise<AuthResult<ClawsUser>> {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return { ok: false, error: NextResponse.json({ error: 'Sign in to use this feature' }, { status: 401 }) }
  }

  try {
    const claws = await upsertUser({
      authUserId: user.id,
      email:      user.email,
      name:       (user.user_metadata?.full_name as string | undefined) ?? null,
    })
    return { ok: true, user: claws }
  } catch (e) {
    return { ok: false, error: NextResponse.json({ error: String(e) }, { status: 500 }) }
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
