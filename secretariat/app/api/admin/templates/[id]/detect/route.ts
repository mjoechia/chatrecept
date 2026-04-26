import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin'
import Anthropic from '@anthropic-ai/sdk'
import type { DetectedField } from '@/lib/types'

const client = new Anthropic()

const DETECT_PROMPT = `You are analyzing a scanned PDF form image. Your task: identify every fillable area — text input lines/boxes and checkboxes.

For EACH fillable area return a JSON object with:
- "suggested_column_name": snake_case identifier, e.g. "full_name", "date_of_birth", "is_bankrupt"
- "label": the visible label text nearest this field (verbatim from the form)
- "type": either "text" or "checkbox"
- "pixel_x": x coordinate in the image (pixels from left)
- "pixel_y": y coordinate in the image (pixels from top)
- "pixel_width": estimated width of text field in pixels (omit for checkboxes)
- "confidence": 0.0 to 1.0 — how certain you are this is a fillable field

Return ONLY a JSON array. No commentary. Example:
[
  {"suggested_column_name":"company_name","label":"Company Name","type":"text","pixel_x":240,"pixel_y":180,"pixel_width":420,"confidence":0.95},
  {"suggested_column_name":"is_bankrupt","label":"Undischarged bankrupt","type":"checkbox","pixel_x":80,"pixel_y":540,"confidence":0.88}
]`

function pixelToPdfCoords(
  px: number, py: number,
  imgW: number, imgH: number,
  pdfW: number, pdfH: number,
): { x: number; y: number } {
  return {
    x: Math.round((px / imgW) * pdfW),
    y: Math.round(pdfH - (py / imgH) * pdfH),
  }
}

// POST /api/admin/templates/[id]/detect
// Body: { image: string (base64 PNG), img_width, img_height, pdf_width, pdf_height, page_index }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession()
  if (auth.error) return auth.error

  await params // ensure params resolved

  let body: {
    image: string
    img_width: number
    img_height: number
    pdf_width: number
    pdf_height: number
    page_index?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.image || !body.img_width || !body.img_height || !body.pdf_width || !body.pdf_height) {
    return NextResponse.json({ error: 'Missing required fields: image, img_width, img_height, pdf_width, pdf_height' }, { status: 400 })
  }

  const pageIndex = body.page_index ?? 0

  let rawFields: Array<{
    suggested_column_name: string
    label: string
    type: string
    pixel_x: number
    pixel_y: number
    pixel_width?: number
    confidence: number
  }>

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: body.image,
            },
          },
          { type: 'text', text: DETECT_PROMPT },
        ],
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    // Extract JSON array from response (Claude may wrap in backticks)
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')
    rawFields = JSON.parse(match[0])
  } catch (err) {
    return NextResponse.json({ error: `AI detection failed: ${String(err)}` }, { status: 500 })
  }

  // Validate, transform coordinates, and clean up
  const fields: DetectedField[] = rawFields
    .filter(f =>
      f.suggested_column_name &&
      (f.type === 'text' || f.type === 'checkbox') &&
      typeof f.pixel_x === 'number' &&
      typeof f.pixel_y === 'number'
    )
    .map(f => {
      const { x, y } = pixelToPdfCoords(
        f.pixel_x, f.pixel_y,
        body.img_width, body.img_height,
        body.pdf_width, body.pdf_height,
      )
      // Clamp to plausible PDF dimensions
      const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max))
      const result: DetectedField = {
        suggested_column_name: f.suggested_column_name,
        label: f.label ?? f.suggested_column_name,
        type: f.type as 'text' | 'checkbox',
        position: { x: clamp(x, body.pdf_width), y: clamp(y, body.pdf_height) },
        confidence: Math.max(0, Math.min(1, f.confidence ?? 0.5)),
        page: pageIndex,
      }
      if (f.type === 'text' && f.pixel_width) {
        result.dimensions = {
          width: Math.round((f.pixel_width / body.img_width) * body.pdf_width),
        }
      }
      return result
    })
    .sort((a, b) => b.confidence - a.confidence)

  return NextResponse.json({ fields, model: 'claude-sonnet-4-6' })
}
