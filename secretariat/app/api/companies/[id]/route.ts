import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string }> }

// GET /api/companies/[id] — company + linked persons
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { data: company, error } = await svc
    .schema('app_secretariat')
    .from('companies')
    .select('id, name, uen, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: links } = await svc
    .schema('app_secretariat')
    .from('company_persons')
    .select(`
      id,
      role,
      persons!inner(id, full_name, nric_masked, nationality, dob, address, deleted_at)
    `)
    .eq('company_id', id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persons = (links ?? []).flatMap((l: any) => {
    const p = l.persons
    if (!p || p.deleted_at) return []
    return [{ link_id: l.id, role: l.role, ...p }]
  })

  return NextResponse.json({ ...company, persons })
}

// PATCH /api/companies/[id] — update name/uen
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('name' in body) updates.name = String(body.name).trim()
  if ('uen'  in body) updates.uen  = String(body.uen).trim()

  const svc = createServiceClient()
  const { data, error } = await svc
    .schema('app_secretariat')
    .from('companies')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id, name, uen, updated_at')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/companies/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { error } = await svc
    .schema('app_secretariat')
    .from('companies')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
