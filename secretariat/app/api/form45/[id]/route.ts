import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { getSignedUrl } from '@/lib/storage'

// GET /api/form45/[id] — returns form data + fresh signed URL on demand
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('form45')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let download_url: string | null = null
  if (data.pdf_path && data.status === 'generated') {
    try {
      download_url = await getSignedUrl(data.pdf_path)
    } catch {
      // Non-fatal: return form data without URL
    }
  }

  return NextResponse.json({ ...data, download_url })
}

// DELETE /api/form45/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { error } = await svc
    .from('form45')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
