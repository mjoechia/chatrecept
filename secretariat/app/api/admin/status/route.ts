import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/admin'
import { assetExists } from '@/lib/storage'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// GET /api/admin/status — reports setup state for each component
export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceClient()

  // Template
  const templateLocal   = fs.existsSync(path.join(process.cwd(), 'assets', 'form45-template.pdf'))
  const templateStorage = templateLocal ? false : await assetExists('template.pdf')
  const templateSource  = templateLocal ? 'filesystem' : templateStorage ? 'storage' : 'missing'

  // Font
  const fontLocal   = fs.existsSync(path.join(process.cwd(), 'assets', 'NotoSans-Regular.ttf'))
  const fontStorage = fontLocal ? false : await assetExists('NotoSans.ttf')
  const fontSource  = fontLocal ? 'filesystem' : fontStorage ? 'storage' : 'missing'

  // Coordinates
  let coordSource: 'db' | 'filesystem' | 'default' = 'default'
  try {
    const { data } = await supabase
      .from('secretariat_settings')
      .select('value')
      .eq('key', 'form45_coordinates')
      .single()
    if (data?.value) coordSource = 'db'
  } catch {}

  if (coordSource === 'default') {
    const calibPath = path.join(process.cwd(), 'calibration', 'form45.json')
    if (fs.existsSync(calibPath)) coordSource = 'filesystem'
  }

  return NextResponse.json({
    template:    { exists: templateSource !== 'missing', source: templateSource },
    font:        { exists: fontSource     !== 'missing', source: fontSource },
    coordinates: { source: coordSource },
  })
}
