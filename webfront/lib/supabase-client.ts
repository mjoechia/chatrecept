import { createClient } from '@supabase/supabase-js'

// Singleton browser client — safe to call at module level in 'use client' components.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
