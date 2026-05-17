import { NextRequest, NextResponse } from 'next/server'
import { cacheGet } from '@/lib/cache'
import type { TerritoryReport } from '@/lib/demo-report'

export const dynamic = 'force-dynamic'

// POST /api/territory/preview { postal_code, name, email }
// Captures the lead name + email for retargeting. The free report already
// shows the top 10 named businesses, so we just log + acknowledge.
export async function POST(req: NextRequest) {
  let body: { postal_code?: string; name?: string; email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const postalCode = (body.postal_code ?? '').replace(/\s/g, '')
  const name       = (body.name  ?? '').trim()
  const email      = (body.email ?? '').trim()

  if (!/^\d{6}$/.test(postalCode)) {
    return NextResponse.json({ error: 'Invalid postal code' }, { status: 400 })
  }
  if (name.length < 1) {
    return NextResponse.json({ error: 'Please enter your name' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const cached = await cacheGet<TerritoryReport>(`territory:${postalCode}`)
  if (!cached) {
    return NextResponse.json({
      error: 'Map this postal code first — your report may have expired.',
    }, { status: 404 })
  }

  // TODO Phase 1: persist { ip, postal_code, name, email, captured_at } to Supabase demo_lookups
  console.log('[demo lead capture]', { postalCode, name, email, ts: new Date().toISOString() })

  return NextResponse.json({
    ok: true,
    postal_code:   postalCode,
    address_label: cached.address_label,
    total_count:   cached.total_count,
  })
}
