// Curated example zones for the landing page "Try a sample zone" buttons.
// Pre-warm these via POST /api/prep/warm before launch — they then serve from
// cache for 30 days at zero API cost.

export interface ExampleZone {
  label:  string
  postal: string
  hint:   string
}

export const EXAMPLE_ZONES: ExampleZone[] = [
  { label: 'Orchard Road',  postal: '238802', hint: 'F&B + retail dense' },
  { label: 'Tanjong Pagar', postal: '088752', hint: 'Office + dining' },
  { label: 'Marina Bay',    postal: '018989', hint: 'Hospitality + retail' },
  { label: 'Bedok Mall',    postal: '467360', hint: 'Heartland retail' },
  { label: 'Jurong East',   postal: '608550', hint: 'Suburban shopping' },
]
