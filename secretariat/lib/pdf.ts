import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fs from 'fs'
import path from 'path'
import { createServiceClient } from './supabase'
import { downloadAsset } from './storage'
import type { Form45Data, CoordMap, FieldCoord, CheckboxCoord } from './types'

// ── Default coordinate map ──────────────────────────────────────────────────
// Placeholder values — calibrate via Admin → Calibrate or Admin → Coordinate Map.
// These are overridden by values saved in the database.

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

// ── Asset loaders ───────────────────────────────────────────────────────────

async function loadCoordinates(): Promise<CoordMap> {
  // 1. Try DB (set via Admin UI → Coordinate Map / Calibration)
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .schema('app_secretariat')
      .from('settings')
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

  // 2. Filesystem calibration file (local dev)
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
  // 1. Filesystem (local dev or committed file)
  const local = path.join(process.cwd(), 'assets', 'form45-template.pdf')
  if (fs.existsSync(local)) return fs.readFileSync(local)

  // 2. Supabase Storage (uploaded via Admin → Setup)
  const bytes = await downloadAsset('template.pdf')
  if (bytes) return Buffer.from(bytes)

  throw new Error(
    'Form 45 template not found. Upload it in Admin → Setup, ' +
    'or place it at assets/form45-template.pdf.'
  )
}

export async function loadFont(): Promise<Buffer | null> {
  // 1. Filesystem
  const local = path.join(process.cwd(), 'assets', 'NotoSans-Regular.ttf')
  if (fs.existsSync(local)) return fs.readFileSync(local)

  // 2. Supabase Storage
  const bytes = await downloadAsset('NotoSans.ttf')
  return bytes ? Buffer.from(bytes) : null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasUnicode(text: string): boolean {
  return /[^\x00-\x7F]/.test(text)
}

function drawWrappedText({
  page, text, x, y, maxWidth, lineHeight = 11, font, size = 10,
}: {
  page: PDFPage
  text: string
  x: number
  y: number
  maxWidth: number
  lineHeight?: number
  font: PDFFont
  size?: number
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

// ── Main export ─────────────────────────────────────────────────────────────

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

  // Checkboxes — ✓ when NOT disqualified (passing/expected state)
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
