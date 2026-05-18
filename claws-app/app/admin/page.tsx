'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ClawsUser {
  id:              string
  auth_user_id:    string
  email:           string
  name:            string | null
  mapping_enabled: boolean
  is_admin:        boolean
  spend_today_sgd: number
  spend_day:       string | null
  created_at:      string
}

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<ClawsUser[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/admin/users')
      if (res.status === 401) { router.push('/auth/login?next=/admin'); return }
      if (res.status === 403) { setError('Your account is not an admin.'); return }
      if (!res.ok) { setError((await res.json()).error ?? 'Failed to load users'); return }
      if (cancelled) return
      setUsers(await res.json())
    }
    load()
    return () => { cancelled = true }
  }, [router])

  async function togglePermission(u: ClawsUser, field: 'mapping_enabled' | 'is_admin') {
    if (!users) return
    const newValue = !u[field]
    // Optimistic update
    setUsers(users.map(x => x.id === u.id ? { ...x, [field]: newValue } : x))

    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newValue }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Update failed')
      // Revert
      setUsers(users)
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-bold text-[#12304f] mb-2">JC CLAWs · Admin · Users</h1>
      <p className="text-sm text-[#425d7f] mb-6">
        Sign-in is gated by Google OAuth. Disable mapping for any user here — they&apos;ll see a friendly
        message and can still browse cached zones.
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {users === null ? (
        <p className="text-sm text-[#94afd5]">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[#94afd5]">No users yet — they appear after their first Google sign-in.</p>
      ) : (
        <div className="bg-white rounded-xl border border-[#dde8f5] overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f3f6ff] text-xs font-semibold text-[#94afd5] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Spent today</th>
                <th className="px-4 py-3 text-center">Mapping</th>
                <th className="px-4 py-3 text-center">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dde8f5]">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-[#f3f6ff]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#12304f]">{u.name ?? u.email}</p>
                    {u.name && <p className="text-xs text-[#94afd5]">{u.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#425d7f]">
                    {new Date(u.created_at).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[#425d7f]">
                    SGD {Number(u.spend_today_sgd ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle on={u.mapping_enabled} onClick={() => togglePermission(u, 'mapping_enabled')} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle on={u.is_admin} onClick={() => togglePermission(u, 'is_admin')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${on ? 'bg-[#006092]' : 'bg-[#dde8f5]'}`}
      aria-pressed={on}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`}
      />
    </button>
  )
}
