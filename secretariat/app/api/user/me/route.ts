import { NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase'

export async function GET() {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createServiceClient()

  const { data: existing } = await svc
    .from('secretariat_profiles')
    .select('id, role, status, display_name, email')
    .eq('id', user.id)
    .single()

  if (!existing) {
    // First login — create profile (upsert handles race conditions)
    const { data: created, error } = await svc
      .from('secretariat_profiles')
      .upsert({
        id: user.id,
        email: user.email!,
        role: 'user',
        status: 'active',
        display_name: (user.user_metadata?.full_name as string) ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('id, role, status, display_name, email')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(created)
  }

  if (existing.status === 'invited') {
    // Activate on first real login
    await svc
      .from('secretariat_profiles')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', user.id)
    return NextResponse.json({ ...existing, status: 'active' })
  }

  return NextResponse.json(existing)
}
