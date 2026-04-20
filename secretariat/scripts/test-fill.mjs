/**
 * Generate a filled Form 45 PDF using the ACRA template and open it.
 *
 * Usage (from secretariat/):
 *   node scripts/test-fill.mjs
 *   open scripts/test-fill-output.pdf
 *
 * Requires:
 *   assets/form45-template.pdf  — official ACRA Form 45 template
 *   assets/NotoSans-Regular.ttf — optional, for Unicode names (Chinese etc.)
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createRequire } from 'module'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const fontkit = require('@pdf-lib/fontkit')

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// ── Coordinate map (mirrors lib/pdf.ts exactly) ───────────────────────────
// Calibrated against: acra-form45-2026-v1
// Update after running: node scripts/calibrate.mjs

const FIELDS = {
  company_name:  { x: 180, y: 690, maxWidth: 320 },
  uen:           { x: 180, y: 670, maxWidth: 200 },
  director_name: { x: 180, y: 600, maxWidth: 320 },
  nric_display:  { x: 180, y: 580, maxWidth: 200 },
  nationality:   { x: 180, y: 560, maxWidth: 200 },
  dob:           { x: 180, y: 540, maxWidth: 200 },
  address:       { x: 180, y: 510, maxWidth: 320, lineHeight: 12 },
  consent_date:  { x: 220, y: 360, maxWidth: 200 },
}

const CHECKBOXES = {
  bankrupt:         { x: 60, y: 430 },
  convicted:        { x: 60, y: 410 },
  disqualified:     { x: 60, y: 390 },
  struck_off:       { x: 60, y: 370 },
  nominee_director: { x: 60, y: 310 },
  employment_pass:  { x: 60, y: 290 },
}

// ── Helpers ───────────────────────────────────────────────────────────────

function hasUnicode(text) {
  return /[^\x00-\x7F]/.test(text)
}

function drawWrappedText({ page, text, x, y, maxWidth, lineHeight = 11, font, size = 10 }) {
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

// ── Stress-test data ──────────────────────────────────────────────────────

const testData = {
  company_name:  'ACME INTERNATIONAL HOLDINGS PTE. LTD.',
  uen:           '202312345K',
  director_name: 'Zhang Wei 陈伟',   // Unicode — exercises NotoSans fallback
  nric_display:  'SXXXXX67A',
  nationality:   'Singaporean',
  dob:           '1 January 1990',
  address:       '123 Very Long Street Name That Should Definitely Wrap Properly, #12-345, Some Industrial Building, Singapore 123456',
  consent_date:  '16 April 2026',
  declarations: {
    bankrupt:         false,
    convicted:        false,
    disqualified:     false,
    struck_off:       false,
    nominee_director: false,
    employment_pass:  false,
  },
}

// ── Generate ──────────────────────────────────────────────────────────────

const templatePath = join(root, 'assets', 'form45-template.pdf')
if (!existsSync(templatePath)) {
  console.error('❌  Template not found:', templatePath)
  console.error('    Download the official ACRA Form 45 PDF and save it there.')
  process.exit(1)
}

const doc = await PDFDocument.load(readFileSync(templatePath))
doc.registerFontkit(fontkit)

const helvetica = await doc.embedFont(StandardFonts.Helvetica)

let noto = helvetica
const notoPath = join(root, 'assets', 'NotoSans-Regular.ttf')
if (existsSync(notoPath)) {
  noto = await doc.embedFont(readFileSync(notoPath))
  console.log('NotoSans loaded — Unicode names will render correctly.')
} else {
  console.warn('⚠️   assets/NotoSans-Regular.ttf not found — Unicode names may not render.')
}

const page = doc.getPages()[0]
const usingNoto = noto !== helvetica

function pickFont(text) {
  return hasUnicode(text) ? noto : helvetica
}

// Text fields
for (const [key, cfg] of Object.entries(FIELDS)) {
  const value = String(testData[key] ?? '').trim()
  if (!value) continue
  drawWrappedText({ page, text: value, x: cfg.x, y: cfg.y, maxWidth: cfg.maxWidth, lineHeight: cfg.lineHeight, font: pickFont(value), size: 10 })
}

// Checkboxes
const checkChar = usingNoto ? '✓' : 'X'
const checkFont = usingNoto ? noto : helvetica

for (const [key, coord] of Object.entries(CHECKBOXES)) {
  const isDisqualified = testData.declarations?.[key] === true
  if (!isDisqualified) {
    page.drawText(checkChar, { x: coord.x, y: coord.y, size: 10, font: checkFont, color: rgb(0, 0, 0) })
  }
}

const outPath = join(__dirname, 'test-fill-output.pdf')
writeFileSync(outPath, await doc.save())
console.log(`✅  Written: scripts/test-fill-output.pdf`)
console.log(`    open scripts/test-fill-output.pdf`)
