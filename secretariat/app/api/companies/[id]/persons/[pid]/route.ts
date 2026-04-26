import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string; pid: string }> }

// DELETE /api/companies/[id]/persons/[pid] — unlink person from company
// pid is the company_persons.id (link row), not the person id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: companyId, pid: linkId } = await params

  // RLS on companies ensures companyId belongs to user; verify via join
  const { data: company } = await supabase
    .schema('app_secretariat')
    .from('companies')
    .select('user_id')
    .eq('id', companyId)
    .single()

  if (!company || company.user_id !== user.id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const { error } = await supabase
    .schema('app_secretariat')
    .from('company_persons')
    .delete()
    .eq('id', linkId)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
