import { NextRequest, NextResponse } from 'next/server'
import { validateNric } from '@/lib/nric'
import type { CsvParseResult, CsvRow } from '@/lib/types'

// POST /api/form45/csv — parse uploaded CSV and return row-level validation
// Handles UTF-8 and UTF-16 (Excel) encodings via iconv-lite.
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Detect and decode encoding
  let csvText: string
  try {
    const iconv = await import('iconv-lite')
    // Detect UTF-16 LE BOM (0xFF 0xFE) or UTF-16 BE BOM (0xFE 0xFF)
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      csvText = iconv.decode(buffer, 'utf-16le')
    } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      csvText = iconv.decode(buffer, 'utf-16be')
    } else {
      csvText = iconv.decode(buffer, 'utf-8')
    }
  } catch {
    csvText = buffer.toString('utf-8')
  }

  // Simple CSV parser (handles quoted fields)
  function parseCsv(text: string): string[][] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
    return lines.map(line => {
      const fields: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
          else inQuotes = !inQuotes
        } else if (ch === ',' && !inQuotes) {
          fields.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      fields.push(current.trim())
      return fields
    })
  }

  const parsed = parseCsv(csvText)
  if (parsed.length < 2) {
    return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })
  }

  const headers = parsed[0]
  const dataRows = parsed.slice(1)

  // Normalise date to ISO format (DD/MM/YYYY, YYYY-MM-DD, D MMM YYYY)
  function normaliseDate(raw: string): string | null {
    if (!raw) return null
    const s = raw.trim()
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // DD/MM/YYYY
    const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`
    // D MMM YYYY
    const months: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
    const mmmMatch = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
    if (mmmMatch) {
      const m = months[mmmMatch[2].toLowerCase()]
      if (m) return `${mmmMatch[3]}-${m}-${mmmMatch[1].padStart(2, '0')}`
    }
    return null
  }

  const rows: CsvRow[] = dataRows.slice(0, 100).map((cols, i) => {
    const preview: Record<string, string> = {}
    headers.forEach((h, j) => { preview[h] = cols[j] ?? '' })

    const errors: string[] = []

    // Basic required field checks using raw header values
    const byHeader = (candidates: string[]): string => {
      for (const c of candidates) {
        const idx = headers.findIndex(h => h.toLowerCase().replace(/[\s_]/g, '') === c.toLowerCase().replace(/[\s_]/g, ''))
        if (idx !== -1 && cols[idx]?.trim()) return cols[idx].trim()
      }
      return ''
    }

    const company = byHeader(['companyname', 'company'])
    const uen     = byHeader(['uen', 'registrationno', 'regno'])
    const name    = byHeader(['directorname', 'name', 'fullname'])
    const nric    = byHeader(['nric', 'fin', 'passport', 'nricfin'])
    const dob     = byHeader(['dob', 'dateofbirth', 'birthdate'])

    if (!company) errors.push('Missing company name')
    if (!uen)     errors.push('Missing UEN')
    if (!name)    errors.push('Missing director name')
    if (nric && !validateNric(nric)) errors.push('Invalid NRIC/FIN')
    if (dob && !normaliseDate(dob))  errors.push('Invalid date format — use DD/MM/YYYY or YYYY-MM-DD')

    return {
      row:     i + 2,  // 1-based, account for header row
      status:  errors.length === 0 ? 'ok' : 'error',
      error:   errors.join('; ') || undefined,
      preview,
    }
  })

  const result: CsvParseResult = {
    headers,
    rows,
    valid_count: rows.filter(r => r.status === 'ok').length,
    error_count: rows.filter(r => r.status === 'error').length,
  }

  return NextResponse.json(result)
}
