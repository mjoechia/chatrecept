import { createBrowserClient } from '@supabase/ssr'
import { createClient as createServerClientBase } from '@supabase/supabase-js'

// Browser client — used in Client Components
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Server client — used in API routes when we need to write across auth schemas
export function createServiceClient() {
  return createServerClientBase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: { persistSession: false },
      // Target the app_claws schema by default for our user table
      db: { schema: 'app_claws' },
    }
  )
}
