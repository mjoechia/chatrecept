import type { Company, Person, Form45Data } from './types'

export function mapToForm45(
  company: Pick<Company, 'name' | 'uen'>,
  person: Pick<Person, 'full_name' | 'nric_masked' | 'nationality' | 'dob' | 'address'>,
  overrides: Partial<Form45Data> = {},
): Partial<Form45Data> {
  return {
    company_name:  company.name,
    uen:           company.uen,
    director_name: person.full_name,
    nric_display:  person.nric_masked ?? '',
    nationality:   person.nationality ?? '',
    dob:           person.dob ?? '',
    address:       person.address ?? '',
    ...overrides,
  }
}

// Future: mapToForm45A, mapToForm45B, etc. follow the same pattern.
