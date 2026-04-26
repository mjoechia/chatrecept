import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/companies — list user's companies (soft-deleted excluded)
export async function GET() {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .schema('app_secretariat')
    .from('companies')
    .select('id, name, uen, created_at, updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/companies — create company
export async function POST(req: NextRequest) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: string; uen?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const uen  = String(body.uen  ?? '').trim()
  if (!name || !uen) return NextResponse.json({ error: 'name and uen are required' }, { status: 400 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .schema('app_secretariat')
    .from('companies')
    .insert({ user_id: user.id, name, uen })
    .select('id, name, uen, created_at, updated_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A company with this UEN already exists in your account' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
