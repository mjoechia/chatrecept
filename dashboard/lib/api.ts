const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

async function apiFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export async function getDashboard(tenantId: string, token: string) {
  return apiFetch(`/api/tenants/${tenantId}/dashboard`, token)
}

export async function topUpWallet(tenantId: string, token: string, amount: number, reason?: string) {
  return apiFetch(`/api/tenants/${tenantId}/wallet/topup`, token, {
    method: 'POST',
    body: JSON.stringify({ amount, reason: reason || 'manual_topup' }),
  })
}

export async function getConversations(tenantId: string, token: string) {
  return apiFetch(`/api/tenants/${tenantId}/conversations`, token)
}

export async function getConversationMessages(tenantId: string, convId: string, token: string) {
  return apiFetch(`/api/tenants/${tenantId}/conversations/${convId}/messages`, token)
}

export async function getLeads(tenantId: string, token: string) {
  return apiFetch(`/api/tenants/${tenantId}/leads`, token)
}

export async function updateLeadStatus(tenantId: string, leadId: string, token: string, status: string) {
  return apiFetch(`/api/tenants/${tenantId}/leads/${leadId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function getSettings(tenantId: string, token: string) {
  return apiFetch(`/api/tenants/${tenantId}/settings`, token)
}

export async function updateSettings(tenantId: string, token: string, data: { company_name: string; system_prompt: string }) {
  return apiFetch(`/api/tenants/${tenantId}/settings`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function getAnalytics(tenantId: string, token: string) {
  return apiFetch(`/api/tenants/${tenantId}/analytics`, token)
}

export async function createStripeCheckout(tenantId: string, token: string, packageId: string) {
  return apiFetch(`/api/tenants/${tenantId}/stripe/checkout`, token, {
    method: 'POST',
    body: JSON.stringify({ package_id: packageId }),
  })
}
