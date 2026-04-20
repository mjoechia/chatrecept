'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Form45Data } from '@/lib/types'
import { FileText, Plus, Upload, Download, Trash2, Search, Settings } from 'lucide-react'

export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [forms, setForms]     = useState<Form45Data[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
    loadForms()
  }, [])

  async function loadForms() {
    setLoading(true)
    const { data } = await supabase
      .schema('app_secretariat')
      .from('form45')
      .select('*')
      .order('created_at', { ascending: false })
    setForms((data as Form45Data[]) ?? [])
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this form? This cannot be undone.')) return
    setDeleting(id)
    await supabase.schema('app_secretariat').from('form45').delete().eq('id', id)
    setForms(f => f.filter(x => x.id !== id))
    setDeleting(null)
  }

  async function handleDownload(form: Form45Data) {
    if (!form.pdf_path) return
    const res  = await fetch(`/api/form45/${form.id}`)
    const json = await res.json()
    if (json.download_url) window.open(json.download_url, '_blank')
  }

  const filtered = forms.filter(f =>
    f.company_name.toLowerCase().includes(query.toLowerCase()) ||
    f.uen.toLowerCase().includes(query.toLowerCase()) ||
    f.director_name.toLowerCase().includes(query.toLowerCase())
  )

  const statusBadge = (s: string) => {
    const styles: Record<string, string> = {
      draft:      'bg-gray-100 text-gray-600',
      generating: 'bg-yellow-100 text-yellow-700',
      generated:  'bg-green-100 text-green-700',
      failed:     'bg-red-100 text-red-700',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[s] ?? 'bg-gray-100'}`}>
        {s}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold">Secretariat</h1>
          <span className="text-gray-400 text-sm">Form 45</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            <Settings className="w-4 h-4" /> Admin
          </button>
          <button
            onClick={() => router.push('/form45/csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            <Upload className="w-4 h-4" /> CSV Upload
          </button>
          <button
            onClick={() => router.push('/form45/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New Form
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by company, UEN, or director…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {forms.length === 0 ? 'No forms yet. Create your first one.' : 'No results found.'}
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">UEN</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Director</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(form => (
                  <tr key={form.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{form.company_name}</td>
                    <td className="px-4 py-3 text-gray-500">{form.uen}</td>
                    <td className="px-4 py-3">{form.director_name}</td>
                    <td className="px-4 py-3 text-gray-500">{form.consent_date}</td>
                    <td className="px-4 py-3">{statusBadge(form.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {form.status === 'draft' && (
                          <button
                            onClick={() => router.push(`/form45/${form.id}/review`)}
                            className="text-blue-600 hover:underline text-xs"
                          >
                            Review
                          </button>
                        )}
                        {form.status === 'generated' && (
                          <button
                            onClick={() => handleDownload(form)}
                            className="flex items-center gap-1 text-green-600 hover:underline text-xs"
                          >
                            <Download className="w-3 h-3" /> PDF
                          </button>
                        )}
                        {form.status === 'failed' && (
                          <button
                            onClick={() => router.push(`/form45/${form.id}/review`)}
                            className="text-orange-500 hover:underline text-xs"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(form.id)}
                          disabled={deleting === form.id}
                          className="text-red-400 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
