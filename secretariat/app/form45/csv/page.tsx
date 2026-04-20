'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { CsvParseResult } from '@/lib/types'
import { Upload, AlertCircle, CheckCircle } from 'lucide-react'

const FORM_FIELDS = ['company_name', 'uen', 'director_name', 'nric', 'nationality', 'dob', 'address', 'consent_date']
const FIELD_LABELS: Record<string, string> = {
  company_name:  'Company Name',
  uen:           'UEN',
  director_name: 'Director Name',
  nric:          'NRIC / FIN',
  nationality:   'Nationality',
  dob:           'Date of Birth',
  address:       'Address',
  consent_date:  'Consent Date',
}

export default function CsvUploadPage() {
  const router   = useRouter()
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [parsed,    setParsed]    = useState<CsvParseResult | null>(null)
  const [mapping,   setMapping]   = useState<Record<string, string>>({})   // field → csv header
  const [loading,   setLoading]   = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dragOver,  setDragOver]  = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
  }, [])

  async function handleFile(file: File) {
    setLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res  = await fetch('/api/form45/csv', { method: 'POST', body: fd })
    const json: CsvParseResult = await res.json()
    setParsed(json)
    // Auto-map headers that exactly match field names (case-insensitive)
    const autoMap: Record<string, string> = {}
    for (const field of FORM_FIELDS) {
      const match = json.headers.find(h => h.toLowerCase().replace(/[\s_-]/g, '') === field.toLowerCase().replace('_', ''))
      if (match) autoMap[field] = match
    }
    setMapping(autoMap)
    setLoading(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleGenerate(validOnly: boolean) {
    if (!parsed) return
    setGenerating(true)

    const rows = validOnly ? parsed.rows.filter(r => r.status === 'ok') : parsed.rows.filter(r => r.status === 'ok')
    const results = await Promise.allSettled(rows.map(async row => {
      const body: Record<string, unknown> = { source: 'csv', declarations: {} }
      for (const [field, header] of Object.entries(mapping)) {
        if (header && row.preview[header] !== undefined) {
          body[field] = row.preview[header]
        }
      }
      const res = await fetch('/api/form45/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.ok
    }))

    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length
    alert(`Generated ${succeeded} of ${rows.length} PDFs successfully.`)
    setGenerating(false)
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-800">← Back</button>
        <h1 className="text-lg font-semibold mt-1">CSV Upload</h1>
        <p className="text-xs text-gray-400">Generate Form 45 PDFs in batch from a CSV file</p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
          }`}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">Drop your CSV here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Supports UTF-8 and Excel (UTF-16) exports</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>

        {loading && <p className="text-center text-sm text-gray-400">Parsing CSV…</p>}

        {parsed && (
          <>
            {/* Summary */}
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle className="w-4 h-4" /> {parsed.valid_count} valid
              </span>
              {parsed.error_count > 0 && (
                <span className="flex items-center gap-1.5 text-red-500">
                  <AlertCircle className="w-4 h-4" /> {parsed.error_count} with errors
                </span>
              )}
              <span className="text-gray-400">{parsed.rows.length} total rows</span>
            </div>

            {/* Column mapping */}
            <div className="bg-white rounded-xl border p-6 space-y-3">
              <h2 className="font-semibold text-gray-800">Column Mapping</h2>
              <p className="text-xs text-gray-500">Map your CSV headers to Form 45 fields</p>
              {FORM_FIELDS.map(field => (
                <div key={field} className="flex items-center gap-4">
                  <span className="w-40 text-sm text-gray-600 shrink-0">{FIELD_LABELS[field]}</span>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
                    className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— skip —</option>
                    {parsed.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview table */}
            <div className="bg-white rounded-xl border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    {parsed.headers.slice(0, 5).map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsed.rows.map(row => (
                    <tr key={row.row} className={row.status === 'error' ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 text-gray-500">{row.row}</td>
                      <td className="px-3 py-2">
                        {row.status === 'ok'
                          ? <span className="text-green-600">✓</span>
                          : <span className="text-red-500" title={row.error}>✗ {row.error}</span>
                        }
                      </td>
                      {parsed.headers.slice(0, 5).map(h => (
                        <td key={h} className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{row.preview[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {parsed.error_count > 0 && (
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={generating || parsed.valid_count === 0}
                  className="flex-1 border rounded-lg py-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Generate valid rows only ({parsed.valid_count})
                </button>
              )}
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating || parsed.valid_count === 0}
                className="flex-1 bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? 'Generating…' : `Generate all valid (${parsed.valid_count})`}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
