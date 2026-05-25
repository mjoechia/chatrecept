import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// POST /api/admin/whatsapp/test
// Sends a template message to a WhatsApp number so the admin can verify
// the Meta Cloud API integration is wired up correctly. Defaults to the
// `hello_world` template, which is auto-available on every WhatsApp
// Business setup and doesn't require approval — exactly what's needed
// for a smoke test before we commit to a custom auth template for OTPs.
//
// Body: { to: string, template?: string, languageCode?: string }
// Returns: { ok: true, wamid: string } | { error: string }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  let body: { to?: string; template?: string; languageCode?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.to || typeof body.to !== 'string') {
    return NextResponse.json({ error: 'Missing "to" (WhatsApp number)' }, { status: 400 })
  }

  try {
    const { wamid } = await sendWhatsAppTemplate({
      to:           body.to,
      templateName: body.template ?? 'hello_world',
      languageCode: body.languageCode ?? 'en_US',
    })
    return NextResponse.json({ ok: true, wamid })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
