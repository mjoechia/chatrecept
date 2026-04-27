import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { getSignedUrl } from '@/lib/storage'

// GET /api/batch/[id]/submissions — list generated submissions with signed download URLs
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await createSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const svc = createServiceClient()

  const { data, error } = await svc
    .from('form_submissions')
    .select('id, recipient_data, pdf_path, status, error_msg')
    .eq('batch_job_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach signed URLs for generated submissions
  const rows = await Promise.all((data ?? []).map(async sub => {
    let url: string | null = null
    if (sub.pdf_path && sub.status === 'generated') {
      try { url = await getSignedUrl(sub.pdf_path) } catch {}
    }
    return { ...sub, url }
  }))

  return NextResponse.json(rows)
}
