export type FieldCoord    = { x: number; y: number; maxWidth: number; lineHeight?: number }
export type CheckboxCoord = { x: number; y: number }
export type CoordMap = {
  fields:     Record<string, FieldCoord>
  checkboxes: Record<string, CheckboxCoord>
}

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
