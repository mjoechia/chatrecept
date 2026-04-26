import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

const INVITE_REDIRECT = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  : 'http://localhost:3001/auth/callback'

// GET /api/admin/users — list all profiles
export async function GET() {
  const { user, error } = await requireAdminSession()
  if (error) return error

  const svc = createServiceClient()
  const { data, error: dbErr } = await svc
    .from('secretariat_profiles')
    .select('id, role, status, display_name, email, invited_by, created_at')
    .order('created_at', { ascending: false })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/users/invite
// Body: { email, display_name? }
export async function POST(req: NextRequest) {
  const { user: admin, error } = await requireAdminSession()
  if (error) return error

  let body: { email?: string; display_name?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const svc = createServiceClient()

  // Check for existing non-suspended profile
  const { data: existing } = await svc
    .from('secretariat_profiles')
    .select('id, status')
    .eq('email', email)
    .single()

  if (existing && existing.status !== 'suspended') {
    return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 })
  }

  const { data: inviteData, error: inviteErr } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo: INVITE_REDIRECT,
    data: { display_name: body.display_name ?? '' },
  })

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

  if (inviteData?.user?.id) {
    await svc.from('secretariat_profiles').upsert({
      id: inviteData.user.id,
      email,
      display_name: body.display_name ?? null,
      role: 'user',
      status: 'invited',
      invited_by: admin.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  }

  await svc.from('secretariat_audit_log').insert({
    actor_id: admin.id,
    action: 'invite',
    target_user_id: inviteData?.user?.id ?? null,
    metadata: { email, display_name: body.display_name ?? null },
  })

  return NextResponse.json({ ok: true, user_id: inviteData?.user?.id ?? null }, { status: 201 })
}
