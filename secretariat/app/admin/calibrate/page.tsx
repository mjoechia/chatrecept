'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { redirectToLogin } from '@/lib/auth'
import Script from 'next/script'
import type { CoordMap, TemplateCoordMap, FieldDef } from '@/lib/types'
import { CheckCircle2, Save, Crosshair } from 'lucide-react'

const SCALE = 1.5

// ── Legacy Form 45 field list (used when no template_id param) ───────────────
const LEGACY_FIELD_LIST = [
  { key: 'company_name',   label: 'Company Name',   group: 'fields' },
  { key: 'uen',            label: 'UEN',             group: 'fields' },
  { key: 'director_name',  label: 'Director Name',   group: 'fields' },
  { key: 'nric_display',   label: 'NRIC / Passport', group: 'fields' },
  { key: 'nationality',    label: 'Nationality',      group: 'fields' },
  { key: 'dob',            label: 'Date of Birth',    group: 'fields' },
  { key: 'address',        label: 'Address',          group: 'fields' },
  { key: 'consent_date',   label: 'Consent Date',     group: 'fields' },
  { key: 'bankrupt',       label: '☑ Bankrupt',       group: 'checkboxes' },
  { key: 'convicted',      label: '☑ Convicted',      group: 'checkboxes' },
  { key: 'disqualified',   label: '☑ Disqualified',   group: 'checkboxes' },
  { key: 'struck_off',     label: '☑ Struck Off',     group: 'checkboxes' },
  { key: 'nominee_director', label: '☑ Nominee Dir',  group: 'checkboxes' },
  { key: 'employment_pass',  label: '☑ Employ. Pass', group: 'checkboxes' },
] as const

type LegacyFieldKey = typeof LEGACY_FIELD_LIST[number]['key']

// ── Dynamic field item (template mode) ──────────────────────────────────────
interface DynField { key: string; label: string; type: FieldDef['type']; page: number }

export default function CalibratePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = searchParams.get('template_id')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfjsReady,   setPdfjsReady]   = useState(false)
  const [pdfRendered,  setPdfRendered]  = useState(false)
  const [canvasH,      setCanvasH]      = useState(0)
  const [hover,        setHover]        = useState<{ x: number; y: number } | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [loadError,    setLoadError]    = useState<string | null>(null)

  // ── Legacy mode state ─────────────────────────────────────────────────────
  const [legacyCoords, setLegacyCoords] = useState<CoordMap | null>(null)
  const [legacyActive, setLegacyActive] = useState<LegacyFieldKey>('company_name')

  // ── Template mode state ───────────────────────────────────────────────────
  const [dynFields,     setDynFields]     = useState<DynField[]>([])
  const [dynActive,     setDynActive]     = useState<string>('')
  const [templateCoords, setTemplateCoords] = useState<TemplateCoordMap | null>(null)

  const isTemplateMode = !!templateId

  // Load coordinates and field list
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
            type: (def as FieldDef).type,
            page: (def as FieldDef).page ?? 0,
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

  const renderPdf = useCallback(async () => {
    if (!canvasRef.current) return
    const pdfjs = (window as Window & { pdfjsLib?: unknown }).pdfjsLib as {
      getDocument: (opts: { data: Uint8Array }) => { promise: Promise<{ getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number }
        render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
      }> }> }
      GlobalWorkerOptions: { workerSrc: string }
    }
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
      const pdf  = await pdfjs.getDocument({ data }).promise
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: SCALE })
      const canvas = canvasRef.current
      canvas.width  = viewport.width
      canvas.height = viewport.height
      setCanvasH(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
      setPdfRendered(true)
    } catch (e) {
      setLoadError(String(e))
    }
  }, [isTemplateMode, templateId])

  useEffect(() => {
    if (pdfjsReady) renderPdf()
  }, [pdfjsReady, renderPdf])

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
      // Update TemplateCoordMap field position
      setTemplateCoords(prev => {
        if (!prev || !dynActive) return prev
        const field = prev.fields[dynActive]
        if (!field) return prev
        return {
          ...prev,
          fields: {
            ...prev.fields,
            [dynActive]: { ...field, position: { x, y } },
          },
        }
      })
      // Advance to next field
      const idx = dynFields.findIndex(f => f.key === dynActive)
      if (idx < dynFields.length - 1) setDynActive(dynFields[idx + 1].key)
    } else {
      // Legacy CoordMap update
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

  // Render sidebar fields
  const legacyTextFields = LEGACY_FIELD_LIST.filter(f => f.group === 'fields')
  const legacyCheckboxes = LEGACY_FIELD_LIST.filter(f => f.group === 'checkboxes')

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
        onLoad={() => setPdfjsReady(true)}
      />

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
          <aside className="w-52 bg-gray-800 border-r border-gray-700 overflow-y-auto flex-shrink-0">
            <div className="p-3">
              {isTemplateMode ? (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fields</p>
                  {dynFields.length === 0 && (
                    <p className="text-xs text-gray-500">No fields. Run AI detect first.</p>
                  )}
                  {dynFields.map(f => {
                    const coord = templateCoords?.fields[f.key]
                    return (
                      <button
                        key={f.key}
                        onClick={() => setDynActive(f.key)}
                        className={`w-full text-left px-2 py-2 rounded text-sm mb-0.5 ${
                          dynActive === f.key
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <div className="font-medium truncate">{f.label || f.key}</div>
                        <div className="text-xs opacity-60">{f.type}</div>
                        {coord && (
                          <div className="text-xs opacity-60 font-mono">
                            {coord.position.x}, {coord.position.y}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Text Fields</p>
                  {legacyTextFields.map(f => {
                    const coord = legacyCoords?.fields[f.key]
                    return (
                      <button
                        key={f.key}
                        onClick={() => setLegacyActive(f.key)}
                        className={`w-full text-left px-2 py-2 rounded text-sm mb-0.5 ${
                          legacyActive === f.key
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <div className="font-medium">{f.label}</div>
                        {coord && (
                          <div className="text-xs opacity-60 font-mono">{coord.x}, {coord.y}</div>
                        )}
                      </button>
                    )
                  })}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-2">Checkboxes</p>
                  {legacyCheckboxes.map(f => {
                    const coord = legacyCoords?.checkboxes[f.key]
                    return (
                      <button
                        key={f.key}
                        onClick={() => setLegacyActive(f.key)}
                        className={`w-full text-left px-2 py-2 rounded text-sm mb-0.5 ${
                          legacyActive === f.key
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <div className="font-medium">{f.label}</div>
                        {coord && (
                          <div className="text-xs opacity-60 font-mono">{coord.x}, {coord.y}</div>
                        )}
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          </aside>

          <main className="flex-1 overflow-auto bg-gray-700 p-4">
            {loadError ? (
              <div className="flex items-center justify-center h-full">
                <div className="bg-red-900 text-red-200 rounded-xl p-6 max-w-sm text-center text-sm">
                  {loadError}
                </div>
              </div>
            ) : !pdfRendered ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                {pdfjsReady ? 'Loading template…' : 'Loading pdf.js…'}
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
                    Object.entries(templateCoords?.fields ?? {}).map(([key, def]) => {
                      const { sx, sy } = toScreen((def as FieldDef).position.x, (def as FieldDef).position.y)
                      const color = dotColor(key)
                      const isCheckbox = (def as FieldDef).type === 'checkbox'
                      return isCheckbox ? (
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
            Blue = active field. Green = saved positions.
          </p>
        </div>
      </div>
    </>
  )
}
