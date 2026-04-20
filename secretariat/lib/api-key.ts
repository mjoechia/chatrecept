import { createHmac } from 'crypto'
import { createServiceClient } from './supabase'

const HMAC_SECRET = process.env.API_KEY_SECRET ?? ''

export function hashApiKey(rawKey: string): string {
  return createHmac('sha256', HMAC_SECRET).update(rawKey).digest('hex')
}

export async function verifyApiKey(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false
  const raw = authHeader.slice(7).trim()
  if (!raw) return false

  const hash = hashApiKey(raw)
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .schema('app_secretariat')
    .from('api_keys')
    .select('id, revoked_at')
    .eq('key_hash', hash)
    .single()

  if (error || !data || data.revoked_at) return false

  // Update last_used — fire and forget
  supabase
    .schema('app_secretariat')
    .from('api_keys')
    .update({ last_used: new Date().toISOString() })
    .eq('key_hash', hash)
    .then(() => {})

  return true
}
