import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/users/[id] — update role and/or status
export async function PATCH(req: NextRequest, { params }: Params) {
  const { user: admin, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params

  let body: { role?: string; status?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const svc = createServiceClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const allowed_roles   = ['admin', 'user']
  const allowed_statuses = ['active', 'suspended', 'invited']

  if (body.role && allowed_roles.includes(body.role))     updates.role   = body.role
  if (body.status && allowed_statuses.includes(body.status)) updates.status = body.status

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error: dbErr } = await svc
    .from('secretariat_profiles')
    .update(updates)
    .eq('id', id)
    .select('id, role, status, email')
    .single()

  if (dbErr || !data) return NextResponse.json({ error: dbErr?.message ?? 'Not found' }, { status: 404 })

  const action = body.role === 'admin' ? 'promote'
    : body.role === 'user' ? 'demote'
    : body.status === 'suspended' ? 'suspend'
    : body.status === 'active' ? 'activate'
    : 'update'

  await svc.from('secretariat_audit_log').insert({
    actor_id: admin.id,
    action,
    target_user_id: id,
    metadata: updates,
  })

  return NextResponse.json(data)
}

// DELETE /api/admin/users/[id] — soft delete (suspend); hard delete with ?hard=true
export async function DELETE(req: NextRequest, { params }: Params) {
  const { user: admin, error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const hard = new URL(req.url).searchParams.get('hard') === 'true'

  const svc = createServiceClient()

  if (hard) {
    const { error: delErr } = await svc.auth.admin.deleteUser(id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  } else {
    const { error: dbErr } = await svc
      .from('secretariat_profiles')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  await svc.from('secretariat_audit_log').insert({
    actor_id: admin.id,
    action: hard ? 'delete' : 'suspend',
    target_user_id: id,
    metadata: { hard },
  })

  return NextResponse.json({ ok: true })
}
