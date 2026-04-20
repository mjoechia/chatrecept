/**
 * Auto-detect field positions from the ACRA Form 45 template PDF.
 *
 * Extracts text items and their bounding boxes, then maps known label strings
 * to candidate fill positions (x = right edge of label + gap, y = same baseline).
 *
 * Usage (from secretariat/):
 *   node scripts/auto-detect.mjs
 *
 * Output: calibration/form45.auto.json
 *
 * Accuracy: ~80%. Use as a starting point, then refine with calibrate.mjs.
 * The calibration server loads this file automatically as a fallback if no
 * manual calibration/form45.json exists yet.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Disable web worker — not needed for Node.js text extraction
GlobalWorkerOptions.workerSrc = ''

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const templatePath = join(root, 'assets', 'form45-template.pdf')
if (!existsSync(templatePath)) {
  console.error('❌  Template not found:', templatePath)
  console.error('    Download the official ACRA Form 45 PDF and save it there.')
  process.exit(1)
}

// Label → field key mapping
const LABEL_MAP = [
  { key: 'company_name',  match: /name of company/i,             xOffset: 10, maxWidth: 320 },
  { key: 'uen',           match: /registration no|uen/i,          xOffset: 10, maxWidth: 200 },
  { key: 'director_name', match: /name.*director|proposed dir/i,  xOffset: 10, maxWidth: 320 },
  { key: 'nric_display',  match: /identity card|passport no/i,    xOffset: 10, maxWidth: 200 },
  { key: 'nationality',   match: /nationality/i,                   xOffset: 10, maxWidth: 200 },
  { key: 'dob',           match: /date of birth/i,                 xOffset: 10, maxWidth: 200 },
  { key: 'address',       match: /residential address/i,           xOffset: 10, maxWidth: 320, lineHeight: 12 },
  { key: 'consent_date',  match: /dated this|date.*consent/i,      xOffset: 10, maxWidth: 200 },
]

// Checkbox label patterns
const CHECKBOX_MAP = [
  { key: 'bankrupt',         match: /bankrupt/i },
  { key: 'convicted',        match: /convicted|offence.*fraud|fraud.*dishonest/i },
  { key: 'disqualified',     match: /disqualified.*court|court.*disqualif/i },
  { key: 'struck_off',       match: /struck off|execution.*unsatisfied/i },
  { key: 'nominee_director', match: /nominee director/i },
  { key: 'employment_pass',  match: /employment pass/i },
]

const data = new Uint8Array(readFileSync(templatePath))
const pdf  = await getDocument({ data, disableWorker: true }).promise
const page = await pdf.getPage(1)

const content = await page.getTextContent()

const items = content.items
  .filter(item => item.str && item.str.trim())
  .map(item => {
    const [, , , , x, y] = item.transform
    return {
      text:  item.str.trim(),
      x:     Math.round(x * 10) / 10,
      y:     Math.round(y * 10) / 10,
      width: Math.round((item.width || 0) * 10) / 10,
    }
  })

console.log(`Extracted ${items.length} text items from template.`)
console.log()

const detected = {}

for (const { key, match, xOffset, maxWidth, lineHeight } of LABEL_MAP) {
  const item = items.find(i => match.test(i.text))
  if (!item) {
    console.warn(`  ⚠  No match for field: ${key}`)
    continue
  }
  const entry = { x: Math.round((item.x + item.width + xOffset) * 10) / 10, y: item.y, maxWidth }
  if (lineHeight) entry.lineHeight = lineHeight
  detected[key] = entry
  console.log(`  ✓  ${key.padEnd(16)} "${item.text.slice(0, 35)}" → (${entry.x}, ${entry.y})`)
}

const checkboxDetected = {}
for (const { key, match } of CHECKBOX_MAP) {
  const item = items.find(i => match.test(i.text))
  if (!item) {
    console.warn(`  ⚠  No match for checkbox: ${key}`)
    continue
  }
  checkboxDetected[key] = {
    x: Math.round((item.x - 25) * 10) / 10,
    y: item.y,
  }
  console.log(`  ✓  ${key.padEnd(16)} "${item.text.slice(0, 35)}" → checkbox (${checkboxDetected[key].x}, ${item.y})`)
}

const output = {
  _note: 'Auto-detected. Verify with calibrate.mjs and refine as needed.',
  fields:     detected,
  checkboxes: checkboxDetected,
}

const calibDir = join(root, 'calibration')
if (!existsSync(calibDir)) mkdirSync(calibDir, { recursive: true })

const outPath = join(calibDir, 'form45.auto.json')
writeFileSync(outPath, JSON.stringify(output, null, 2))

console.log()
console.log(`✅  Written: calibration/form45.auto.json`)
console.log()
console.log('Next steps:')
console.log('  node scripts/calibrate.mjs  → visual refinement at http://localhost:5173?form=form45')
console.log('  node scripts/test-fill.mjs  → verify filled PDF output')
