import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/persons/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('persons')
    .select('id, full_name, nric_masked, nationality, dob, address, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/persons/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = ['full_name', 'nric_masked', 'nric_encrypted', 'nationality', 'dob', 'address']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key] === '' ? null : body[key]
  }

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('persons')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id, full_name, nric_masked, nationality, dob, address, updated_at')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/persons/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { error } = await svc
    .from('persons')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
