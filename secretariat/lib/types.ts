// ── Legacy Form 45 coord types (kept for backward compat with existing API routes) ──
export type FieldCoord    = { x: number; y: number; maxWidth: number; lineHeight?: number }
export type CheckboxCoord = { x: number; y: number }
export type CoordMap = {
  fields:     Record<string, FieldCoord>
  checkboxes: Record<string, CheckboxCoord>
}

// ── Production-grade template coord schema ───────────────────────────────────
// Used by overlayTemplate, /api/admin/templates, and all batch generation.
// Every field has a page index, position in PDF points (bottom-left origin),
// optional transform/validation, and a logic rule for checkboxes/radio.

export interface FieldDef {
  type: 'text' | 'checkbox' | 'date' | 'radio' | 'signature'
  page: number                                    // 0-indexed PDF page
  position: { x: number; y: number }             // PDF points, bottom-left origin
  dimensions?: { width: number; height?: number }
  style?: { font_size?: number; align?: 'left' | 'center' | 'right' }
  mapping: { source_key: string }                 // key that column_map resolves against
  transform?: {
    uppercase?: boolean
    trim?: boolean
    format_date?: string                          // e.g. "DD/MM/YYYY"
    prefix?: string
    suffix?: string
  }
  validation?: { required?: boolean; max_length?: number; regex?: string }
  logic?: {
    show_when: 'truthy' | 'falsy' | { equals: string }
  }
  options?: Array<{                               // radio fields only
    value: string
    page: number
    position: { x: number; y: number }
  }>
  hidden?: boolean                                 // admin-suppressed from PDF output
  // Set by AI detection, stripped before DB storage
  _detect_confidence?: number
  _detect_label?: string
}

export interface TemplateCoordMap {
  version: number
  coordinate_system: {
    origin: 'bottom_left'
    unit: 'points'
  }
  pdf_meta: {
    page_count: number
    page_sizes: Record<string, { width: number; height: number }>
  }
  fields: Record<string, FieldDef>
}

// ── Form 45 ──────────────────────────────────────────────────────────────────
export interface Form45Data {
  id: string
  tenant_id: string | null
  company_name: string
  uen: string
  director_name: string
  nric_display: string | null
  nric_encrypted: string | null
  nationality: string
  dob: string | null           // ISO date string
  address: string | null
  declarations: {
    bankrupt?: boolean
    convicted?: boolean
    disqualified?: boolean
    struck_off?: boolean
    nominee_director?: boolean
    employment_pass?: boolean
  }
  consent_date: string         // ISO date string
  pdf_path: string | null
  status: 'draft' | 'generating' | 'generated' | 'failed'
  source: 'ui' | 'api' | 'csv'
  error_msg: string | null
  created_at: string
  updated_at: string
}

// ── API keys ─────────────────────────────────────────────────────────────────
export interface ApiKey {
  id: string
  name: string
  key_hash: string
  scope: string
  rate_limit_per_minute: number
  allowed_ips: string[] | null
  created_at: string
  last_used: string | null
  revoked_at: string | null
}

// ── CSV (Form 45 legacy) ─────────────────────────────────────────────────────
export interface CsvRow {
  row: number
  status: 'ok' | 'error'
  error?: string
  preview: Record<string, string>
}

export interface CsvParseResult {
  headers: string[]
  rows: CsvRow[]
  valid_count: number
  error_count: number
}

// ── Generic template system ──────────────────────────────────────────────────
export interface FormTemplate {
  id: string
  name: string
  description: string | null
  pdf_storage_path: string
  coord_map: TemplateCoordMap
  status: 'draft' | 'active' | 'archived'
  version: number
  created_at: string
  updated_at: string
}

export interface FormSubmission {
  id: string
  template_id: string
  batch_job_id: string | null
  recipient_data: Record<string, unknown>
  content_hash: string | null
  coord_map_snapshot: TemplateCoordMap | null
  pdf_path: string | null
  status: 'pending' | 'generating' | 'generated' | 'failed'
  error_msg: string | null
  source: 'batch' | 'api'
  created_at: string
}

export interface BatchJob {
  id: string
  template_id: string
  label: string | null
  column_map: ColumnMapping
  total: number
  completed: number
  failed_count: number
  status: 'pending' | 'running' | 'done' | 'partial_fail'
  source_type: 'csv' | 'xlsx' | 'google_contacts'
  created_at: string
  updated_at: string
}

// Maps template field source_key → data source column name (stored in batch_jobs.column_map)
export type ColumnMapping = Record<string, string>

// Used in mapping UI (ephemeral, not stored)
export interface MappingCandidate {
  source_key: string
  label?: string
  field_type: FieldDef['type']
  mapped_column: string | null
  confidence: 'high' | 'low' | null
}

// Response from /api/batch/parse
export interface ParseResult {
  headers: string[]
  rows: Record<string, string>[]
  row_count: number
  source_type: 'csv' | 'xlsx'
}

// Response from /api/admin/templates/[id]/detect
export interface DetectedField {
  suggested_column_name: string
  label: string
  type: 'text' | 'checkbox'
  position: { x: number; y: number }
  dimensions?: { width: number }
  confidence: number
  page: number
}

// ── Companies & Persons (company secretary data store) ───────────────────────

export interface Company {
  id: string
  user_id: string
  name: string
  uen: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Person {
  id: string
  user_id: string
  full_name: string
  nric_masked: string | null
  nric_encrypted: string | null   // encrypted raw NRIC for official forms
  nationality: string | null
  dob: string | null              // ISO date
  address: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface CompanyPerson {
  id: string
  company_id: string
  person_id: string
  role: 'director' | 'secretary'
}

// Snapshot stored in form45.source_snapshot at save time (audit integrity)
export interface FormSnapshot {
  company_id: string | null
  person_id: string | null
  company_name: string
  uen: string
  director_name: string
  nric_display: string
  nationality: string
  dob: string
  address: string
}
