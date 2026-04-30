'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { FormTemplate, ParseResult } from '@/lib/types'

export default function NewBatchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [allRows, setAllRows] = useState<Record<string, string>[]>([])
  const [label, setLabel] = useState('')
  const [parsing, setParsing] = useState(false)
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      fetchTemplates()
    })
  }, [])

  // Handle return from Google OAuth callback
  useEffect(() => {
    const source      = searchParams.get('source')
    const googleError = searchParams.get('google_error')
    const templateId  = searchParams.get('template_id')

    if (googleError) {
      setError(`Google Contacts: ${googleError.replace(/_/g, ' ')}`)
      return
    }

    if (source === 'google') {
      if (templateId) setSelectedTemplateId(templateId)
      loadGoogleContacts()
    }
  }, [searchParams])

  async function fetchTemplates() {
    const res = await fetch('/api/admin/templates')
    if (res.ok) {
      const data: FormTemplate[] = await res.json()
      const active = data.filter(t => t.status === 'active')
      setTemplates(active)
      const preselect = searchParams.get('template_id')
      if (preselect && active.some(t => t.id === preselect)) {
        setSelectedTemplateId(preselect)
      }
    }
  }

  async function loadGoogleContacts() {
    setLoadingGoogle(true)
    setError('')
    setParseResult(null)
    setAllRows([])
    try {
      const res  = await fetch('/api/google/contacts')
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to load Google Contacts'); return }
      setTruncated(json.truncated ?? false)
      const result: ParseResult = {
        headers:     json.headers,
        rows:        json.rows.slice(0, 5),
        row_count:   json.row_count,
        source_type: 'google_contacts',
        columnMeta:  json.columnMeta,
      }
      setParseResult(result)
      setAllRows(json.rows)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingGoogle(false)
    }
  }

  function handleImportGoogle() {
    if (!selectedTemplateId) { setError('Select a template first'); return }
    window.location.href = `/api/google/auth?template_id=${selectedTemplateId}`
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedTemplateId) {
      if (!selectedTemplateId) setError('Select a template first')
      return
    }
    setError('')
    setParsing(true)
    setParseResult(null)
    setAllRows([])
    setTruncated(false)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/batch/parse', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Parse failed'); return }
      setParseResult({ ...json, rows: json.rows.slice(0, 5) })
      setAllRows(json.rows)
    } catch (e) {
      setError(String(e))
    } finally {
      setParsing(false)
    }
  }

  async function handleNext() {
    if (!selectedTemplateId || !parseResult) return
    setCreating(true)
    setError('')

    const tmpl = templates.find(t => t.id === selectedTemplateId)
    if (!tmpl) { setError('Template not found'); setCreating(false); return }

    const fieldKeys = Object.keys(tmpl.coord_map.fields ?? {})
    const columnMap: Record<string, string> = {}

    if (parseResult.source_type === 'google_contacts') {
      // For Google Contacts: columns are already canonical — direct pre-fill, skip autoMatch
      for (const key of fieldKeys) {
        if (parseResult.headers.includes(key)) columnMap[key] = key
      }
    } else {
      // CSV/XLSX: exact-name pre-match only; autoMatch runs on /batch/map
      for (const key of fieldKeys) {
        const match = parseResult.headers.find(h =>
          h.toLowerCase().replace(/[\s_\-\.]/g, '') === key.toLowerCase().replace(/[\s_\-\.]/g, '')
        )
        columnMap[key] = match ?? ''
      }
    }

    sessionStorage.setItem('batchParsed', JSON.stringify({
      templateId:  selectedTemplateId,
      label:       label.trim(),
      parseResult: { ...parseResult, rows: parseResult.rows.slice(0, 5) },
      allRows:     allRows.length > 0 ? allRows : parseResult.rows,
      columnMap,
      columnMeta:  parseResult.columnMeta ?? {},
    }))

    router.push(`/batch/map?template_id=${selectedTemplateId}`)
    setCreating(false)
  }

  return (
    <div className="min-h-screen bg-[#f3f6ff]">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-[#94afd5] hover:text-[#12304f]">
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">New Batch</h1>
        <p className="text-xs text-[#94afd5]">Generate PDFs for multiple recipients from a spreadsheet or Google Contacts</p>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        {/* Step 1: Template */}
        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold text-[#12304f]">1. Select Template</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-[#94afd5]">
              No active templates.{' '}
              <button onClick={() => router.push('/admin/templates/new')} className="text-[#006092] hover:underline">
                Create one
              </button>
            </p>
          ) : (
            <select
              value={selectedTemplateId}
              onChange={e => { setSelectedTemplateId(e.target.value); setParseResult(null) }}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
            >
              <option value="">— Choose template —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </section>

        {/* Step 2: Data source */}
        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold text-[#12304f]">2. Import Recipient Data</h2>

          <div className="grid grid-cols-2 gap-3">
            {/* CSV/XLSX */}
            <div className="border border-[#dde8f5] rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-[#425d7f]">Upload file</p>
              <p className="text-xs text-[#94afd5]">One row per person. .xlsx or .csv</p>
              <input
                ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                disabled={!selectedTemplateId}
                className="block w-full text-xs text-[#425d7f] file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#eaf1ff] file:text-[#006092] file:text-xs file:font-medium hover:file:bg-[#dde8f5] disabled:opacity-50"
              />
            </div>

            {/* Google Contacts */}
            <div className="border border-[#dde8f5] rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-[#425d7f]">Google Contacts</p>
              <p className="text-xs text-[#94afd5]">Import directly from your Google account</p>
              <button
                onClick={handleImportGoogle}
                disabled={!selectedTemplateId || loadingGoogle}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-[#dde8f5] rounded-lg bg-white hover:bg-[#f3f6ff] disabled:opacity-50 transition-colors"
              >
                <img src="/google.svg" alt="" className="w-3.5 h-3.5" />
                {loadingGoogle ? 'Loading…' : 'Import from Google'}
              </button>
            </div>
          </div>

          {parsing && <p className="text-xs text-blue-500">Parsing file…</p>}
          {loadingGoogle && <p className="text-xs text-blue-500">Fetching contacts from Google…</p>}

          {parseResult && (
            <div className="text-sm text-[#425d7f] space-y-1">
              <p className="text-green-600 font-medium">
                ✓ {parseResult.row_count} {parseResult.source_type === 'google_contacts' ? 'contacts' : 'rows'} ready
                {parseResult.source_type === 'google_contacts' && (
                  <span className="ml-1.5 text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">Google Contacts</span>
                )}
              </p>
              {truncated && (
                <p className="text-xs text-yellow-600">
                  Showing first 500 contacts — for larger imports use CSV export from Google.
                </p>
              )}
              {parseResult.source_type === 'google_contacts' && (
                <p className="text-xs text-[#94afd5]">
                  Pre-filled from Google Contacts — please review the mapping before generating.
                </p>
              )}
              {parseResult.source_type !== 'google_contacts' && (
                <p className="text-xs text-[#94afd5]">Columns: {parseResult.headers.join(', ')}</p>
              )}
            </div>
          )}
        </section>

        {/* Step 3: Label */}
        {parseResult && (
          <section className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-semibold text-[#12304f]">3. Batch Label (optional)</h2>
            <input
              value={label} onChange={e => setLabel(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006092]"
              placeholder="e.g. April 2026 Director Appointments"
            />
          </section>
        )}

        <button
          onClick={handleNext}
          disabled={!parseResult || !selectedTemplateId || creating}
          className="w-full bg-[#006092] text-white rounded-lg py-3 text-sm font-medium hover:bg-[#004d75] disabled:opacity-50"
        >
          {creating ? 'Preparing…' : 'Map Columns →'}
        </button>
      </main>
    </div>
  )
}
