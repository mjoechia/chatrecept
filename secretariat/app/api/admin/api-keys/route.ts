import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/admin'
import { hashApiKey } from '@/lib/api-key'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

// GET /api/admin/api-keys — list all API keys (hashes only, never raw)
export async function GET() {
  const { error: authErr } = await requireAdminSession()
  if (authErr) return authErr

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .schema('app_secretariat')
    .from('api_keys')
    .select('id, name, scope, rate_limit_per_minute, created_at, last_used, revoked_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ keys: data ?? [] })
}

// POST /api/admin/api-keys — create a new key, returns raw key once
export async function POST(req: NextRequest) {
  const { error: authError } = await requireAdminSession()
  if (authError) return authError

  let body: { name: string; scope?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const raw  = randomBytes(32).toString('hex')
  const hash = hashApiKey(raw)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .schema('app_secretariat')
    .from('api_keys')
    .insert({
      name:     body.name.trim(),
      key_hash: hash,
      scope:    body.scope ?? 'form45:write',
    })
    .select('id, name, scope, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, key: raw }, { status: 201 })
}
