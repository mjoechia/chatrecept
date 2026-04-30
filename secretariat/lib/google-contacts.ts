export interface GoogleDate {
  year?: number
  month?: number
  day?: number
}

export interface GooglePerson {
  resourceName?: string
  names?: { displayName?: string }[]
  organizations?: { name?: string }[]
  birthdays?: { date?: GoogleDate }[]
  addresses?: { formattedValue?: string; type?: string }[]
  userDefined?: { key: string; value: string }[]
}

export function flattenContact(person: GooglePerson): Record<string, string> {
  return {
    full_name:        person.names?.[0]?.displayName ?? '',
    company_name:     person.organizations?.[0]?.name ?? '',
    uen:              findUserDefined(person, ['uen', 'company_number', 'regno', 'entity_number']) ?? '',
    nric_display:     findUserDefined(person, ['nric', 'fin', 'passport', 'idnumber']) ?? '',
    nationality:      findUserDefined(person, ['nationality', 'citizenship']) ?? '',
    dob:              formatGoogleDate(person.birthdays?.[0]?.date),
    director_address: person.addresses?.find(a => a.type === 'home')?.formattedValue
                        ?? person.addresses?.[0]?.formattedValue ?? '',
    company_address:  person.addresses?.find(a => a.type === 'work')?.formattedValue ?? '',
  }
}

function findUserDefined(person: GooglePerson, aliases: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '')
  for (const field of person.userDefined ?? []) {
    if (aliases.some(a => norm(field.key) === norm(a))) return field.value
  }
  return null
}

function formatGoogleDate(d?: GoogleDate): string {
  if (!d?.year || !d?.month || !d?.day) return ''
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}
