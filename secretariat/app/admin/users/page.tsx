'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type UserRole   = 'admin' | 'user'
type UserStatus = 'invited' | 'active' | 'suspended'

interface Profile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  status: UserStatus
  invited_by: string | null
  created_at: string
}

const ROLE_BADGE: Record<UserRole, string> = {
  admin: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  user:  'bg-gray-500/20 text-gray-300 border border-gray-500/30',
}

const STATUS_BADGE: Record<UserStatus, string> = {
  active:    'bg-green-500/20 text-green-300 border border-green-500/30',
  invited:   'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  suspended: 'bg-red-500/20 text-red-300 border border-red-500/30',
}

function statusLabel(u: Profile): string {
  if (u.status === 'invited' && !u.invited_by) return 'pending'
  return u.status
}

function statusBadgeClass(u: Profile): string {
  if (u.status === 'invited' && !u.invited_by) {
    return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
  }
  return STATUS_BADGE[u.status]
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers]   = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail]     = useState('')
  const [inviteName, setInviteName]       = useState('')
  const [inviting, setInviting]           = useState(false)
  const [inviteMsg, setInviteMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [actionBusy, setActionBusy]       = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/admin/users')
    if (res.status === 401 || res.status === 403) { router.push('/'); return }
    const data = await res.json()
    setUsers(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteMsg(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), display_name: inviteName.trim() || undefined }),
    })
    const data = await res.json()
    if (res.ok) {
      setInviteMsg({ ok: true, text: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
      setInviteName('')
      load()
    } else {
      setInviteMsg({ ok: false, text: data.error ?? 'Failed to invite' })
    }
    setInviting(false)
  }

  async function patchUser(id: string, updates: { role?: string; status?: string }) {
    setActionBusy(id)
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    await load()
    setActionBusy(null)
  }

  async function resendInvite(id: string) {
    setActionBusy(id)
    await fetch('/api/admin/users/resend-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: id }),
    })
    setActionBusy(null)
  }

  async function suspendUser(id: string) {
    if (!confirm('Suspend this user?')) return
    await patchUser(id, { status: 'suspended' })
  }

  return (
    <div className="min-h-screen" style={{ background: '#111827' }}>
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-sm hover:text-white transition-colors" style={{ color: '#6B7280' }}>
            ← Dashboard
          </Link>
          <span style={{ color: '#374151' }}>/</span>
          <Link href="/admin" className="text-sm hover:text-white transition-colors" style={{ color: '#6B7280' }}>
            Admin
          </Link>
          <span style={{ color: '#374151' }}>/</span>
          <h1 className="text-xl font-bold text-white">User Management</h1>
        </div>

        {/* Invite panel */}
        <div className="rounded-xl p-6 mb-8" style={{ background: '#1F2937', border: '1px solid rgba(75,85,99,0.3)' }}>
          <h2 className="text-sm font-semibold text-white mb-4">Invite Company Secretary</h2>
          <form onSubmit={handleInvite} className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: '#9CA3AF' }}>Email *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-2"
                style={{ background: '#111827', border: '1px solid rgba(75,85,99,0.4)', minWidth: '240px' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: '#9CA3AF' }}>Display name</label>
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Jane Smith"
                className="rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ background: '#111827', border: '1px solid rgba(75,85,99,0.4)', minWidth: '180px' }}
              />
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: '#229ED9' }}
            >
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>
          {inviteMsg && (
            <p className={`mt-3 text-sm ${inviteMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {inviteMsg.text}
            </p>
          )}
        </div>

        {/* Users table */}
        {loading ? (
          <p className="text-sm" style={{ color: '#6B7280' }}>Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm" style={{ color: '#6B7280' }}>No users yet. Invite someone above.</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(75,85,99,0.3)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#1F2937', borderBottom: '1px solid rgba(75,85,99,0.3)' }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#9CA3AF' }}>Name / Email</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#9CA3AF' }}>Role</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#9CA3AF' }}>Status</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#9CA3AF' }}>Joined</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: '#9CA3AF' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{
                      background: i % 2 === 0 ? '#111827' : '#1a2332',
                      borderBottom: '1px solid rgba(75,85,99,0.15)',
                    }}
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{u.display_name || '—'}</p>
                      <p className="text-xs" style={{ color: '#6B7280' }}>{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(u)}`}>
                        {statusLabel(u)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#6B7280' }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        {u.status === 'invited' && !u.invited_by && (
                          <>
                            <button
                              onClick={() => patchUser(u.id, { status: 'active' })}
                              disabled={actionBusy === u.id}
                              className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                              style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => patchUser(u.id, { status: 'suspended' })}
                              disabled={actionBusy === u.id}
                              className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {u.status === 'invited' && u.invited_by && (
                          <button
                            onClick={() => resendInvite(u.id)}
                            disabled={actionBusy === u.id}
                            className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(34,158,217,0.15)', color: '#229ED9' }}
                          >
                            Resend invite
                          </button>
                        )}
                        {u.status === 'active' && u.role === 'user' && (
                          <button
                            onClick={() => patchUser(u.id, { role: 'admin' })}
                            disabled={actionBusy === u.id}
                            className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}
                          >
                            Make admin
                          </button>
                        )}
                        {u.status === 'active' && u.role === 'admin' && (
                          <button
                            onClick={() => patchUser(u.id, { role: 'user' })}
                            disabled={actionBusy === u.id}
                            className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(75,85,99,0.2)', color: '#9CA3AF' }}
                          >
                            Remove admin
                          </button>
                        )}
                        {u.status !== 'suspended' && (
                          <button
                            onClick={() => suspendUser(u.id)}
                            disabled={actionBusy === u.id}
                            className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171' }}
                          >
                            Suspend
                          </button>
                        )}
                        {u.status === 'suspended' && (
                          <button
                            onClick={() => patchUser(u.id, { status: 'active' })}
                            disabled={actionBusy === u.id}
                            className="text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80' }}
                          >
                            Activate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
