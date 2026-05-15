// Geocode a Singapore postal code → lat/lng.
//
// We use Google Geocoding API (same API key as Places). OneMap.sg was the
// previous free option but now requires an auth token, so we standardise on
// Google for consistency. Add OneMap token + fallback later if cost matters.
// Docs: https://developers.google.com/maps/documentation/geocoding/start

export interface GeocodeResult {
  postal_code: string
  latitude: number
  longitude: number
  address: string
}

export async function postalToLatLng(postalCode: string): Promise<GeocodeResult | null> {
  const normalized = postalCode.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return null

  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    console.error('GOOGLE_PLACES_API_KEY not set')
    return null
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${normalized}+Singapore&region=sg&components=country:SG&key=${key}`
  const res = await fetch(url)
  if (!res.ok) return null

  const json = await res.json()
  if (json.status !== 'OK' || !json.results?.length) return null

  const first = json.results[0]
  return {
    postal_code: normalized,
    latitude:    first.geometry.location.lat,
    longitude:   first.geometry.location.lng,
    address:     first.formatted_address,
  }
}
