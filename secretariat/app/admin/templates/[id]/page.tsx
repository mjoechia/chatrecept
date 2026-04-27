'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { FormTemplate, FieldDef } from '@/lib/types'
import { ExternalLink, FileText, Trash2 } from 'lucide-react'

export default function EditTemplatePage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const supabase = createClient()

  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [testUrl, setTestUrl] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      fetchTemplate()
    })
  }, [id])

  async function fetchTemplate() {
    const res = await fetch(`/api/admin/templates/${id}`)
    if (!res.ok) { setError('Template not found'); return }
    const t: FormTemplate = await res.json()
    setTemplate(t)
    setName(t.name)
    setDescription(t.description ?? '')
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError('')
    const res = await fetch(`/api/admin/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Save failed'); return }
    setSaved(true)
    fetchTemplate()
  }

  async function runTestFill() {
    setTesting(true)
    setTestUrl(null)
    const res = await fetch(`/api/admin/templates/${id}/test-fill`, { method: 'POST' })
    const j = await res.json()
    if (j.error) alert(`Test fill failed: ${j.error}`)
    else setTestUrl(j.url)
    setTesting(false)
  }

  async function toggleStatus() {
    if (!template) return
    const newStatus = template.status === 'active' ? 'draft' : 'active'
    await fetch(`/api/admin/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    fetchTemplate()
  }

  async function archiveTemplate() {
    await fetch(`/api/admin/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    fetchTemplate()
  }

  async function deleteTemplate() {
    if (!window.confirm(`Permanently delete "${template?.name}"? This cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json()
      setError(j.error ?? 'Delete failed')
      setDeleting(false)
      return
    }
    router.push('/admin/templates')
  }

  const fields = template ? Object.entries(template.coord_map.fields ?? {}) : []
  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <button onClick={() => router.push('/')} className="hover:text-gray-800">← Dashboard</button>
          <span className="text-gray-300">/</span>
          <button onClick={() => router.push('/admin')} className="hover:text-gray-800">Admin</button>
          <span className="text-gray-300">/</span>
          <button onClick={() => router.push('/admin/templates')} className="hover:text-gray-800">Templates</button>
        </div>
        <h1 className="text-lg font-semibold">{template?.name ?? 'Loading…'}</h1>
        <p className="text-xs text-gray-400">v{template?.version} · {template?.status}</p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
        {saved && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">Saved.</div>}

        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Details</h2>
          <div>
            <label className={labelClass}>Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className={inputClass} />
          </div>
          <button
            onClick={handleSave} disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </section>

        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Fields ({fields.length})</h2>
          {fields.length === 0 ? (
            <p className="text-sm text-gray-400">No fields calibrated yet. Use the Calibrate tool to set field positions.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b">
                    <th className="pb-2 pr-4">Source key</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Page</th>
                    <th className="pb-2 pr-4">x</th>
                    <th className="pb-2 pr-4">y</th>
                    <th className="pb-2">Visible</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([key, def]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-gray-800">{key}</td>
                      <td className="py-2 pr-4 text-gray-500">{(def as FieldDef).type}</td>
                      <td className="py-2 pr-4 text-gray-500">{((def as FieldDef).page ?? 0) + 1}</td>
                      <td className="py-2 pr-4 text-gray-500">{(def as FieldDef).position.x}</td>
                      <td className="py-2 pr-4 text-gray-500">{(def as FieldDef).position.y}</td>
                      <td className="py-2 text-gray-500">{(def as FieldDef).hidden ? 'No' : 'Yes'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => router.push(`/admin/calibrate?template_id=${id}`)}
            className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700"
          >
            Calibrate
          </button>
          <button
            onClick={runTestFill}
            disabled={testing}
            className="flex items-center gap-1.5 px-5 rounded-lg py-3 text-sm font-medium border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {testing ? 'Generating…' : 'Test Fill'}
          </button>
          {template?.status !== 'archived' && (
            <button
              onClick={archiveTemplate}
              className="px-5 rounded-lg py-3 text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              Archive
            </button>
          )}
          <button
            onClick={toggleStatus}
            className={`px-5 rounded-lg py-3 text-sm font-medium border ${
              template?.status === 'active'
                ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            {template?.status === 'active' ? 'Set to Draft' : 'Activate'}
          </button>
          <button
            onClick={deleteTemplate}
            disabled={deleting}
            className="flex items-center gap-1.5 px-5 rounded-lg py-3 text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        {testUrl && (
          <section className="bg-white rounded-xl border p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Test Fill Preview</h2>
              <a href={testUrl} target="_blank" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <ExternalLink className="w-3.5 h-3.5" /> Open PDF
              </a>
            </div>
            <iframe src={testUrl} className="w-full h-[600px] border rounded-lg" title="Test fill preview" />
          </section>
        )}
      </main>
    </div>
  )
}
