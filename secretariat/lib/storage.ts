import { createServiceClient } from './supabase'

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'form45'

// Upload PDF bytes to Supabase Storage. Returns the storage path.
export async function uploadPdf(formId: string, pdfBytes: Uint8Array): Promise<string> {
  const supabase = createServiceClient()
  const path = `form45/${formId}/form45.pdf`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return path
}

// ── Admin asset helpers (template PDF, NotoSans font) ────────────────────────
// Assets stored at {BUCKET}/_config/{name} — separate from user form PDFs.

export async function uploadAsset(name: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`_config/${name}`, bytes, { contentType, upsert: true })
  if (error) throw new Error(`Asset upload failed: ${error.message}`)
}

export async function downloadAsset(name: string): Promise<Uint8Array | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(`_config/${name}`)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

export async function assetExists(name: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase.storage
    .from(BUCKET)
    .list('_config', { search: name })
  return !!data?.some(f => f.name === name)
}

// Generate a fresh signed URL for an existing PDF path (1 hour TTL).
export async function getSignedUrl(pdfPath: string): Promise<string> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pdfPath, 3600)

  if (error || !data?.signedUrl) {
    throw new Error(`Signed URL generation failed: ${error?.message ?? 'no url'}`)
  }
  return data.signedUrl
}
