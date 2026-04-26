'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { redirectToLogin } from '@/lib/auth'
import type { DetectedField, FieldDef, TemplateCoordMap } from '@/lib/types'

export default function NewTemplatePage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([])
  const [editedFields, setEditedFields] = useState<DetectedField[]>([])
  const [detecting, setDetecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'upload' | 'review'>('upload')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) redirectToLogin()
    })
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfFile(file)
    setError('')
    setDetectedFields([])
    setEditedFields([])
  }

  async function handleDetect() {
    if (!pdfFile) return
    setDetecting(true)
    setError('')

    try {
      // Render page 0 of the PDF to canvas using pdfjs
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
      const arrayBuffer = await pdfFile.arrayBuffer()
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 1.5 })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise

      // Get base64 PNG (strip data: prefix)
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')

      // Get PDF native dimensions (unscaled)
      const nativeViewport = page.getViewport({ scale: 1 })

      // First create the template to get an ID, then detect
      if (!name.trim()) {
        setError('Please enter a template name before detecting fields.')
        setDetecting(false)
        return
      }

      const fd = new FormData()
      fd.append('name', name.trim())
      fd.append('description', description.trim())
      fd.append('pdf', pdfFile)
      const createRes = await fetch('/api/admin/templates', { method: 'POST', body: fd })
      if (!createRes.ok) {
        const j = await createRes.json()
        setError(j.error ?? 'Failed to create template')
        setDetecting(false)
        return
      }
      const { id: templateId } = await createRes.json()

      const detectRes = await fetch(`/api/admin/templates/${templateId}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          img_width: viewport.width,
          img_height: viewport.height,
          pdf_width: nativeViewport.width,
          pdf_height: nativeViewport.height,
          page_index: 0,
        }),
      })

      if (!detectRes.ok) {
        const j = await detectRes.json()
        setError(j.error ?? 'Detection failed')
        setDetecting(false)
        return
      }

      const { fields } = await detectRes.json()
      setDetectedFields(fields)
      setEditedFields(fields.map((f: DetectedField) => ({ ...f })))
      // Store templateId in sessionStorage for save step
      sessionStorage.setItem('pendingTemplateId', templateId)
      setStep('review')
    } catch (e) {
      setError(`Error: ${String(e)}`)
    } finally {
      setDetecting(false)
    }
  }

  function updateField(idx: number, key: keyof DetectedField, value: unknown) {
    setEditedFields(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [key]: value }
      return updated
    })
  }

  function removeField(idx: number) {
    setEditedFields(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    const templateId = sessionStorage.getItem('pendingTemplateId')
    if (!templateId) { setError('Template ID lost — please start over.'); return }
    if (editedFields.length === 0) { setError('Add at least one field before saving.'); return }

    setSaving(true)
    setError('')

    // Build TemplateCoordMap from edited fields
    const coordMap: TemplateCoordMap = {
      version: 1,
      coordinate_system: { origin: 'bottom_left', unit: 'points' },
      pdf_meta: { page_count: 1, page_sizes: { '0': { width: 595, height: 842 } } },
      fields: Object.fromEntries(
        editedFields.map(f => [
          f.suggested_column_name,
          {
            type: f.type,
            page: f.page,
            position: f.position,
            dimensions: f.dimensions,
            mapping: { source_key: f.suggested_column_name },
            logic: f.type === 'checkbox' ? { show_when: 'truthy' as const } : undefined,
          } satisfies FieldDef,
        ])
      ),
    }

    const res = await fetch(`/api/admin/templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coord_map: coordMap, status: 'active' }),
    })

    if (!res.ok) {
      const j = await res.json()
      setError(j.error ?? 'Save failed')
      setSaving(false)
      return
    }

    sessionStorage.removeItem('pendingTemplateId')
    router.push(`/admin/templates/${templateId}`)
  }

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <button onClick={() => router.push('/admin/templates')} className="text-sm text-gray-500 hover:text-gray-800">
          ← Templates
        </button>
        <h1 className="text-lg font-semibold mt-1">New Template</h1>
        <p className="text-xs text-gray-400">Upload a PDF, detect fields with AI, then calibrate coordinates</p>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {step === 'upload' && (
          <>
            <section className="bg-white rounded-xl border p-6 space-y-4">
              <h2 className="font-semibold text-gray-800">Template Details</h2>
              <div>
                <label className={labelClass}>Template Name *</label>
                <input
                  required value={name} onChange={e => setName(e.target.value)}
                  className={inputClass} placeholder="e.g. Form 45 – Consent to Act as Director"
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <input
                  value={description} onChange={e => setDescription(e.target.value)}
                  className={inputClass} placeholder="Brief description (optional)"
                />
              </div>
            </section>

            <section className="bg-white rounded-xl border p-6 space-y-4">
              <h2 className="font-semibold text-gray-800">Upload PDF</h2>
              <p className="text-sm text-gray-500">
                Upload the blank PDF form. AI will analyze page 1 and suggest fillable field locations.
              </p>
              <input
                ref={fileRef} type="file" accept=".pdf"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100"
              />
              {pdfFile && <p className="text-xs text-gray-500">Selected: {pdfFile.name}</p>}
            </section>

            <button
              onClick={handleDetect}
              disabled={!pdfFile || !name.trim() || detecting}
              className="w-full bg-blue-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {detecting ? 'Detecting fields with AI…' : 'Detect Fields with AI →'}
            </button>
          </>
        )}

        {step === 'review' && (
          <>
            <section className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-800">Detected Fields</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {editedFields.length} fields detected. Review column names, then save.
                    Coordinates can be fine-tuned later via Calibrate.
                  </p>
                </div>
                <button
                  onClick={() => { setStep('upload'); setEditedFields([]) }}
                  className="text-sm text-gray-500 hover:underline"
                >
                  ← Re-detect
                </button>
              </div>

              <div className="space-y-3">
                {editedFields.map((f, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Column name (snake_case)</p>
                        <input
                          value={f.suggested_column_name}
                          onChange={e => updateField(idx, 'suggested_column_name', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Label (from form)</p>
                        <input
                          value={f.label}
                          onChange={e => updateField(idx, 'label', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Type</p>
                        <select
                          value={f.type}
                          onChange={e => updateField(idx, 'type', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="text">text</option>
                          <option value="checkbox">checkbox</option>
                          <option value="date">date</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 mt-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${f.confidence >= 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {Math.round(f.confidence * 100)}%
                      </span>
                      <button
                        onClick={() => removeField(idx)}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <button
              onClick={handleSave}
              disabled={saving || editedFields.length === 0}
              className="w-full bg-green-600 text-white rounded-lg py-3 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Template & Calibrate Coordinates →'}
            </button>
          </>
        )}
      </main>
    </div>
  )
}
