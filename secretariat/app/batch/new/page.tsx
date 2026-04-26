'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { FormTemplate, ParseResult } from '@/lib/types'

export default function NewBatchPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [allRows, setAllRows] = useState<Record<string, string>[]>([])
  const [label, setLabel] = useState('')
  const [parsing, setParsing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { redirectToLogin(); return }
      fetchTemplates()
    })
  }, [])

  async function fetchTemplates() {
    const res = await fetch('/api/admin/templates')
    if (res.ok) {
      const data: FormTemplate[] = await res.json()
      setTemplates(data.filter(t => t.status === 'active'))
    }
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

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/batch/parse', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Parse failed'); return }
      setParseResult({ ...json, rows: json.rows.slice(0, 5) })  // show 5 rows as preview
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

    // Find the template to get its field source_keys
    const tmpl = templates.find(t => t.id === selectedTemplateId)
    if (!tmpl) { setError('Template not found'); setCreating(false); return }

    // Build a preliminary column_map (source_key → same key as default, user edits on map page)
    const columnMap: Record<string, string> = {}
    // Pre-populate with matching header names
    const fieldKeys = Object.keys(tmpl.coord_map.fields ?? {})
    for (const key of fieldKeys) {
      const match = parseResult.headers.find(h =>
        h.toLowerCase().replace(/[\s_\-\.]/g, '') === key.toLowerCase().replace(/[\s_\-\.]/g, '')
      )
      columnMap[key] = match ?? ''
    }

    // Store data in sessionStorage for map page to avoid re-uploading
    sessionStorage.setItem('batchParsed', JSON.stringify({
      templateId: selectedTemplateId,
      label: label.trim(),
      parseResult,
      allRows: allRows.length > 0 ? allRows : parseResult.rows,
      columnMap,
    }))

    router.push(`/batch/map?template_id=${selectedTemplateId}`)
    setCreating(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold mt-1">New Batch</h1>
        <p className="text-xs text-gray-400">Generate PDFs for multiple recipients from a spreadsheet</p>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">1. Select Template</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-gray-400">
              No active templates.{' '}
              <button onClick={() => router.push('/admin/templates/new')} className="text-blue-600 hover:underline">
                Create one
              </button>
            </p>
          ) : (
            <select
              value={selectedTemplateId}
              onChange={e => { setSelectedTemplateId(e.target.value); setParseResult(null) }}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Choose template —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </section>

        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">2. Upload Recipient Data</h2>
          <p className="text-sm text-gray-500">One row per person. Accepts .xlsx or .csv files.</p>
          <input
            ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={!selectedTemplateId}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 disabled:opacity-50"
          />
          {parsing && <p className="text-xs text-blue-500">Parsing file…</p>}
          {parseResult && (
            <div className="text-sm text-gray-700 space-y-1">
              <p className="text-green-600 font-medium">✓ {parseResult.row_count} rows detected ({parseResult.source_type.toUpperCase()})</p>
              <p className="text-gray-500 text-xs">Columns: {parseResult.headers.join(', ')}</p>
            </div>
          )}
        </section>

        {parseResult && (
          <section className="bg-white rounded-xl border p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">3. Batch Label (optional)</h2>
            <input
              value={label} onChange={e => setLabel(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. April 2026 Director Appointments"
            />
          </section>
        )}

        <button
          onClick={handleNext}
          disabled={!parseResult || !selectedTemplateId || creating}
          className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Preparing…' : 'Map Columns →'}
        </button>
      </main>
    </div>
  )
}
