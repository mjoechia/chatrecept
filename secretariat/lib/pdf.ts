import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fs from 'fs'
import path from 'path'
import { createServiceClient } from './supabase'
import { downloadAsset, downloadByPath } from './storage'
import type { Form45Data, CoordMap, FieldCoord, TemplateCoordMap, FieldDef } from './types'

// ── Legacy Form 45 defaults (used by overlayForm45 adapter) ─────────────────

const DEFAULT_FIELDS: CoordMap['fields'] = {
  company_name:  { x: 180, y: 690, maxWidth: 320 },
  uen:           { x: 180, y: 670, maxWidth: 200 },
  director_name: { x: 180, y: 600, maxWidth: 320 },
  nric_display:  { x: 180, y: 580, maxWidth: 200 },
  nationality:   { x: 180, y: 560, maxWidth: 200 },
  dob:           { x: 180, y: 540, maxWidth: 200 },
  address:       { x: 180, y: 510, maxWidth: 320, lineHeight: 12 },
  consent_date:  { x: 220, y: 360, maxWidth: 200 },
}

// ✓ means director confirms they are NOT in this disqualified category
const DEFAULT_CHECKBOXES: CoordMap['checkboxes'] = {
  bankrupt:         { x: 60, y: 430 },
  convicted:        { x: 60, y: 410 },
  disqualified:     { x: 60, y: 390 },
  struck_off:       { x: 60, y: 370 },
  nominee_director: { x: 60, y: 310 },
  employment_pass:  { x: 60, y: 290 },
}

export { DEFAULT_FIELDS, DEFAULT_CHECKBOXES }

// ── Asset loaders ────────────────────────────────────────────────────────────

async function loadCoordinates(): Promise<CoordMap> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('secretariat_settings')
      .select('value')
      .eq('key', 'form45_coordinates')
      .single()

    if (data?.value) {
      const v = data.value as Partial<CoordMap>
      return {
        fields:     v.fields     ?? DEFAULT_FIELDS,
        checkboxes: v.checkboxes ?? DEFAULT_CHECKBOXES,
      }
    }
  } catch {}

  const calibPath = path.join(process.cwd(), 'calibration', 'form45.json')
  if (fs.existsSync(calibPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(calibPath, 'utf-8'))
      return {
        fields:     json.fields     ?? DEFAULT_FIELDS,
        checkboxes: json.checkboxes ?? DEFAULT_CHECKBOXES,
      }
    } catch {}
  }

  return { fields: DEFAULT_FIELDS, checkboxes: DEFAULT_CHECKBOXES }
}

export async function loadTemplate(): Promise<Buffer> {
  const local = path.join(process.cwd(), 'assets', 'form45-template.pdf')
  if (fs.existsSync(local)) return fs.readFileSync(local)

  const bytes = await downloadAsset('template.pdf')
  if (bytes) return Buffer.from(bytes)

  throw new Error(
    'Form 45 template not found. Upload it in Admin → Setup, ' +
    'or place it at assets/form45-template.pdf.'
  )
}

export async function loadFont(): Promise<Buffer | null> {
  const local = path.join(process.cwd(), 'assets', 'NotoSans-Regular.ttf')
  if (fs.existsSync(local)) return fs.readFileSync(local)

  const bytes = await downloadAsset('NotoSans.ttf')
  return bytes ? Buffer.from(bytes) : null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasUnicode(text: string): boolean {
  return /[^\x00-\x7F]/.test(text)
}

function drawWrappedText({
  page, text, x, y, maxWidth, lineHeight = 11, font, size = 10,
}: {
  page: PDFPage; text: string; x: number; y: number
  maxWidth: number; lineHeight?: number; font: PDFFont; size?: number
}) {
  const words = text.split(' ')
  let line = ''
  let cursorY = y

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(testLine, size) > maxWidth) {
      if (line) {
        page.drawText(line, { x, y: cursorY, size, font, color: rgb(0, 0, 0) })
        cursorY -= lineHeight
      }
      line = word
    } else {
      line = testLine
    }
  }
  if (line) page.drawText(line, { x, y: cursorY, size, font, color: rgb(0, 0, 0) })
}

// ── Transform / logic helpers (used by overlayTemplate) ─────────────────────

function applyTransform(raw: unknown, transform?: FieldDef['transform']): string {
  let value = raw == null ? '' : String(raw)
  if (!transform) return value
  if (transform.trim)      value = value.trim()
  if (transform.uppercase) value = value.toUpperCase()
  if (transform.prefix)    value = transform.prefix + value
  if (transform.suffix)    value = value + transform.suffix
  if (transform.format_date && value) {
    // Basic ISO → display format conversion (DD/MM/YYYY etc.)
    try {
      const d = new Date(value)
      if (!isNaN(d.getTime()) && transform.format_date === 'DD/MM/YYYY') {
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = d.getFullYear()
        value = `${dd}/${mm}/${yyyy}`
      }
    } catch {}
  }
  return value
}

function evaluateLogic(raw: unknown, logic?: FieldDef['logic']): boolean {
  if (!logic) return Boolean(raw)
  const rule = logic.show_when
  if (rule === 'truthy')  return Boolean(raw)
  if (rule === 'falsy')   return !raw
  if (typeof rule === 'object' && 'equals' in rule) {
    return String(raw) === rule.equals
  }
  return false
}

// ── Generic template overlay ─────────────────────────────────────────────────

/**
 * Overlay data onto a blank template PDF using TemplateCoordMap.
 * `data` is already resolved: source_key → final value (post column_map lookup).
 * Checkbox/radio fields are drawn based on their `logic` rule.
 * Zero form-specific code — all logic comes from coordMap.
 */
export async function overlayTemplate(
  coordMap: TemplateCoordMap,
  templatePdfBytes: Uint8Array | Buffer,
  data: Record<string, unknown>,
  fontBytes?: Buffer | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templatePdfBytes)
  doc.registerFontkit(fontkit)

  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  let noto: PDFFont = helvetica
  if (fontBytes) {
    try { noto = await doc.embedFont(fontBytes) } catch {}
  }
  const usingNoto = noto !== helvetica

  function pickFont(text: string): PDFFont {
    return (usingNoto && hasUnicode(text)) ? noto : helvetica
  }

  const checkChar = usingNoto ? '✓' : 'X'

  for (const [, field] of Object.entries(coordMap.fields)) {
    if (field.hidden) continue
    const pages = doc.getPages()
    const pageIdx = field.page ?? 0
    if (pageIdx >= pages.length) continue
    const page = pages[pageIdx]

    const rawValue = data[field.mapping.source_key]
    const fontSize = field.style?.font_size ?? 10

    if (field.type === 'text' || field.type === 'date') {
      const value = applyTransform(rawValue, field.transform)
      if (!value) continue
      const maxWidth = field.dimensions?.width ?? 320
      const lineH = field.dimensions?.height ?? 11
      drawWrappedText({
        page, text: value, x: field.position.x, y: field.position.y,
        maxWidth, lineHeight: lineH, font: pickFont(value), size: fontSize,
      })

    } else if (field.type === 'checkbox') {
      if (evaluateLogic(rawValue, field.logic)) {
        page.drawText(checkChar, {
          x: field.position.x, y: field.position.y,
          size: fontSize, font: usingNoto ? noto : helvetica, color: rgb(0, 0, 0),
        })
      }

    } else if (field.type === 'radio') {
      for (const opt of field.options ?? []) {
        const optPageIdx = opt.page ?? pageIdx
        if (optPageIdx >= pages.length) continue
        const optPage = pages[optPageIdx]
        if (evaluateLogic(rawValue, { show_when: { equals: opt.value } })) {
          optPage.drawText(checkChar, {
            x: opt.position.x, y: opt.position.y,
            size: fontSize, font: usingNoto ? noto : helvetica, color: rgb(0, 0, 0),
          })
        }
      }
    }
    // 'signature' and 'date' placeholders handled via 'text' path above
  }

  return doc.save()
}

// ── Legacy Form 45 adapter ───────────────────────────────────────────────────
// Kept for backward compat with existing /api/form45/* routes.
// Translates Form45Data into the generic overlayTemplate format.

export async function overlayForm45(data: Form45Data): Promise<Uint8Array> {
  const [templateBytes, fontBytes, coords] = await Promise.all([
    loadTemplate(),
    loadFont(),
    loadCoordinates(),
  ])

  const doc = await PDFDocument.load(templateBytes)
  doc.registerFontkit(fontkit)

  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  let noto: PDFFont = helvetica
  if (fontBytes) {
    noto = await doc.embedFont(fontBytes)
  }

  const page = doc.getPages()[0]
  const usingNoto = noto !== helvetica

  function pickFont(text: string): PDFFont {
    return hasUnicode(text) ? noto : helvetica
  }

  // Text fields
  for (const [key, cfg] of Object.entries(coords.fields)) {
    const value = String((data as unknown as Record<string, unknown>)[key] ?? '').trim()
    if (!value) continue
    drawWrappedText({
      page, text: value,
      x: cfg.x, y: cfg.y, maxWidth: cfg.maxWidth,
      lineHeight: cfg.lineHeight, font: pickFont(value), size: 10,
    })
  }

  // Checkboxes — ✓ when NOT disqualified
  const checkChar = usingNoto ? '✓' : 'X'
  const checkFont = usingNoto ? noto : helvetica

  for (const [key, coord] of Object.entries(coords.checkboxes)) {
    const isDisqualified =
      (data.declarations as Record<string, boolean | undefined> | undefined)?.[key] === true
    if (!isDisqualified) {
      page.drawText(checkChar, { x: coord.x, y: coord.y, size: 10, font: checkFont, color: rgb(0, 0, 0) })
    }
  }

  return doc.save()
}

// ── Template loader for generic system ──────────────────────────────────────

export async function loadTemplateByPath(storagePath: string): Promise<Buffer> {
  // Try Supabase Storage (primary)
  const bytes = await downloadByPath(storagePath)
  if (bytes) return Buffer.from(bytes)

  throw new Error(`Template PDF not found at storage path: ${storagePath}`)
}
