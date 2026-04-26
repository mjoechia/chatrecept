import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { redirectToLogin } from '@/lib/auth'
import iconv from 'iconv-lite'
import type { ParseResult } from '@/lib/types'

// POST /api/batch/parse — parse CSV or XLSX, return headers + preview rows
export async function POST(req: NextRequest) {
  const sessionSupabase = await createSessionClient()
  const { data: { user } } = await sessionSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const fileName = file.name.toLowerCase()
  const bytes = Buffer.from(await file.arrayBuffer())

  let headers: string[]
  let rows: Record<string, string>[]
  let sourceType: 'csv' | 'xlsx'

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    sourceType = 'xlsx'
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    if (jsonData.length === 0) {
      return NextResponse.json({ error: 'Spreadsheet is empty' }, { status: 400 })
    }

    headers = Object.keys(jsonData[0])
    rows = jsonData.map(row =>
      Object.fromEntries(
        headers.map(h => [h, row[h] instanceof Date ? (row[h] as Date).toISOString().split('T')[0] : String(row[h] ?? '')])
      )
    )
  } else {
    // CSV (with UTF-16 / BOM detection)
    sourceType = 'csv'
    let text: string
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      text = iconv.decode(bytes.slice(2), 'utf-16le')
    } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      text = iconv.decode(bytes.slice(2), 'utf-16be')
    } else {
      text = iconv.decode(bytes, 'utf-8')
    }

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have at least a header row and one data row' }, { status: 400 })
    }

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuote = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
          else inQuote = !inQuote
        } else if (ch === ',' && !inQuote) {
          result.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      result.push(current.trim())
      return result
    }

    headers = parseCSVLine(lines[0])
    rows = lines.slice(1).map(line => {
      const values = parseCSVLine(line)
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    })
  }

  // Return all rows (caller slices for preview display)
  const result: ParseResult = {
    headers,
    rows,
    row_count: rows.length,
    source_type: sourceType,
  }

  return NextResponse.json(result)
}
