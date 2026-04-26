'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { FormTemplate, FieldDef } from '@/lib/types'

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

  const fields = template ? Object.entries(template.coord_map.fields ?? {}) : []
  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/admin/templates')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Templates
        </button>
        <h1 className="text-lg font-semibold mt-1">{template?.name ?? 'Loading…'}</h1>
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
                    <th className="pb-2">y</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([key, def]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-gray-800">{key}</td>
                      <td className="py-2 pr-4 text-gray-500">{(def as FieldDef).type}</td>
                      <td className="py-2 pr-4 text-gray-500">{(def as FieldDef).page}</td>
                      <td className="py-2 pr-4 text-gray-500">{(def as FieldDef).position.x}</td>
                      <td className="py-2 text-gray-500">{(def as FieldDef).position.y}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/admin/calibrate?template_id=${id}`)}
            className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700"
          >
            Calibrate Coordinates
          </button>
          <button
            onClick={toggleStatus}
            className={`px-6 rounded-lg py-3 text-sm font-medium border ${
              template?.status === 'active'
                ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            {template?.status === 'active' ? 'Set to Draft' : 'Activate'}
          </button>
        </div>
      </main>
    </div>
  )
}
