// Central field classification for all secretariat form templates.
// Field KEY is the shared contract across templates — two templates using
// the same key are automatically populated from the same data source.

// Company fields — resolved from companies table via UEN (registered office address only)
export const COMPANY_FIELD_MAP: Record<string, string> = {
  company_name:    'name',
  uen:             'uen',
  company_address: 'address',
}

// Director/person fields — resolved from persons table
// A form can have BOTH company_address and director_address simultaneously.
export const PERSON_FIELD_MAP: Record<string, string> = {
  director_name:    'full_name',
  full_name:        'full_name',
  nric_display:     'nric_masked',
  nric_masked:      'nric_masked',
  nationality:      'nationality',
  dob:              'dob',
  director_address: 'address',
  // bare 'address' falls back to director residential (most common in ACRA forms)
  address:          'address',
}

// Auto-filled with today's date (editable by user)
export const AUTO_FIELDS = new Set([
  'consent_date', 'date', 'today', 'generated_date',
])

// Canonical aliases for CSV column auto-matching.
// Always use the canonical key (left side) in template calibration.
export const FIELD_ALIASES: Record<string, string[]> = {
  uen:              ['uen', 'company_number', 'companyno', 'entity_number', 'regno'],
  company_name:     ['company', 'corp', 'entity', 'companyname'],
  company_address:  ['companyaddress', 'registeredoffice', 'officialaddress'],
  director_name:    ['full_name', 'name', 'fullname', 'clientname', 'director'],
  full_name:        ['full_name', 'name', 'fullname'],
  nric_display:     ['nric', 'fin', 'passport', 'idnumber', 'nric_display'],
  nric_masked:      ['nric_masked', 'nric'],
  nationality:      ['nationality', 'citizenship'],
  dob:              ['dateofbirth', 'birthdate', 'dob'],
  director_address: ['directoraddress', 'residentialaddress', 'homeaddress', 'address'],
  address:          ['address', 'residentialaddress', 'homeaddress'],
  consent_date:     ['consentdate', 'signaturedate', 'date'],
}

// Human-readable labels (used by formfill, batch map, calibrate)
export const FIELD_LABELS: Record<string, string> = {
  company_name:     'Company Name',
  uen:              'UEN',
  company_address:  'Company Address (Registered Office)',
  director_name:    'Director Name',
  full_name:        'Full Name',
  nric_display:     'NRIC / FIN',
  nric_masked:      'NRIC (Masked)',
  nationality:      'Nationality',
  dob:              'Date of Birth',
  director_address: 'Director Residential Address',
  address:          'Address',
  consent_date:     'Consent Date',
  bankrupt:         'Undischarged Bankrupt',
  convicted:        'Convicted of Offence',
  disqualified:     'Disqualified Director',
  struck_off:       'Struck Off Company',
  nominee_director: 'Nominee Director',
  employment_pass:  'Employment Pass',
}

// Preferred display order — company first, then person, template-specific sorted alphabetically after
export const FIELD_ORDER = [
  'company_name', 'uen', 'company_address',
  'director_name', 'full_name',
  'nric_display', 'nric_masked',
  'nationality', 'dob', 'director_address', 'address',
]

// Returns the field category for a given key
export type FieldCategory = 'company' | 'director' | 'auto' | 'manual'

export function getFieldCategory(key: string): FieldCategory {
  if (key in COMPANY_FIELD_MAP) return 'company'
  if (key in PERSON_FIELD_MAP)  return 'director'
  if (AUTO_FIELDS.has(key))     return 'auto'
  return 'manual'
}

// Build a single row from company + person data, with today's date for auto fields
export function resolveRow(
  templateFields: Record<string, unknown>,
  company: { name: string; uen: string; address?: string | null } | null,
  person: { full_name: string; nric_masked?: string | null; nationality?: string | null; dob?: string | null; address?: string | null } | null,
  manualValues: Record<string, string>,
  today: string,
): Record<string, string> {
  const row: Record<string, string> = {}
  for (const key of Object.keys(templateFields)) {
    if (key in COMPANY_FIELD_MAP && company) {
      const prop = COMPANY_FIELD_MAP[key] as keyof typeof company
      row[key] = String(company[prop] ?? '')
    } else if (key in PERSON_FIELD_MAP && person) {
      const prop = PERSON_FIELD_MAP[key] as keyof typeof person
      row[key] = String(person[prop] ?? '')
    } else if (AUTO_FIELDS.has(key)) {
      row[key] = manualValues[key] ?? today
    } else {
      row[key] = manualValues[key] ?? ''
    }
  }
  return row
}
