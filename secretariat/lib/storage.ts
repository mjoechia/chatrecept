import { createServiceClient } from './supabase'
import type { Readable } from 'stream'

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

// ── Generic template system storage helpers ──────────────────────────────────

// Upload a template's source PDF. Path: _templates/{templateId}/template.pdf
export async function uploadTemplatePdf(templateId: string, bytes: Uint8Array): Promise<string> {
  const supabase = createServiceClient()
  const storagePath = `_templates/${templateId}/template.pdf`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`Template upload failed: ${error.message}`)
  return storagePath
}

// Upload a generated submission PDF. Path: submissions/{submissionId}/output.pdf
export async function uploadSubmissionPdf(submissionId: string, bytes: Uint8Array): Promise<string> {
  const supabase = createServiceClient()
  const storagePath = `submissions/${submissionId}/output.pdf`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`Submission PDF upload failed: ${error.message}`)
  return storagePath
}

// Download any file by its full storage path (templates may be at _config/ or _templates/)
export async function downloadByPath(storagePath: string): Promise<Uint8Array | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

// Stream any file by its full storage path (used for streaming ZIP endpoint)
export async function streamByPath(storagePath: string): Promise<Readable> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)
  if (error || !data) throw new Error(`Stream failed for ${storagePath}: ${error?.message}`)
  // Convert Web API ReadableStream → Node Readable
  const { Readable } = await import('stream')
  const arrayBuffer = await data.arrayBuffer()
  return Readable.from(Buffer.from(arrayBuffer))
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
