import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

const INVITE_REDIRECT = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  : 'http://localhost:3001/auth/callback'

// POST /api/admin/users/resend-invite
// Body: { user_id }
export async function POST(req: NextRequest) {
  const { user: admin, error } = await requireAdminSession()
  if (error) return error

  let body: { user_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const userId = String(body.user_id ?? '').trim()
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const svc = createServiceClient()

  const { data: profile } = await svc
    .from('secretariat_profiles')
    .select('email, status')
    .eq('id', userId)
    .single()

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (profile.status !== 'invited') {
    return NextResponse.json({ error: 'User is not in invited state' }, { status: 400 })
  }

  const { error: inviteErr } = await svc.auth.admin.inviteUserByEmail(profile.email, {
    redirectTo: INVITE_REDIRECT,
  })

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

  await svc.from('secretariat_audit_log').insert({
    actor_id: admin.id,
    action: 'resend_invite',
    target_user_id: userId,
    metadata: { email: profile.email },
  })

  return NextResponse.json({ ok: true })
}
