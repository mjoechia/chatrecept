/**
 * PDF coordinate measurement tool.
 *
 * Usage:
 *   node scripts/measure.mjs
 *
 * Outputs: scripts/measure-output.pdf
 *
 * Workflow:
 *   1. Put your ACRA Form 45 PDF at assets/form45-template.pdf
 *   2. Run this script — it overlays a coordinate grid + field labels
 *   3. Open measure-output.pdf in Preview
 *   4. Click where each form line starts — the status bar shows x,y in pts
 *   5. Update the FIELDS / CHECKBOX_COORDS maps in lib/pdf.ts
 *   6. Re-run to verify your coordinates are right
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// ─── Load template ──────────────────────────────────────────────────────────

const templatePath = join(root, 'assets', 'form45-template.pdf')
if (!existsSync(templatePath)) {
  console.error('❌  Put your ACRA Form 45 PDF at: assets/form45-template.pdf')
  process.exit(1)
}

const doc  = await PDFDocument.load(readFileSync(templatePath))
const font = await doc.embedFont(StandardFonts.Helvetica)
const bold = await doc.embedFont(StandardFonts.HelveticaBold)
const page = doc.getPages()[0]
const { width, height } = page.getSize()

console.log(`Page size: ${width} × ${height} pts  (A4 = 595 × 842)`)

// ─── Draw coordinate grid every 50 pts ──────────────────────────────────────

for (let y = 0; y <= height; y += 50) {
  // Horizontal rule
  page.drawLine({
    start: { x: 0, y }, end: { x: 20, y },
    thickness: 0.3, color: rgb(0.7, 0.7, 0.9),
  })
  // Y label on left margin
  page.drawText(`${y}`, {
    x: 2, y: y + 1, size: 5, font, color: rgb(0.5, 0.5, 0.8),
  })
}

for (let x = 0; x <= width; x += 50) {
  page.drawLine({
    start: { x, y: 0 }, end: { x, y: 20 },
    thickness: 0.3, color: rgb(0.9, 0.7, 0.7),
  })
  page.drawText(`${x}`, {
    x: x + 1, y: 2, size: 5, font, color: rgb(0.8, 0.5, 0.5),
  })
}

// ─── CURRENT FIELD POSITIONS (copy from lib/pdf.ts, then adjust) ───────────
// Each entry: [field_name, x, y]
// Draw them as red markers so you can see where text will land.

const CURRENT_FIELDS = [
  ['company_name',  200, 640],
  ['uen',           200, 618],
  ['director_name', 200, 580],
  ['nric_display',  200, 558],
  ['nationality',   200, 536],
  ['dob',           200, 514],
  ['address',       200, 492],
  ['consent_date',  200, 360],
]

const CURRENT_CHECKBOXES = [
  ['bankrupt',     62, 430],
  ['disqualified', 62, 412],
  ['convicted',    62, 394],
  ['barred',       62, 376],
]

for (const [label, x, y] of CURRENT_FIELDS) {
  // Red dot at the position
  page.drawCircle({ x, y, size: 3, color: rgb(1, 0, 0) })
  // Label to the left
  page.drawText(`← ${label} (${x},${y})`, {
    x: x + 6, y: y - 3, size: 7, font: bold, color: rgb(1, 0, 0),
  })
}

for (const [label, x, y] of CURRENT_CHECKBOXES) {
  page.drawCircle({ x, y, size: 3, color: rgb(0, 0.6, 0) })
  page.drawText(`← ✓ ${label}`, {
    x: x + 6, y: y - 3, size: 7, font: bold, color: rgb(0, 0.6, 0),
  })
}

// ─── Save output ─────────────────────────────────────────────────────────────

const outPath = join(__dirname, 'measure-output.pdf')
writeFileSync(outPath, await doc.save())
console.log(`✅  Written: scripts/measure-output.pdf`)
console.log(`\nOpen it in Preview (View → Show Inspector → Coordinates)`)
console.log(`Each red dot = a field position. Adjust x,y in lib/pdf.ts until`)
console.log(`the dots sit at the start of each form line, then run again to verify.`)
