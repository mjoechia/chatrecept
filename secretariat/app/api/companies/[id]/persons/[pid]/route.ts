import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'

type Params = { params: Promise<{ id: string; pid: string }> }

// DELETE /api/companies/[id]/persons/[pid] — unlink person from company
// pid is the company_persons.id (link row), not the person id
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: companyId, pid: linkId } = await params
  const svc = createServiceClient()

  // Verify company belongs to this user
  const { data: company } = await svc
    .from('companies')
    .select('user_id')
    .eq('id', companyId)
    .eq('user_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const { error } = await svc
    .from('company_persons')
    .delete()
    .eq('id', linkId)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
