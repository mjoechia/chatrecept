'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import {
  AUTO_FIELDS, FIELD_LABELS, FIELD_ORDER,
  getFieldCategory, resolveRow,
} from '@/lib/fields'

interface Template {
  id: string
  name: string
  coord_map: { fields: Record<string, { hidden?: boolean; type?: string }> }
}

interface Company {
  id: string
  name: string
  uen: string
  address?: string | null
}

interface Person {
  id: string
  full_name: string
  nric_masked?: string | null
  nationality?: string | null
  dob?: string | null
  address?: string | null
  company_persons: { role: string; companies: Company | null }[]
}

const CHECKBOX_KEYS = new Set([
  'bankrupt', 'convicted', 'disqualified', 'struck_off', 'nominee_director', 'employment_pass',
])

function fieldLabel(key: string) {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function FormFillContent() {
  const router   = useRouter()
  const params   = useSearchParams()
  const templateId = params.get('template_id')
  const supabase = createClient()

  const [template,  setTemplate]  = useState<Template | null>(null)
  const [persons,   setPersons]   = useState<Person[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [company,   setCompany]   = useState<Company | null>(null)
  const [directors, setDirectors] = useState<Person[]>([])
  const [selected,  setSelected]  = useState<string[]>([])
  const [manual,    setManual]    = useState<Record<string, string>>({})
  const [loading,   setLoading]   = useState(true)
  const [submitting,setSubmitting]= useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      loadAll()
    })
  }, [templateId])

  async function loadAll() {
    if (!templateId) { setError('No template specified'); setLoading(false); return }
    const [tRes, pRes] = await Promise.all([fetch('/api/templates'), fetch('/api/persons')])
    if (!tRes.ok || !pRes.ok) { setError('Failed to load data'); setLoading(false); return }

    const templates: Template[] = await tRes.json()
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) { setError('Template not found'); setLoading(false); return }
    setTemplate(tpl)

    const allPersons: Person[] = await pRes.json()
    setPersons(allPersons)

    // Derive unique companies from persons' company_persons join
    const companyMap = new Map<string, Company>()
    for (const p of allPersons) {
      for (const cp of p.company_persons) {
        if (cp.companies) companyMap.set(cp.companies.id, cp.companies)
      }
    }
    setCompanies(Array.from(companyMap.values()).sort((a, b) => a.name.localeCompare(b.name)))

    // Init auto fields with today's date
    const today = new Date().toISOString().slice(0, 10)
    const init: Record<string, string> = {}
    for (const key of Object.keys(tpl.coord_map?.fields ?? {})) {
      if (AUTO_FIELDS.has(key)) init[key] = today
    }
    setManual(init)
    setLoading(false)
  }

  function handleCompanySelect(id: string) {
    const c = companies.find(x => x.id === id) ?? null
    setCompany(c)
    setSelected([])
    if (!c) { setDirectors([]); return }
    setDirectors(
      persons
        .filter(p => p.company_persons.some(cp => cp.companies?.id === c.id))
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
    )
  }

  function toggleDirector(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!template || !company || selected.length === 0) return
    setSubmitting(true); setError('')

    try {
      const today  = new Date().toISOString().slice(0, 10)
      const fields = template.coord_map?.fields ?? {}

      const rows = selected.map(pid => {
        const person = persons.find(p => p.id === pid)!
        return resolveRow(fields, company, person, manual, today)
      })

      const columnMap: Record<string, string> = {}
      for (const k of Object.keys(fields)) columnMap[k] = k

      const firstName = persons.find(p => p.id === selected[0])?.full_name ?? ''
      const label = [
        template.name,
        company.name,
        selected.length > 1 ? `${selected.length} directors` : firstName,
      ].filter(Boolean).join(' — ')

      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: template.id, label, column_map: columnMap, rows, source_type: 'csv' }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed')
      const { id } = await res.json()
      router.push(`/batch/${id}/progress`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed')
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] text-sm text-[#94afd5]">Loading…</div>
  )

  if (!template) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <p className="text-sm text-red-500">{error || 'Template not found'}</p>
        <button onClick={() => router.push('/')} className="text-sm text-[#006092] hover:underline">← Dashboard</button>
      </div>
    </div>
  )

  const fields     = template.coord_map?.fields ?? {}
  const visibleKeys = Object.keys(fields).filter(k => !fields[k].hidden)
  const autoKeys   = visibleKeys.filter(k => AUTO_FIELDS.has(k))
  const manualKeys = visibleKeys.filter(k => getFieldCategory(k) === 'manual')

  const sortedManual = [
    ...FIELD_ORDER.filter(k => manualKeys.includes(k)),
    ...manualKeys.filter(k => !FIELD_ORDER.includes(k)).sort(),
  ]
  const checkboxManual = sortedManual.filter(k => CHECKBOX_KEYS.has(k) || fields[k]?.type === 'checkbox')
  const textManual     = sortedManual.filter(k => !checkboxManual.includes(k))

  const canGenerate = company && selected.length > 0

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b border-[#dde8f5] px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-[#94afd5] hover:text-[#425d7f]">← Dashboard</button>
        <h1 className="text-lg font-semibold mt-1 text-[#12304f]">{template.name}</h1>
        <p className="text-xs text-[#94afd5]">Select a company and director(s) to generate your PDF</p>
      </header>

      <main className="max-w-xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {/* Step 1 — Company */}
          <div className="bg-white rounded-xl border border-[#dde8f5] p-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">Step 1 — Select Company</h2>
            {companies.length === 0 ? (
              <p className="text-sm text-[#94afd5]">No companies found. Add contacts first from the Dashboard.</p>
            ) : (
              <select
                value={company?.id ?? ''}
                onChange={e => handleCompanySelect(e.target.value)}
                className="w-full border border-[#dde8f5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092] bg-white text-[#12304f]"
              >
                <option value="">— Select a company —</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.uen})</option>
                ))}
              </select>
            )}
            {company && (
              <div className="bg-[#f3f6ff] rounded-lg px-4 py-3 text-sm space-y-1">
                <p className="font-medium text-[#12304f]">{company.name}</p>
                <p className="text-[#94afd5]">UEN: {company.uen}</p>
                {company.address && <p className="text-[#94afd5]">{company.address}</p>}
              </div>
            )}
          </div>

          {/* Step 2 — Director(s) */}
          {company && (
            <div className="bg-white rounded-xl border border-[#dde8f5] p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">Step 2 — Select Director(s)</h2>
              {directors.length === 0 ? (
                <p className="text-sm text-[#94afd5]">No directors linked to this company.</p>
              ) : (
                <div className="space-y-2">
                  {directors.map(p => (
                    <label key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-[#dde8f5] cursor-pointer hover:bg-[#f3f6ff] transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={() => toggleDirector(p.id)}
                        className="mt-0.5 accent-[#006092]"
                      />
                      <div>
                        <p className="text-sm font-medium text-[#12304f]">{p.full_name}</p>
                        <p className="text-xs text-[#94afd5]">
                          {[p.nric_masked, p.nationality, p.dob].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {selected.length > 0 && (
                <p className="text-xs font-medium text-[#006092]">
                  {selected.length} director{selected.length > 1 ? 's' : ''} selected
                  {selected.length > 1 ? ` — will generate ${selected.length} PDFs` : ''}
                </p>
              )}
            </div>
          )}

          {/* Step 3 — Template-specific fields */}
          {canGenerate && (textManual.length > 0 || checkboxManual.length > 0) && (
            <div className="bg-white rounded-xl border border-[#dde8f5] p-5 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">Step 3 — Form Details</h2>
              {textManual.map(key => (
                <div key={key}>
                  <label className="block text-sm font-medium text-[#425d7f] mb-1">{fieldLabel(key)}</label>
                  {key === 'director_address' || key === 'address' ? (
                    <textarea
                      value={manual[key] ?? ''}
                      onChange={e => setManual(p => ({ ...p, [key]: e.target.value }))}
                      rows={2}
                      className="w-full border border-[#dde8f5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092] resize-none"
                    />
                  ) : (
                    <input
                      type={key === 'dob' ? 'date' : 'text'}
                      value={manual[key] ?? ''}
                      onChange={e => setManual(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-[#dde8f5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                      placeholder={fieldLabel(key)}
                    />
                  )}
                </div>
              ))}
              {checkboxManual.length > 0 && (
                <div className="space-y-2 pt-1">
                  {checkboxManual.map(key => (
                    <label key={key} className="flex items-center gap-2 text-sm text-[#425d7f] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manual[key] === 'true'}
                        onChange={e => setManual(p => ({ ...p, [key]: e.target.checked ? 'true' : 'false' }))}
                        className="accent-[#006092]"
                      />
                      {fieldLabel(key)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4 — Dates (auto fields, editable) */}
          {canGenerate && autoKeys.length > 0 && (
            <div className="bg-white rounded-xl border border-[#dde8f5] p-5 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94afd5]">Step 4 — Dates</h2>
              {autoKeys.map(key => (
                <div key={key}>
                  <label className="block text-sm font-medium text-[#425d7f] mb-1">{fieldLabel(key)}</label>
                  <input
                    type="date"
                    value={manual[key] ?? ''}
                    onChange={e => setManual(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border border-[#dde8f5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                  />
                </div>
              ))}
            </div>
          )}

          {canGenerate && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#006092] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#004d75] disabled:opacity-50 transition-colors"
            >
              {submitting
                ? 'Generating…'
                : `Generate ${selected.length > 1 ? `${selected.length} PDFs` : 'PDF'} →`}
            </button>
          )}
        </form>
      </main>
    </div>
  )
}

export default function FormFillPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-[#94afd5]">Loading…</div>}>
      <FormFillContent />
    </Suspense>
  )
}
