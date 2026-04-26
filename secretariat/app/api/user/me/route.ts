import { NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'
import { isAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()

  // If migration 018 hasn't been run, the profiles table won't exist.
  // Fall back to email-based admin check so the admin isn't locked out.
  const { data: existing, error: lookupError } = await svc
    .from('secretariat_profiles')
    .select('id, role, status, display_name, email, invited_by')
    .eq('id', user.id)
    .single()

  // Table doesn't exist yet (migration not run) — fall back to email check
  if (lookupError?.code === '42P01' || lookupError?.message?.includes('relation') || lookupError?.message?.includes('does not exist')) {
    const role = isAdmin(user.email) ? 'admin' : 'user'
    return NextResponse.json({ id: user.id, role, status: 'active', display_name: null, email: user.email })
  }

  if (!existing) {
    // No profile by id — check if admin pre-invited this email
    const { data: emailProfile } = await svc
      .from('secretariat_profiles')
      .select('id, role, status, invited_by')
      .eq('email', user.email!)
      .single()

    if (emailProfile && emailProfile.invited_by !== null) {
      // Admin-invited but profile id not yet linked (invite flow edge case)
      // Update the profile id to match the real auth user id
      await svc
        .from('secretariat_profiles')
        .update({ id: user.id, status: 'active', updated_at: new Date().toISOString() })
        .eq('email', user.email!)
      const { data: activated } = await svc
        .from('secretariat_profiles')
        .select('id, role, status, display_name, email')
        .eq('id', user.id)
        .single()
      return NextResponse.json(activated)
    }

    // Bootstrap admin check — email listed in ADMIN_EMAILS env var
    const bootstrapAdmin = isAdmin(user.email)

    const { data: created, error } = await svc
      .from('secretariat_profiles')
      .upsert({
        id: user.id,
        email: user.email!,
        role: bootstrapAdmin ? 'admin' : 'user',
        status: 'active',
        display_name: (user.user_metadata?.full_name as string) ?? null,
        invited_by: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('id, role, status, display_name, email')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!bootstrapAdmin) return NextResponse.json({ ...created, pending_approval: true })
    return NextResponse.json(created)
  }

  // Suspended users are blocked
  if (existing.status === 'suspended') {
    return NextResponse.json({ error: 'Account suspended. Contact admin.' }, { status: 403 })
  }

  // Admin-invited user logging in for the first time — activate
  if (existing.status === 'invited' && existing.invited_by !== null) {
    await svc
      .from('secretariat_profiles')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', user.id)
    const { id, role, display_name, email } = existing
    return NextResponse.json({ id, role, status: 'active', display_name, email })
  }

  // Self-registered user still waiting for approval
  // Exception: if they're in ADMIN_EMAILS, auto-promote them now (fixes stale profiles)
  if (existing.status === 'invited' && existing.invited_by === null) {
    if (isAdmin(user.email)) {
      await svc
        .from('secretariat_profiles')
        .update({ role: 'admin', status: 'active', updated_at: new Date().toISOString() })
        .eq('id', user.id)
      const { id, display_name, email } = existing
      return NextResponse.json({ id, role: 'admin', status: 'active', display_name, email })
    }
    return NextResponse.json({ ...existing, pending_approval: true })
  }

  // Stale profile: role=user but email is in ADMIN_EMAILS — auto-promote
  if (existing.role === 'user' && isAdmin(user.email)) {
    await svc
      .from('secretariat_profiles')
      .update({ role: 'admin', updated_at: new Date().toISOString() })
      .eq('id', user.id)
    const { id, display_name, email } = existing
    return NextResponse.json({ id, role: 'admin', status: existing.status, display_name, email })
  }

  const { id, role, status, display_name, email } = existing
  return NextResponse.json({ id, role, status, display_name, email })
}
