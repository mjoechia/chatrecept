import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { downloadByPath } from '@/lib/storage'

// GET /api/admin/templates/[id]/pdf — serve raw template PDF bytes for calibrate canvas
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('form_templates')
    .select('pdf_storage_path')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pdfBytes = await downloadByPath(data.pdf_storage_path)
  if (!pdfBytes) return NextResponse.json({ error: 'PDF not found in storage' }, { status: 404 })

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store',
    },
  })
}
