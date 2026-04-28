'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import { Trash2 } from 'lucide-react'

interface TemplateRow {
  id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  user_visible: boolean
  version: number
  created_at: string
}

const STATUS_BADGE: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  draft:    'bg-yellow-100 text-yellow-700',
  archived: 'bg-[#eaf1ff] text-[#94afd5]',
}

export default function TemplateListPage() {
  const router = useRouter()
  const supabase = createClient()
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      fetchTemplates()
    })
  }, [])

  async function fetchTemplates() {
    const res = await fetch('/api/admin/templates')
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }

  async function archiveTemplate(id: string) {
    if (!confirm('Archive this template? It will no longer be available for new batches.')) return
    await fetch(`/api/admin/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    fetchTemplates()
  }

  async function toggleUserVisible(id: string, current: boolean) {
    await fetch(`/api/admin/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_visible: !current }),
    })
    fetchTemplates()
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return
    await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' })
    fetchTemplates()
  }

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/admin')} className="text-sm text-[#94afd5] hover:text-[#12304f]">
            ← Admin
          </button>
          <h1 className="text-lg font-semibold mt-1">Form Templates</h1>
          <p className="text-xs text-[#94afd5]">Upload any PDF form and configure it for batch generation</p>
        </div>
        <button
          onClick={() => router.push('/admin/templates/new')}
          className="bg-[#006092] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#004d75]"
        >
          + New Template
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <p className="text-[#94afd5] text-sm">Loading…</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#94afd5] text-sm mb-4">No templates yet.</p>
            <button
              onClick={() => router.push('/admin/templates/new')}
              className="bg-[#006092] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#004d75]"
            >
              Create your first template
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-xl border p-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#12304f]">{t.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[t.status]}`}>
                      {t.status}
                    </span>
                  </div>
                  {t.description && <p className="text-sm text-[#94afd5] mt-0.5">{t.description}</p>}
                  <p className="text-xs text-[#94afd5] mt-1">
                    v{t.version} · Created {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-[#425d7f] cursor-pointer select-none px-2">
                    <input
                      type="checkbox"
                      checked={t.user_visible}
                      onChange={() => toggleUserVisible(t.id, t.user_visible)}
                      className="rounded"
                    />
                    Visible to users
                  </label>
                  <button
                    onClick={() => router.push(`/admin/calibrate?template_id=${t.id}`)}
                    className="text-sm text-[#006092] hover:underline px-3 py-1"
                  >
                    Calibrate
                  </button>
                  <button
                    onClick={() => router.push(`/admin/templates/${t.id}`)}
                    className="text-sm text-[#425d7f] hover:underline px-3 py-1"
                  >
                    Edit
                  </button>
                  {t.status !== 'archived' && (
                    <button
                      onClick={() => archiveTemplate(t.id)}
                      className="text-sm text-[#94afd5] hover:underline px-3 py-1"
                    >
                      Archive
                    </button>
                  )}
                  <button
                    onClick={() => deleteTemplate(t.id, t.name)}
                    className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 px-2 py-1"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
