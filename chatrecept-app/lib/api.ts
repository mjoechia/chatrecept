import { createClient } from '@/lib/supabase'

const API = process.env.NEXT_PUBLIC_API_URL ?? ''

async function getToken(): Promise<string | null> {
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token ?? null
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export type Tenant = {
  id: string
  company_name: string
  system_prompt: string
  low_confidence_threshold: number
  plan_type: string
  status: string
  monthly_message_quota: number
}

export type KBEntry = {
  id: string
  kind: 'faq' | 'doc' | 'fact'
  question: string
  answer: string
  source: string
  created_at: string
}

export type UsageSnapshot = {
  MessageCount: number
  TopupCredits: number
  PlanQuota: number
  EffectiveCap: number
  OverQuota: boolean
}

export type MessagePackage = {
  id: string
  credits: number
  price_cents: number
  label: string
}

export const MESSAGE_PACKAGES: MessagePackage[] = [
  { id: 'msg_500',  credits: 500,  price_cents: 1000, label: '500 messages — SGD 10' },
  { id: 'msg_1100', credits: 1100, price_cents: 2000, label: '1,100 messages — SGD 20 (10% bonus)' },
  { id: 'msg_3000', credits: 3000, price_cents: 5000, label: '3,000 messages — SGD 50 (20% bonus)' },
]
