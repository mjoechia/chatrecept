import { NextRequest, NextResponse } from 'next/server'
import { createSessionClient } from '@/lib/supabase-server'
import { flattenContact, type GooglePerson } from '@/lib/google-contacts'
import type { ParseResult } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MAX_CONTACTS = 500
const PERSON_FIELDS = [
  'names', 'organizations', 'birthdays', 'addresses', 'userDefined',
].join(',')

// GET /api/google/contacts — fetches and flattens Google Contacts into ParseResult
// Reads access token from HTTP-only cookie set by /api/google/callback
export async function GET(req: NextRequest) {
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = req.cookies.get('google_access_token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Google access token missing or expired — please reconnect' }, { status: 401 })
  }

  // Paginate People API until we have all contacts (capped at MAX_CONTACTS)
  let pageToken: string | undefined
  const allPeople: GooglePerson[] = []
  let truncated = false

  do {
    const params = new URLSearchParams({
      personFields: PERSON_FIELDS,
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    })
    const res = await fetch(
      `https://people.googleapis.com/v1/people/me/connections?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: body?.error?.message ?? 'Failed to fetch Google Contacts' },
        { status: res.status === 401 ? 401 : 502 }
      )
    }

    const json = await res.json()
    const connections: GooglePerson[] = json.connections ?? []
    allPeople.push(...connections)

    if (allPeople.length >= MAX_CONTACTS) {
      truncated = true
      break
    }
    pageToken = json.nextPageToken
  } while (pageToken)

  const limited = allPeople.slice(0, MAX_CONTACTS)
  const rows    = limited.map(flattenContact)

  // All column names are canonical — lock them all
  const headers = Object.keys(rows[0] ?? {})
  const columnMeta: ParseResult['columnMeta'] = {}
  for (const h of headers) {
    columnMeta[h] = { locked: true, source: 'Google Contacts' }
  }

  const result: ParseResult = {
    headers,
    rows,
    row_count: rows.length,
    source_type: 'google_contacts',
    columnMeta,
  }

  const response = NextResponse.json({ ...result, truncated })
  // Clear the cookie after use — single-use token flow
  response.cookies.set('google_access_token', '', { maxAge: 0, path: '/api/google' })
  return response
}
