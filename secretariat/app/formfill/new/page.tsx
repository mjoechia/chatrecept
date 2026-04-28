'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'

interface Template {
  id: string
  name: string
  coord_map: {
    fields: Record<string, { hidden?: boolean; mapping?: { source_key?: string } }>
  }
}

const FIELD_LABELS: Record<string, string> = {
  company_name:  'Company Name',
  uen:           'UEN',
  director_name: 'Director Name',
  full_name:     'Full Name',
  nric_display:  'NRIC',
  nric_masked:   'NRIC',
  nationality:   'Nationality',
  dob:           'Date of Birth',
  address:       'Address',
  consent_date:  'Consent Date',
}

const FIELD_ORDER = [
  'company_name', 'uen',
  'director_name', 'full_name',
  'nric_display', 'nric_masked',
  'nationality', 'dob', 'address',
]

const AUTO_FIELDS = new Set(['consent_date', 'date', 'today', 'generated_date'])
const COMPANY_KEYS = new Set(['company_name', 'uen'])

function FormFillContent() {
  const router = useRouter()
  const params = useSearchParams()
  const templateId = params.get('template_id')
  const supabase = createClient()

  const [template,   setTemplate]   = useState<Template | null>(null)
  const [values,     setValues]     = useState<Record<string, string>>({})
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      loadTemplate()
    })
  }, [templateId])

  async function loadTemplate() {
    if (!templateId) { setError('No template specified'); setLoading(false); return }
    const res = await fetch('/api/templates')
    if (!res.ok) { setError('Failed to load templates'); setLoading(false); return }
    const list: Template[] = await res.json()
    const tpl = list.find(t => t.id === templateId)
    if (!tpl) { setError('Template not found or not available'); setLoading(false); return }
    setTemplate(tpl)

    const today = new Date().toISOString().slice(0, 10)
    const init: Record<string, string> = {}
    for (const [key, def] of Object.entries(tpl.coord_map?.fields ?? {})) {
      if (def.hidden) continue
      init[key] = AUTO_FIELDS.has(key) ? today : ''
    }
    setValues(init)
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!template) return
    setSubmitting(true)
    setError('')
    try {
      const allFieldKeys = Object.keys(template.coord_map?.fields ?? {})
      const columnMap: Record<string, string> = {}
      for (const key of allFieldKeys) columnMap[key] = key

      const today = new Date().toISOString().slice(0, 10)
      const row: Record<string, string> = { ...values }
      for (const key of allFieldKeys) {
        if (AUTO_FIELDS.has(key) && !row[key]) row[key] = today
      }

      const personName = values.director_name || values.full_name || ''
      const label = [template.name, personName, values.company_name].filter(Boolean).join(' — ')

      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          label,
          column_map: columnMap,
          rows: [row],
          source_type: 'csv',
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create form')
      const { id } = await res.json()
      router.push(`/batch/${id}/progress`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-red-500">{error || 'Template not found'}</p>
          <button onClick={() => router.push('/')} className="text-sm text-blue-600 hover:underline">← Dashboard</button>
        </div>
      </div>
    )
  }

  const allKeys = Object.keys(template.coord_map?.fields ?? {})
  const visibleKeys = allKeys.filter(k => !AUTO_FIELDS.has(k) && !template.coord_map.fields[k].hidden)

  const sortedKeys = [
    ...FIELD_ORDER.filter(k => visibleKeys.includes(k)),
    ...visibleKeys.filter(k => !FIELD_ORDER.includes(k)).sort(),
  ]

  const companyKeys = sortedKeys.filter(k => COMPANY_KEYS.has(k))
  const personKeys  = sortedKeys.filter(k => !COMPANY_KEYS.has(k))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">{template.name}</h1>
        <p className="text-xs text-gray-400">Fill in the details below to generate your PDF</p>
      </header>

      <main className="max-w-xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {companyKeys.length > 0 && (
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Company</h2>
              {companyKeys.map(key => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {FIELD_LABELS[key] ?? key.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={values[key] ?? ''}
                    onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={FIELD_LABELS[key] ?? key}
                  />
                </div>
              ))}
            </div>
          )}

          {personKeys.length > 0 && (
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Director / Person</h2>
              {personKeys.map(key => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {FIELD_LABELS[key] ?? key.replace(/_/g, ' ')}
                  </label>
                  {key === 'address' ? (
                    <textarea
                      value={values[key] ?? ''}
                      onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="123 Orchard Rd, #01-01, Singapore 238895"
                    />
                  ) : (
                    <input
                      type={key === 'dob' ? 'date' : 'text'}
                      value={values[key] ?? ''}
                      onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={FIELD_LABELS[key] ?? key}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Generating…' : 'Generate PDF →'}
          </button>
        </form>
      </main>
    </div>
  )
}

export default function FormFillPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>}>
      <FormFillContent />
    </Suspense>
  )
}
