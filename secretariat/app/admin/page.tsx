'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { CoordMap } from '@/lib/types'
import {
  Settings, CheckCircle2, XCircle, RefreshCw,
  ArrowRight, LogOut,
} from 'lucide-react'

type StatusData = {
  template:    { exists: boolean; source: string }
  font:        { exists: boolean; source: string }
  coordinates: { source: string }
}

export default function AdminPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [status,   setStatus]   = useState<StatusData | null>(null)
  const [coords,   setCoords]   = useState<CoordMap | null>(null)
  const [userCounts, setUserCounts] = useState<{ active: number; invited: number; suspended: number } | null>(null)
  const [templateCounts, setTemplateCounts] = useState<{ active: number; draft: number; archived: number } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
    loadAll()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    redirectToLogin()
  }

  async function loadAll() {
    const [s, c, u, t] = await Promise.all([
      fetch('/api/admin/status'),
      fetch('/api/admin/coordinates'),
      fetch('/api/admin/users'),
      fetch('/api/admin/templates'),
    ])
    if (s.status === 401) { redirectToLogin(); return }
    const [sj, cj, uj, tj] = await Promise.all([s.json(), c.json(), u.json(), t.json()])
    setStatus(sj)
    setCoords({ fields: cj.fields, checkboxes: cj.checkboxes })
    if (Array.isArray(uj)) {
      setUserCounts({
        active:    uj.filter((p: { status: string }) => p.status === 'active').length,
        invited:   uj.filter((p: { status: string }) => p.status === 'invited').length,
        suspended: uj.filter((p: { status: string }) => p.status === 'suspended').length,
      })
    }
    if (Array.isArray(tj)) {
      setTemplateCounts({
        active:   tj.filter((t: { status: string }) => t.status === 'active').length,
        draft:    tj.filter((t: { status: string }) => t.status === 'draft').length,
        archived: tj.filter((t: { status: string }) => t.status === 'archived').length,
      })
    }
  }

  const statusIcon = (ok: boolean) => ok
    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />

  const sourceBadge = (src: string) => {
    const styles: Record<string, string> = {
      filesystem: 'bg-[#dde8f5] text-[#006092]',
      storage:    'bg-purple-100 text-purple-700',
      db:         'bg-green-100 text-green-700',
      missing:    'bg-red-100 text-red-600',
      default:    'bg-[#eaf1ff] text-[#425d7f]',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[src] ?? 'bg-[#eaf1ff]'}`}>
        {src}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#006092]" />
          <h1 className="text-lg font-semibold">Admin</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-[#f3f6ff]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg text-[#94afd5] hover:bg-[#f3f6ff]"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── Users ───────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#12304f]">Users</h2>
            <a href="/admin/users" className="flex items-center gap-1 text-sm text-[#006092] hover:underline">
              Manage Users <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Active',    value: userCounts?.active    ?? '—', colour: 'text-green-600' },
              { label: 'Invited',   value: userCounts?.invited   ?? '—', colour: 'text-yellow-600' },
              { label: 'Suspended', value: userCounts?.suspended ?? '—', colour: 'text-red-500' },
            ].map(({ label, value, colour }) => (
              <div key={label} className="bg-[#f3f6ff] rounded-lg p-4 text-center">
                <p className={`text-2xl font-bold ${colour}`}>{value}</p>
                <p className="text-xs text-[#94afd5] mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Templates ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#12304f]">Templates</h2>
            <a href="/admin/templates" className="flex items-center gap-1 text-sm text-[#006092] hover:underline">
              Manage Templates <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Active',   value: templateCounts?.active   ?? '—', colour: 'text-green-600' },
              { label: 'Draft',    value: templateCounts?.draft    ?? '—', colour: 'text-yellow-600' },
              { label: 'Archived', value: templateCounts?.archived ?? '—', colour: 'text-[#94afd5]' },
            ].map(({ label, value, colour }) => (
              <div key={label} className="bg-[#f3f6ff] rounded-lg p-4 text-center">
                <p className={`text-2xl font-bold ${colour}`}>{value}</p>
                <p className="text-xs text-[#94afd5] mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Status Overview ─────────────────────────────────────────── */}
        {status && (
          <section className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold text-[#12304f] mb-4">Setup Status</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Template PDF',  icon: statusIcon(status.template.exists),  src: status.template.source },
                { label: 'Unicode Font',  icon: statusIcon(status.font.exists),      src: status.font.source },
                { label: 'Coordinates',   icon: <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />, src: status.coordinates.source },
              ].map(({ label, icon, src }) => (
                <div key={label} className="flex items-center gap-3 bg-[#f3f6ff] rounded-lg p-3">
                  {icon}
                  <div>
                    <p className="text-sm font-medium text-[#425d7f]">{label}</p>
                    {sourceBadge(src)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


      </main>
    </div>
  )
}
