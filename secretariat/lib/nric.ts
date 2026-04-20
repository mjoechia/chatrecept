/**
 * Singapore NRIC/FIN utilities.
 * Raw NRIC is never stored in the DB — mask at input, validate on entry.
 */

// Mask NRIC for display: "S1234567A" → "SXXXXX67A"
export function maskNric(nric: string): string {
  nric = nric.trim()
  if (nric.length < 4) return '****'
  return nric[0] + 'X'.repeat(nric.length - 4) + nric.slice(-3)
}

// Singapore NRIC checksum algorithm (public specification).
// Returns true for a well-formed, checksum-valid NRIC/FIN.
export function validateNric(raw: string): boolean {
  const nric = raw.trim().toUpperCase()
  if (!/^[STFGM]\d{7}[A-Z]$/.test(nric)) return false

  const weights = [2, 7, 6, 5, 4, 3, 2]
  const offsets: Record<string, number> = { S: 0, T: 4, F: 3, G: 4, M: 3 }
  const checkLetterSets: Record<string, string> = {
    S: 'JZIHGFEDCB',
    T: 'GFEDCBAJZIH',
    F: 'XWUTRQPNMLK',
    G: 'RQPNMLKJXWU',
    M: 'XWUTRQPNMLK',
  }

  const prefix = nric[0]
  const digits = nric.slice(1, 8).split('').map(Number)
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], offsets[prefix] ?? 0)
  const expected = checkLetterSets[prefix]?.[sum % 11]
  return expected === nric[8]
}

// Return just the display form — validates first, returns null if invalid format
export function toDisplayNric(raw: string): string | null {
  if (!validateNric(raw)) return null
  return maskNric(raw)
}
