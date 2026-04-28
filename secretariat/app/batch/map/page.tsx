'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { FormTemplate, ColumnMapping, ParseResult } from '@/lib/types'

interface BatchSession {
  templateId: string
  label: string
  parseResult: ParseResult
  allRows: Record<string, string>[]
  columnMap: ColumnMapping
}

const SYNONYMS: Record<string, string[]> = {
  director_name: ['full_name', 'name', 'fullname', 'clientname', 'director'],
  company_name:  ['company', 'corp', 'entity', 'companyname'],
  uen:           ['uen', 'regnumber', 'registrationnumber', 'regno'],
  dob:           ['dateofbirth', 'birthdate', 'birthdate', 'dob'],
  nationality:   ['nationality', 'citizenship'],
  address:       ['address', 'residentialaddress', 'homeaddress'],
  nric_display:  ['nric', 'fin', 'passport', 'idnumber'],
  consent_date:  ['consentdate', 'date', 'signaturedate'],
}

function autoMatch(templateFields: string[], sourceColumns: string[]): ColumnMapping {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-\.]/g, '')
  const result: ColumnMapping = {}

  for (const field of templateFields) {
    const normField = normalize(field)
    let best: string | null = null
    let bestScore = 0

    for (const col of sourceColumns) {
      const normCol = normalize(col)

      // Exact match
      if (normCol === normField) { best = col; break }

      // Synonym match
      const synonyms = SYNONYMS[field] ?? []
      if (synonyms.includes(normCol)) { best = col; bestScore = 0.9; continue }

      // Substring overlap
      if (normCol.includes(normField) || normField.includes(normCol)) {
        const score = Math.min(normCol.length, normField.length) / Math.max(normCol.length, normField.length)
        if (score > bestScore) { bestScore = score; best = col }
      }
    }

    if (best) result[field] = best
  }
  return result
}

export default function BatchMapPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [session, setSession] = useState<BatchSession | null>(null)
  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [columnMap, setColumnMap] = useState<ColumnMapping>({})
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      loadSession()
    })
  }, [])

  function loadSession() {
    const raw = sessionStorage.getItem('batchParsed')
    if (!raw) { router.push('/batch/new'); return }
    const sess: BatchSession = JSON.parse(raw)
    setSession(sess)

    // Fetch template to get field list
    fetch(`/api/admin/templates/${sess.templateId}`)
      .then(r => r.json())
      .then((t: FormTemplate) => {
        setTemplate(t)
        const fieldKeys = Object.keys(t.coord_map?.fields ?? {})
        const autoMatched = autoMatch(fieldKeys, sess.parseResult.headers)
        // Merge with any pre-mapped values from /batch/new
        setColumnMap({ ...autoMatched, ...sess.columnMap })
      })
  }

  // Preview: apply column_map to first data row
  const previewRow = session?.allRows[0] ?? {}
  const previewMapped = Object.fromEntries(
    Object.entries(columnMap).map(([sourceKey, csvCol]) => [sourceKey, previewRow[csvCol] ?? '—'])
  )

  async function handleGenerate() {
    if (!session || !template) return
    setCreating(true); setError('')

    const res = await fetch('/api/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: session.templateId,
        label: session.label || undefined,
        column_map: columnMap,
        rows: session.allRows,
        source_type: session.parseResult.source_type,
      }),
    })

    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to create batch'); setCreating(false); return }

    sessionStorage.removeItem('batchParsed')
    router.push(`/batch/${json.id}/progress`)
  }

  const fieldKeys = Object.keys(template?.coord_map?.fields ?? {})

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/batch/new')} className="text-sm text-[#94afd5] hover:text-[#12304f]">
          ← Back
        </button>
        <h1 className="text-lg font-semibold mt-1">Map Columns</h1>
        <p className="text-xs text-[#94afd5]">
          Match your data columns to the form fields · {session?.allRows.length ?? 0} rows
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-[#12304f] mb-4">Column Mapping</h2>
          <p className="text-sm text-[#94afd5] mb-4">
            For each form field, select which column from your file it should read.
            Auto-matched fields are pre-filled.
          </p>
          <div className="space-y-3">
            {fieldKeys.map(key => {
              const fieldDef = template?.coord_map.fields[key]
              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-48 shrink-0">
                    <p className="text-sm font-medium text-[#425d7f]">{key}</p>
                    <p className="text-xs text-[#94afd5]">{fieldDef?.type}</p>
                  </div>
                  <select
                    value={columnMap[key] ?? ''}
                    onChange={e => setColumnMap(m => ({ ...m, [key]: e.target.value }))}
                    className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
                  >
                    <option value="">— Not mapped —</option>
                    {session?.parseResult.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  {columnMap[key] && (
                    <span className="text-xs text-green-600 shrink-0 w-20 truncate">
                      e.g. {previewRow[columnMap[key]] || '—'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {Object.keys(previewMapped).length > 0 && (
          <section className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold text-[#12304f] mb-3">Preview — Row 1</h2>
            <div className="space-y-1">
              {Object.entries(previewMapped).map(([k, v]) => (
                <div key={k} className="flex gap-3 text-sm">
                  <span className="text-[#94afd5] w-40 shrink-0">{k}</span>
                  <span className="text-[#12304f] truncate">{String(v)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <button
          onClick={handleGenerate}
          disabled={creating || fieldKeys.length === 0}
          className="w-full bg-green-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {creating ? 'Creating batch…' : `Generate ${session?.allRows.length ?? 0} PDFs →`}
        </button>
      </main>
    </div>
  )
}
