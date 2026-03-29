const API =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://backend-production-0aa15.up.railway.app'

export interface Button {
  label: string
  action: string
}

export interface WebMessage {
  id: number
  role: 'user' | 'bot'
  content: string
  metadata?: {
    buttons?: Button[]
    site_url?: string
    [key: string]: unknown
  }
  created_at: string
}

export interface MessageResponse {
  state: string
  messages: WebMessage[]
  credits: number
}

export async function sendMessage(text: string, token: string): Promise<MessageResponse> {
  const res = await fetch(`${API}/webchat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`webchat/message ${res.status}`)
  return res.json()
}

export async function getSession(token: string): Promise<MessageResponse> {
  const res = await fetch(`${API}/webchat/session`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`webchat/session ${res.status}`)
  return res.json()
}
