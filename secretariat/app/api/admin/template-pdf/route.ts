import { NextResponse } from 'next/server'
import { loadTemplate } from '@/lib/pdf'
import { requireAdminSession } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// GET /api/admin/template-pdf — returns raw PDF bytes for the calibration canvas
export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  try {
    const bytes = await loadTemplate()
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type':  'application/pdf',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 404 })
  }
}
