import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/persons — list user's persons (soft-deleted excluded)
export async function GET() {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data, error } = await svc
    .schema('app_secretariat')
    .from('persons')
    .select('id, full_name, nric_masked, nationality, dob, address, created_at, updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/persons — create person (with soft duplicate detection)
export async function POST(req: NextRequest) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    full_name?: string
    nric_masked?: string
    nric_encrypted?: string
    nationality?: string
    dob?: string
    address?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const full_name = String(body.full_name ?? '').trim()
  if (!full_name) return NextResponse.json({ error: 'full_name is required' }, { status: 400 })

  const svc = createServiceClient()

  // Soft duplicate detection: same full_name + dob for this user
  let duplicate_warning = false
  if (body.dob) {
    const { data: existing } = await svc
      .schema('app_secretariat')
      .from('persons')
      .select('id')
      .eq('user_id', user.id)
      .eq('full_name', full_name)
      .eq('dob', body.dob)
      .is('deleted_at', null)
      .limit(1)
    duplicate_warning = (existing?.length ?? 0) > 0
  }

  const { data, error } = await svc
    .schema('app_secretariat')
    .from('persons')
    .insert({
      user_id:        user.id,
      full_name,
      nric_masked:    body.nric_masked    ? String(body.nric_masked).trim()    : null,
      nric_encrypted: body.nric_encrypted ? String(body.nric_encrypted).trim() : null,
      nationality:    body.nationality    ? String(body.nationality).trim()    : null,
      dob:            body.dob            ? String(body.dob).trim()            : null,
      address:        body.address        ? String(body.address).trim()        : null,
    })
    .select('id, full_name, nric_masked, nationality, dob, address, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, duplicate_warning }, { status: 201 })
}
