import { NextRequest, NextResponse } from 'next/server'
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
    .schema('app_secretariat')
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
