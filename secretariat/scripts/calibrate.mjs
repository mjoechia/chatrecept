/**
 * Visual coordinate calibration tool for Form 45 template overlay.
 *
 * Usage (from secretariat/):
 *   node scripts/calibrate.mjs
 *   open http://localhost:5173?form=form45
 *
 * Workflow:
 *   1. Type a field name in the toolbar (e.g. "company_name")
 *   2. Click where that text should start on the form
 *   3. Click "Save" to persist to calibration/form45.json
 *   4. Run: node scripts/test-fill.mjs && open scripts/test-fill-output.pdf
 *   5. Repeat until all fields are pixel-perfect
 *
 * Coordinate system: pdf-lib uses bottom-left origin.
 * This tool converts screen clicks to that space automatically.
 *
 * After calibration, copy final values into lib/pdf.ts FIELDS / CHECKBOXES maps.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import url from 'url'

const PORT = 5173
const ASSETS_DIR = path.join(process.cwd(), 'assets')
const CALIB_DIR  = path.join(process.cwd(), 'calibration')

if (!fs.existsSync(CALIB_DIR)) fs.mkdirSync(CALIB_DIR, { recursive: true })

function loadPDFBase64(form) {
  const file = path.join(ASSETS_DIR, `${form}-template.pdf`)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file).toString('base64')
}

function loadCalibration(form) {
  const manual = path.join(CALIB_DIR, `${form}.json`)
  const auto   = path.join(CALIB_DIR, `${form}.auto.json`)
  if (fs.existsSync(manual)) return JSON.parse(fs.readFileSync(manual, 'utf-8'))
  if (fs.existsSync(auto))   return JSON.parse(fs.readFileSync(auto,   'utf-8'))
  return {}
}

function saveCalibration(form, data) {
  fs.writeFileSync(path.join(CALIB_DIR, `${form}.json`), JSON.stringify(data, null, 2))
}

function renderHTML({ pdfBase64, calibration, form }) {
  const calibJSON = JSON.stringify(calibration)

  return `<!DOCTYPE html>
<html>
<head>
  <title>Form 45 Calibration — ${form}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1a1a; color: #00ff88; font-family: monospace; }
    #toolbar {
      position: fixed; top: 0; left: 0; right: 0; height: 48px;
      background: #000; display: flex; align-items: center; gap: 10px;
      padding: 0 14px; z-index: 10; border-bottom: 1px solid #333;
    }
    #toolbar label { font-size: 12px; color: #888; }
    #fieldName {
      background: #222; color: #00ff88; border: 1px solid #444;
      padding: 4px 8px; font-family: monospace; font-size: 13px; width: 200px;
    }
    button {
      background: #00ff88; color: #000; border: none;
      padding: 5px 12px; cursor: pointer; font-weight: bold; font-size: 12px;
    }
    button:hover { background: #00cc66; }
    #coords { margin-left: auto; font-size: 12px; color: #666; }
    #canvas-wrap { margin-top: 48px; position: relative; display: inline-block; }
    canvas { display: block; cursor: crosshair; }
    .dot {
      position: absolute; width: 8px; height: 8px;
      background: #ff4444; border-radius: 50%;
      transform: translate(-50%, -50%); pointer-events: none;
    }
    .dot.saved { background: #00ff88; }
    .dot-label {
      position: absolute; font-size: 10px; color: #ffcc00;
      pointer-events: none; white-space: nowrap;
    }
    #status { color: #00ff88; font-size: 12px; }
  </style>
</head>
<body>
<div id="toolbar">
  <label>Field name:</label>
  <input id="fieldName" placeholder="e.g. company_name" autocomplete="off" />
  <button onclick="savePoints()">Save</button>
  <button onclick="clearDots()">Clear dots</button>
  <span id="status"></span>
  <span id="coords">(hover to see coordinates)</span>
</div>

<div id="canvas-wrap">
  <canvas id="pdfCanvas"></canvas>
</div>

<script>
const SCALE = 1.5
const calibration = ${calibJSON}
const points = Object.assign({}, calibration)

// Render the PDF
const pdfBase64 = "${pdfBase64}"
const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

pdfjsLib.getDocument({ data: pdfBytes }).promise
  .then(pdf => pdf.getPage(1))
  .then(page => {
    const viewport = page.getViewport({ scale: SCALE })
    const canvas = document.getElementById('pdfCanvas')
    const ctx = canvas.getContext('2d')
    canvas.width  = viewport.width
    canvas.height = viewport.height
    return page.render({ canvasContext: ctx, viewport }).promise.then(() => canvas)
  })
  .then(canvas => {
    // Draw existing calibration points
    for (const [name, pt] of Object.entries(calibration)) {
      const sx = pt.x * SCALE
      const sy = canvas.height - pt.y * SCALE
      addDotEl(sx, sy, name, true)
    }

    // Mouse move — show live coords
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect()
      const x = (e.clientX - r.left) / SCALE
      const y = (r.bottom - e.clientY) / SCALE
      document.getElementById('coords').textContent =
        '  x: ' + x.toFixed(1) + '  y: ' + y.toFixed(1)
    })

    // Click — record point
    canvas.addEventListener('click', e => {
      const name = document.getElementById('fieldName').value.trim()
      if (!name) { alert('Enter a field name first'); return }
      const r = canvas.getBoundingClientRect()
      const x = parseFloat(((e.clientX - r.left) / SCALE).toFixed(1))
      const y = parseFloat(((r.bottom - e.clientY) / SCALE).toFixed(1))
      points[name] = { x, y }
      addDotEl(e.clientX - r.left, e.clientY - r.top, name, false)
      document.getElementById('status').textContent =
        'Recorded ' + name + ' at (' + x + ', ' + y + ')'
    })
  })

function addDotEl(sx, sy, name, isSaved) {
  const wrap = document.getElementById('canvas-wrap')

  const dot = document.createElement('div')
  dot.className = 'dot' + (isSaved ? ' saved' : '')
  dot.style.left = sx + 'px'
  dot.style.top  = sy + 'px'
  wrap.appendChild(dot)

  const lbl = document.createElement('div')
  lbl.className = 'dot-label'
  lbl.style.left = (sx + 6) + 'px'
  lbl.style.top  = (sy - 10) + 'px'
  lbl.textContent = name
  wrap.appendChild(lbl)
}

function clearDots() {
  document.querySelectorAll('.dot, .dot-label').forEach(el => el.remove())
}

function savePoints() {
  fetch('/save?form=${form}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(points),
  }).then(r => r.text()).then(() => {
    document.getElementById('status').textContent =
      'Saved ' + Object.keys(points).length + ' fields to calibration/${form}.json'
    // Re-mark all dots as saved
    document.querySelectorAll('.dot').forEach(d => d.classList.add('saved'))
  })
}
</script>

<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</body>
</html>`
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true)
  const form   = (parsed.query.form || 'form45').toString()

  if (parsed.pathname === '/save' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        saveCalibration(form, JSON.parse(body))
        res.writeHead(200)
        res.end('ok')
      } catch {
        res.writeHead(400)
        res.end('bad json')
      }
    })
    return
  }

  const pdfBase64 = loadPDFBase64(form)
  if (!pdfBase64) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end(`Template not found: assets/${form}-template.pdf`)
    return
  }

  const calibration = loadCalibration(form)
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(renderHTML({ pdfBase64, calibration, form }))
})

server.listen(PORT, () => {
  console.log(`Calibration tool: http://localhost:${PORT}?form=form45`)
  console.log()
  console.log('Workflow:')
  console.log('  1. Type a field name (e.g. company_name)')
  console.log('  2. Click where the text should start')
  console.log('  3. Click Save')
  console.log('  4. node scripts/test-fill.mjs && open scripts/test-fill-output.pdf')
  console.log('  5. Repeat until pixel-perfect')
  console.log()
  console.log('Green dot = previously saved.  Red dot = this session (not yet saved).')
})
