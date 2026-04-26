import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// POST /api/companies/[id]/persons — link a person to a company
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: companyId } = await params
  let body: { person_id?: string; role?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { person_id, role = 'director' } = body
  if (!person_id) return NextResponse.json({ error: 'person_id is required' }, { status: 400 })

  // Ownership validation: both company and person must belong to this user
  const [{ data: company }, { data: person }] = await Promise.all([
    supabase.schema('app_secretariat').from('companies').select('user_id').eq('id', companyId).is('deleted_at', null).single(),
    supabase.schema('app_secretariat').from('persons').select('user_id').eq('id', person_id).is('deleted_at', null).single(),
  ])

  if (!company || company.user_id !== user.id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }
  if (!person || person.user_id !== user.id) {
    return NextResponse.json({ error: 'Person not found or does not belong to your account' }, { status: 403 })
  }

  const { data, error } = await supabase
    .schema('app_secretariat')
    .from('company_persons')
    .insert({ company_id: companyId, person_id, role })
    .select('id, company_id, person_id, role')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This person is already linked to this company with that role' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
