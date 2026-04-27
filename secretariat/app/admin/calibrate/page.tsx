'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { redirectToLogin } from '@/lib/auth'
import type { CoordMap, TemplateCoordMap, FieldDef, DetectedField } from '@/lib/types'
import { CheckCircle2, Save, Crosshair, ChevronLeft, ChevronRight, Plus, Scan, PenLine, X } from 'lucide-react'

const SCALE = 1.5

const LEGACY_FIELD_LIST = [
  { key: 'company_name',      label: 'Company Name',   group: 'fields' },
  { key: 'uen',               label: 'UEN',             group: 'fields' },
  { key: 'director_name',     label: 'Director Name',   group: 'fields' },
  { key: 'nric_display',      label: 'NRIC / Passport', group: 'fields' },
  { key: 'nationality',       label: 'Nationality',      group: 'fields' },
  { key: 'dob',               label: 'Date of Birth',    group: 'fields' },
  { key: 'address',           label: 'Address',          group: 'fields' },
  { key: 'consent_date',      label: 'Consent Date',     group: 'fields' },
  { key: 'bankrupt',          label: '☑ Bankrupt',       group: 'checkboxes' },
  { key: 'convicted',         label: '☑ Convicted',      group: 'checkboxes' },
  { key: 'disqualified',      label: '☑ Disqualified',   group: 'checkboxes' },
  { key: 'struck_off',        label: '☑ Struck Off',     group: 'checkboxes' },
  { key: 'nominee_director',  label: '☑ Nominee Dir',   group: 'checkboxes' },
  { key: 'employment_pass',   label: '☑ Employ. Pass',  group: 'checkboxes' },
] as const

type LegacyFieldKey = typeof LEGACY_FIELD_LIST[number]['key']
interface DynField { key: string; label: string; type: FieldDef['type']; page: number }

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> }
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
}

export default function CalibratePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = searchParams.get('template_id')

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const pdfDocRef  = useRef<PdfDoc | null>(null)

  const [pdfRendered,  setPdfRendered]  = useState(false)
  const [canvasH,      setCanvasH]      = useState(0)
  const [hover,        setHover]        = useState<{ x: number; y: number } | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [loadError,    setLoadError]    = useState<string | null>(null)
  const [currentPage,  setCurrentPage]  = useState(0)
  const [totalPages,   setTotalPages]   = useState(1)

  // Legacy mode
  const [legacyCoords, setLegacyCoords] = useState<CoordMap | null>(null)
  const [legacyActive, setLegacyActive] = useState<LegacyFieldKey>('company_name')

  // Template mode
  const [dynFields,      setDynFields]      = useState<DynField[]>([])
  const [dynActive,      setDynActive]      = useState<string>('')
  const [templateCoords, setTemplateCoords] = useState<TemplateCoordMap | null>(null)

  // Add field panel
  const [addMode,      setAddMode]      = useState<'none' | 'detect' | 'manual'>('none')
  const [detecting,    setDetecting]    = useState(false)
  const [suggestions,  setSuggestions]  = useState<DetectedField[]>([])
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldDef['type']>('text')

  const isTemplateMode = !!templateId

  // Load template data
  useEffect(() => {
    if (isTemplateMode) {
      fetch(`/api/admin/templates/${templateId}`)
        .then(async r => {
          if (r.status === 401) { redirectToLogin(); return }
          if (!r.ok) { setLoadError('Template not found'); return }
          const t = await r.json()
          const coordMap: TemplateCoordMap = t.coord_map
          setTemplateCoords(coordMap)
          const fields = Object.entries(coordMap.fields ?? {}).map(([key, def]) => ({
            key,
            label: (def as FieldDef)._detect_label ?? key,
            type:  (def as FieldDef).type,
            page:  (def as FieldDef).page ?? 0,
          }))
          setDynFields(fields)
          if (fields.length > 0) setDynActive(fields[0].key)
        })
    } else {
      fetch('/api/admin/coordinates').then(async r => {
        if (r.status === 401) { redirectToLogin(); return }
        const j = await r.json()
        setLegacyCoords({ fields: j.fields, checkboxes: j.checkboxes })
      })
    }
  }, [templateId])

  // Render a specific page from cached pdfDoc
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current
    if (!doc || !canvasRef.current) return
    setPdfRendered(false)
    const page = await doc.getPage(pageNum + 1)
    const viewport = page.getViewport({ scale: SCALE })
    const canvas = canvasRef.current
    canvas.width  = viewport.width
    canvas.height = viewport.height
    setCanvasH(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    setPdfRendered(true)
  }, [])

  // Load PDF once
  const loadPdf = useCallback(async () => {
    if (!canvasRef.current) return
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    try {
      const endpoint = isTemplateMode
        ? `/api/admin/templates/${templateId}/pdf`
        : '/api/admin/template-pdf'
      const res = await fetch(endpoint)
      if (!res.ok) {
        setLoadError(isTemplateMode
          ? 'Template PDF not found in storage.'
          : 'Template not found. Upload it in Admin → Setup first.')
        return
      }
      const data = new Uint8Array(await res.arrayBuffer())
      const pdf = await pdfjs.getDocument({ data }).promise as unknown as PdfDoc
      pdfDocRef.current = pdf
      setTotalPages(pdf.numPages)
      await renderPage(0)
    } catch (e) {
      setLoadError(String(e))
    }
  }, [isTemplateMode, templateId, renderPage])

  useEffect(() => { loadPdf() }, [loadPdf])

  async function goToPage(pageNum: number) {
    if (pageNum < 0 || pageNum >= totalPages || pageNum === currentPage) return
    setCurrentPage(pageNum)
    await renderPage(pageNum)
  }

  function pdfCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = parseFloat(((e.clientX - rect.left) / SCALE).toFixed(1))
    const y = parseFloat(((rect.bottom - e.clientY) / SCALE).toFixed(1))
    return { x, y }
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pdfRendered) return
    const { x, y } = pdfCoords(e)

    if (isTemplateMode) {
      setTemplateCoords(prev => {
        if (!prev || !dynActive) return prev
        const field = prev.fields[dynActive]
        if (!field) return prev
        return {
          ...prev,
          fields: {
            ...prev.fields,
            [dynActive]: { ...field, position: { x, y }, page: currentPage },
          },
        }
      })
      // Also update dynFields page for that key
      setDynFields(prev => prev.map(f =>
        f.key === dynActive ? { ...f, page: currentPage } : f
      ))
      // Advance to next field
      const idx = dynFields.findIndex(f => f.key === dynActive)
      if (idx < dynFields.length - 1) setDynActive(dynFields[idx + 1].key)
    } else {
      const entry = LEGACY_FIELD_LIST.find(f => f.key === legacyActive)!
      setLegacyCoords(c => {
        if (!c) return c
        if (entry.group === 'fields') {
          const prev = c.fields[legacyActive] ?? { x, y, maxWidth: 300 }
          return { ...c, fields: { ...c.fields, [legacyActive]: { ...prev, x, y } } }
        } else {
          return { ...c, checkboxes: { ...c.checkboxes, [legacyActive]: { x, y } } }
        }
      })
      const idx = LEGACY_FIELD_LIST.findIndex(f => f.key === legacyActive)
      if (idx < LEGACY_FIELD_LIST.length - 1) setLegacyActive(LEGACY_FIELD_LIST[idx + 1].key)
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!pdfRendered) return
    setHover(pdfCoords(e))
  }

  async function handleSave() {
    setSaving(true)
    let res: Response
    if (isTemplateMode && templateCoords) {
      res = await fetch(`/api/admin/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coord_map: templateCoords }),
      })
    } else if (legacyCoords) {
      res = await fetch('/api/admin/coordinates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(legacyCoords),
      })
    } else {
      setSaving(false); return
    }
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else alert('Failed to save coordinates')
  }

  function toScreen(x: number, y: number) {
    return { sx: x * SCALE, sy: canvasH - y * SCALE }
  }

  const dotColor = (key: string) =>
    (isTemplateMode ? dynActive : legacyActive) === key ? '#2563eb' : '#22c55e'

  // ── Add Field: detect on current page ────────────────────────────────────────
  async function detectOnPage() {
    if (!canvasRef.current || !templateId || !templateCoords) return
    setDetecting(true)
    setSuggestions([])
    const canvas = canvasRef.current
    const base64 = canvas.toDataURL('image/png').split(',')[1]
    const pageSize = templateCoords.pdf_meta?.page_sizes?.[String(currentPage)] ?? { width: 595, height: 842 }
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          img_width: canvas.width,
          img_height: canvas.height,
          pdf_width: pageSize.width,
          pdf_height: pageSize.height,
          page_index: currentPage,
        }),
      })
      const j = await res.json()
      if (j.error) { alert(j.error); setDetecting(false); return }
      const existingKeys = new Set(Object.keys(templateCoords.fields ?? {}))
      const newSuggestions = (j.fields as DetectedField[]).filter(f => !existingKeys.has(f.suggested_column_name))
      setSuggestions(newSuggestions)
      if (newSuggestions.length === 0) alert('No new fields detected on this page (all already added).')
    } catch (err) {
      alert(String(err))
    }
    setDetecting(false)
  }

  function addSuggestion(f: DetectedField) {
    const fieldDef: FieldDef = {
      type: f.type,
      page: f.page,
      position: f.position,
      dimensions: f.dimensions,
      mapping: { source_key: f.suggested_column_name },
      _detect_label: f.label,
      _detect_confidence: f.confidence,
      logic: f.type === 'checkbox' ? { show_when: 'truthy' } : undefined,
    }
    setTemplateCoords(prev => prev ? { ...prev, fields: { ...prev.fields, [f.suggested_column_name]: fieldDef } } : prev)
    setDynFields(prev => [...prev, { key: f.suggested_column_name, label: f.label, type: f.type, page: f.page }])
    setDynActive(f.suggested_column_name)
    setSuggestions(prev => prev.filter(s => s.suggested_column_name !== f.suggested_column_name))
  }

  function addManualField() {
    const raw = newFieldName.trim()
    if (!raw) return
    const key = raw.replace(/\s+/g, '_').toLowerCase()
    if (templateCoords?.fields[key]) { alert(`Field "${key}" already exists.`); return }
    const fieldDef: FieldDef = {
      type: newFieldType,
      page: currentPage,
      position: { x: 0, y: 0 },
      mapping: { source_key: key },
      _detect_label: raw,
      logic: newFieldType === 'checkbox' ? { show_when: 'truthy' } : undefined,
    }
    setTemplateCoords(prev => prev ? { ...prev, fields: { ...prev.fields, [key]: fieldDef } } : prev)
    setDynFields(prev => [...prev, { key, label: raw, type: newFieldType, page: currentPage }])
    setDynActive(key)
    setNewFieldName('')
    setAddMode('none')
  }

  const legacyTextFields = LEGACY_FIELD_LIST.filter(f => f.group === 'fields')
  const legacyCheckboxes = LEGACY_FIELD_LIST.filter(f => f.group === 'checkboxes')

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(isTemplateMode ? `/admin/templates/${templateId}` : '/admin')}
            className="text-sm text-gray-400 hover:text-gray-100"
          >
            ← {isTemplateMode ? 'Template' : 'Admin'}
          </button>
          <span className="text-gray-600">/</span>
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-blue-400" />
            <h1 className="text-sm font-semibold text-gray-100">Coordinate Calibration</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hover && (
            <span className="text-xs text-gray-400 font-mono">
              x: {hover.x.toFixed(1)}  y: {hover.y.toFixed(1)}
            </span>
          )}
          {isTemplateMode && totalPages > 1 && (
            <div className="flex items-center gap-1.5 bg-gray-700 rounded-lg px-2 py-1">
              <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0}
                className="text-gray-400 hover:text-gray-100 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-300 font-mono min-w-[5rem] text-center">
                Page {currentPage + 1} / {totalPages}
              </span>
              <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages - 1}
                className="text-gray-400 hover:text-gray-100 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || (!legacyCoords && !templateCoords)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saved
              ? <><CheckCircle2 className="w-4 h-4" /> Saved</>
              : <><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save All'}</>
            }
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-60 bg-gray-800 border-r border-gray-700 overflow-y-auto flex-shrink-0 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {isTemplateMode ? (
              <div className="p-3">
                {/* Header row */}
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Fields ({dynFields.length})
                  </p>
                  <div className="relative">
                    <button
                      onClick={() => setAddMode(m => m === 'none' ? 'detect' : 'none')}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-gray-700"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                </div>

                {/* Add field panel */}
                {addMode !== 'none' && (
                  <div className="mb-3 bg-gray-750 border border-gray-600 rounded-lg p-2.5 space-y-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setAddMode('detect')}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded ${addMode === 'detect' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >
                        <Scan className="w-3 h-3" /> Detect
                      </button>
                      <button
                        onClick={() => setAddMode('manual')}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded ${addMode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >
                        <PenLine className="w-3 h-3" /> Manual
                      </button>
                    </div>

                    {addMode === 'detect' && (
                      <>
                        <button
                          onClick={detectOnPage}
                          disabled={detecting}
                          className="w-full text-xs bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {detecting ? 'Detecting…' : `Detect on Page ${currentPage + 1}`}
                        </button>
                        {suggestions.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-gray-400">{suggestions.length} new field{suggestions.length !== 1 ? 's' : ''} found:</p>
                            {suggestions.map(s => (
                              <button
                                key={s.suggested_column_name}
                                onClick={() => addSuggestion(s)}
                                className="w-full text-left text-xs bg-gray-700 hover:bg-gray-600 rounded px-2 py-1.5"
                              >
                                <span className="text-gray-200">{s.label}</span>
                                <span className="text-gray-500 ml-1">({s.type})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {addMode === 'manual' && (
                      <div className="space-y-1.5">
                        <input
                          value={newFieldName}
                          onChange={e => setNewFieldName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addManualField()}
                          placeholder="field_name"
                          className="w-full bg-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <select
                          value={newFieldType}
                          onChange={e => setNewFieldType(e.target.value as FieldDef['type'])}
                          className="w-full bg-gray-700 text-gray-100 text-xs rounded px-2 py-1.5 focus:outline-none"
                        >
                          <option value="text">text</option>
                          <option value="checkbox">checkbox</option>
                          <option value="date">date</option>
                          <option value="radio">radio</option>
                        </select>
                        <div className="flex gap-1.5">
                          <button onClick={addManualField}
                            className="flex-1 text-xs bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700">
                            Add to Page {currentPage + 1}
                          </button>
                          <button onClick={() => setAddMode('none')}
                            className="text-xs text-gray-400 hover:text-gray-200 px-2">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Field table */}
                {dynFields.length === 0 ? (
                  <p className="text-xs text-gray-500">No fields. Use Add → Detect or Manual.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-700">
                        <th className="text-left py-1 pl-1 font-medium">Field</th>
                        <th className="text-right py-1 pr-1 font-medium whitespace-nowrap">Det. Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dynFields.map(f => {
                        const coord = templateCoords?.fields[f.key]
                        const isPlaced = coord && (coord.position.x !== 0 || coord.position.y !== 0)
                        const isActive = dynActive === f.key
                        return (
                          <tr
                            key={f.key}
                            onClick={() => { setDynActive(f.key); goToPage(f.page) }}
                            className={`cursor-pointer rounded ${isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                          >
                            <td className="py-1.5 pl-1 pr-1">
                              <div className="font-medium truncate max-w-[120px]">{f.label || f.key}</div>
                              <div className={`text-xs ${isActive ? 'opacity-70' : 'text-gray-500'}`}>{f.type}</div>
                            </td>
                            <td className="py-1.5 pr-1 text-right">
                              <span className={isPlaced ? (isActive ? 'text-green-300' : 'text-green-400') : (isActive ? 'text-yellow-300' : 'text-yellow-500')}>
                                {f.page + 1}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Text Fields</p>
                {legacyTextFields.map(f => {
                  const coord = legacyCoords?.fields[f.key]
                  return (
                    <button key={f.key} onClick={() => setLegacyActive(f.key)}
                      className={`w-full text-left px-2 py-2 rounded text-sm mb-0.5 ${legacyActive === f.key ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                      <div className="font-medium">{f.label}</div>
                      {coord && <div className="text-xs opacity-60 font-mono">{coord.x}, {coord.y}</div>}
                    </button>
                  )
                })}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-2">Checkboxes</p>
                {legacyCheckboxes.map(f => {
                  const coord = legacyCoords?.checkboxes[f.key]
                  return (
                    <button key={f.key} onClick={() => setLegacyActive(f.key)}
                      className={`w-full text-left px-2 py-2 rounded text-sm mb-0.5 ${legacyActive === f.key ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                      <div className="font-medium">{f.label}</div>
                      {coord && <div className="text-xs opacity-60 font-mono">{coord.x}, {coord.y}</div>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main canvas area ── */}
        <main className="flex-1 overflow-auto bg-gray-700 p-4">
          {loadError ? (
            <div className="flex items-center justify-center h-full">
              <div className="bg-red-900 text-red-200 rounded-xl p-6 max-w-sm text-center text-sm">{loadError}</div>
            </div>
          ) : !pdfRendered ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Loading template…
            </div>
          ) : null}

          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              onClick={handleClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHover(null)}
              className="block cursor-crosshair shadow-2xl"
            />

            {pdfRendered && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width={canvasRef.current?.width ?? 0}
                height={canvasH}
              >
                {isTemplateMode ? (
                  Object.entries(templateCoords?.fields ?? {})
                    .filter(([, def]) => (def as FieldDef).page === currentPage)
                    .map(([key, def]) => {
                      const { sx, sy } = toScreen((def as FieldDef).position.x, (def as FieldDef).position.y)
                      const color = dotColor(key)
                      return (def as FieldDef).type === 'checkbox' ? (
                        <g key={key}>
                          <rect x={sx - 4} y={sy - 4} width={9} height={9} fill={color} opacity={0.85} />
                          <text x={sx + 8} y={sy + 4} fontSize="10" fill={color} fontFamily="monospace">{key}</text>
                        </g>
                      ) : (
                        <g key={key}>
                          <circle cx={sx} cy={sy} r={5} fill={color} opacity={0.85} />
                          <text x={sx + 8} y={sy + 4} fontSize="10" fill={color} fontFamily="monospace">{key}</text>
                        </g>
                      )
                    })
                ) : (
                  <>
                    {legacyCoords && Object.entries(legacyCoords.fields).map(([key, cfg]) => {
                      const { sx, sy } = toScreen(cfg.x, cfg.y)
                      const color = dotColor(key)
                      return (
                        <g key={key}>
                          <circle cx={sx} cy={sy} r={5} fill={color} opacity={0.85} />
                          <text x={sx + 8} y={sy + 4} fontSize="10" fill={color} fontFamily="monospace">{key}</text>
                        </g>
                      )
                    })}
                    {legacyCoords && Object.entries(legacyCoords.checkboxes).map(([key, coord]) => {
                      const { sx, sy } = toScreen(coord.x, coord.y)
                      const color = dotColor(key)
                      return (
                        <g key={key}>
                          <rect x={sx - 4} y={sy - 4} width={9} height={9} fill={color} opacity={0.85} />
                          <text x={sx + 8} y={sy + 4} fontSize="10" fill={color} fontFamily="monospace">{key}</text>
                        </g>
                      )
                    })}
                  </>
                )}
              </svg>
            )}
          </div>
        </main>
      </div>

      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2">
        <p className="text-xs text-gray-400 text-center">
          Select a field → click on the PDF where the text should start →
          click <strong className="text-gray-200">Save All</strong> when done.
          Blue = active field. Green = placed. Yellow page number = not yet placed.
        </p>
      </div>
    </div>
  )
}
