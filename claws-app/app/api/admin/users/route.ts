import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase'
import { isMasterAdmin, upsertUser, type ClawsUser } from '@/lib/claws-users'

export const dynamic = 'force-dynamic'

const WHATSAPP_PATTERN = /^\+\d{8,15}$/
const EMAIL_PATTERN    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normaliseWhatsApp(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('+')) return trimmed.replace(/\D/g, '')
  return '+' + trimmed.slice(1).replace(/\D/g, '')
}

// GET /api/admin/users — list all claws users (admin only).
// Sorted pending-first so brand-new users land at the top of the dashboard.
// is_master is annotated for the UI so it can lock the master row.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as ClawsUser[]
  const annotated = rows.map(u => ({
    ...u,
    is_master: isMasterAdmin(u.email),
  }))
  // Surface pending users first — they need admin attention
  annotated.sort((a, b) => {
    const ap = a.tier === 'pending' ? 0 : 1
    const bp = b.tier === 'pending' ? 0 : 1
    if (ap !== bp) return ap - bp
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  return NextResponse.json(annotated)
}

// POST /api/admin/users { name, email, whatsapp_number }
// Admin-initiated user creation. Generates a random password the admin
// never sees — the user picks a real one later via the welcome /
// set-password flow. email_confirm: true so the new user can sign in
// immediately (no confirmation email round-trip; admin has vouched).
interface CreateBody {
  name?:            string
  email?:           string
  whatsapp_number?: string
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  let body: CreateBody
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name  = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const wa    = normaliseWhatsApp(body.whatsapp_number ?? '')

  if (!name)                       return NextResponse.json({ error: 'Name is required' },              { status: 400 })
  if (!EMAIL_PATTERN.test(email))  return NextResponse.json({ error: 'Valid email is required' },       { status: 400 })
  if (!WHATSAPP_PATTERN.test(wa))  return NextResponse.json({ error: 'WhatsApp number must include country code, e.g. +65 9123 4567' }, { status: 400 })

  const svc = createServiceClient()

  // Strong random password the admin never sees. User picks a real one
  // via the existing welcome / set-password flow.
  const randomPassword = crypto.randomUUID() + crypto.randomUUID()

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password:        randomPassword,
    email_confirm:   true,       // admin has vouched — skip the confirmation email
    user_metadata:   { name, full_name: name, whatsapp_number: wa },
  })
  if (createErr || !created.user) {
    // Most common error: duplicate email. Surface verbatim — Supabase's
    // message is already clear enough for the admin.
    return NextResponse.json(
      { error: createErr?.message ?? 'Failed to create user' },
      { status: 400 },
    )
  }

  // Seed the app_claws.users row so the new user shows up in /admin
  // immediately, with the WhatsApp number stored. Falls into tier=pending
  // by default (set by the column default in migration 002).
  try {
    const claws = await upsertUser({
      authUserId:     created.user.id,
      email,
      name,
      whatsappNumber: wa,
    })
    return NextResponse.json({ ...claws, is_master: isMasterAdmin(claws.email) }, { status: 201 })
  } catch (e) {
    // Auth user exists but claws row creation failed — roll back so the
    // admin can retry cleanly (otherwise the next attempt would error on
    // duplicate email without giving the admin a path forward).
    await svc.auth.admin.deleteUser(created.user.id).catch(() => { /* best effort */ })
    return NextResponse.json(
      { error: `User created but app_claws row failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }
}
