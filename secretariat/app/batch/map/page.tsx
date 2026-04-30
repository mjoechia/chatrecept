'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { FormTemplate, ColumnMapping, ParseResult } from '@/lib/types'
import { FIELD_ALIASES } from '@/lib/fields'

interface BatchSession {
  templateId: string
  label: string
  parseResult: ParseResult
  allRows: Record<string, string>[]
  columnMap: ColumnMapping
  columnMeta?: Record<string, { locked: boolean; source?: string }>
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
      const synonyms = (FIELD_ALIASES[field] ?? []).map(a => normalize(a))
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

// Fields that are critical for ACRA forms — warn if unmapped
const CRITICAL_FIELDS = new Set(['nric_display', 'nric_masked', 'uen'])

export default function BatchMapPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [session, setSession] = useState<BatchSession | null>(null)
  const [template, setTemplate] = useState<FormTemplate | null>(null)
  const [columnMap, setColumnMap] = useState<ColumnMapping>({})
  const [columnMeta, setColumnMeta] = useState<Record<string, { locked: boolean; source?: string }>>({})
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set())

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
    setColumnMeta(sess.columnMeta ?? {})

    fetch(`/api/admin/templates/${sess.templateId}`)
      .then(r => r.json())
      .then((t: FormTemplate) => {
        setTemplate(t)
        const fieldKeys = Object.keys(t.coord_map?.fields ?? {})

        let mapped: ColumnMapping
        if (sess.parseResult.source_type === 'google_contacts') {
          // Google Contacts: columns are canonical — use pre-filled map directly, skip autoMatch
          mapped = { ...sess.columnMap }
        } else {
          // CSV/XLSX: run full autoMatch, merge with any pre-matched values
          const autoMatched = autoMatch(fieldKeys, sess.parseResult.headers)
          mapped = { ...autoMatched, ...sess.columnMap }
        }
        setColumnMap(mapped)
      })
  }

  // Count blank values for a template field across all rows
  function missingCount(field: string): number {
    if (!session || !columnMap[field]) return session?.allRows.length ?? 0
    const col = columnMap[field]
    return session.allRows.filter(r => !r[col]?.trim()).length
  }

  const previewRow   = session?.allRows[0] ?? {}
  const previewMapped = Object.fromEntries(
    Object.entries(columnMap).map(([sourceKey, csvCol]) => [sourceKey, previewRow[csvCol] ?? '—'])
  )

  const fieldKeys = Object.keys(template?.coord_map?.fields ?? {})
  const isGoogle  = session?.parseResult.source_type === 'google_contacts'

  // Critical fields that are present in this template but missing values
  const criticalMissing = fieldKeys.filter(k =>
    CRITICAL_FIELDS.has(k) && missingCount(k) > 0
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

  function isLocked(field: string): boolean {
    return !!(columnMeta[field]?.locked) && !unlockedFields.has(field)
  }

  function unlockField(field: string) {
    setUnlockedFields(prev => new Set([...prev, field]))
  }

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/batch/new')} className="text-sm text-[#94afd5] hover:text-[#12304f]">
          ← Back
        </button>
        <h1 className="text-lg font-semibold mt-1">Map Columns</h1>
        <p className="text-xs text-[#94afd5]">
          Match your data columns to the form fields · {session?.allRows.length ?? 0} rows
          {isGoogle && (
            <span className="ml-2 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
              Google Contacts
            </span>
          )}
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {/* Google Contacts review notice */}
        {isGoogle && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-4 py-3 text-sm">
            Pre-filled from Google Contacts — please review the mapping below before generating.
          </div>
        )}

        {/* Critical field warnings */}
        {criticalMissing.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 space-y-1">
            {criticalMissing.map(field => (
              <p key={field} className="text-sm text-yellow-800">
                ⚠ {missingCount(field)} contact{missingCount(field) !== 1 ? 's are' : ' is'} missing{' '}
                <span className="font-medium">{field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>.
                {isGoogle && ' Update your Google Contacts or fill manually below.'}
              </p>
            ))}
          </div>
        )}

        <section className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-[#12304f] mb-4">Column Mapping</h2>
          {isGoogle ? (
            <p className="text-sm text-[#94afd5] mb-4">
              Fields auto-mapped from Google Contacts. Click <span className="font-medium">Override</span> to change a mapping.
            </p>
          ) : (
            <p className="text-sm text-[#94afd5] mb-4">
              For each form field, select which column from your file it should read.
              Auto-matched fields are pre-filled.
            </p>
          )}
          <div className="space-y-3">
            {fieldKeys.map(key => {
              const fieldDef = template?.coord_map.fields[key]
              const locked   = isLocked(key)
              const missing  = missingCount(key)
              const isCrit   = CRITICAL_FIELDS.has(key) && missing > 0

              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-48 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-[#425d7f]">{key}</p>
                      {locked && (
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-medium">
                          {columnMeta[key]?.source ?? 'auto'}
                        </span>
                      )}
                      {isCrit && (
                        <span className="text-[10px] bg-yellow-50 text-yellow-700 px-1 py-0.5 rounded font-medium">
                          {missing} missing
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#94afd5]">{fieldDef?.type}</p>
                  </div>

                  {locked ? (
                    <div className="flex-1 flex items-center gap-2">
                      <span className="flex-1 border border-[#dde8f5] rounded-lg px-3 py-2 text-sm bg-[#f3f6ff] text-[#425d7f]">
                        {columnMap[key] || '—'}
                      </span>
                      <button
                        onClick={() => unlockField(key)}
                        className="text-xs text-[#94afd5] hover:text-[#425d7f] shrink-0"
                      >
                        Override
                      </button>
                    </div>
                  ) : (
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
                  )}

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
