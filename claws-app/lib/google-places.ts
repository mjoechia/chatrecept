// Google Places API (v1) wrapper with cache.
// Docs: https://developers.google.com/maps/documentation/places/web-service/op-overview

import { cacheGet, cacheSet, TTL } from './cache'

export interface PlaceSummary {
  place_id: string
  name: string
  types: string[]
  business_status?: string
}

export interface PlaceDetails {
  place_id: string
  name: string
  phone?: string
  website?: string
  types: string[]
  business_status?: string
  user_rating_count?: number
  rating?: number
}

const KEY = () => process.env.GOOGLE_PLACES_API_KEY ?? ''

// Nearby Search (New) — returns up to 20 places within radius
export async function searchNearby(
  lat: number,
  lng: number,
  radiusMeters = 500,
  rankPreference: 'POPULARITY' | 'DISTANCE' = 'POPULARITY',
): Promise<PlaceSummary[]> {
  const cacheKey = `places:nearby:${lat.toFixed(4)},${lng.toFixed(4)}:${radiusMeters}:${rankPreference}`
  const cached = await cacheGet<PlaceSummary[]>(cacheKey)
  if (cached) return cached

  // No includedTypes filter — we want ALL business types (CBD = banks,
  // accounting, law; suburbs = F&B, retail, salons). Exclude obvious
  // non-business categories so we don't waste a slot on a bus stop.
  //
  // IMPORTANT: only Table A primary types are valid in excludedPrimaryTypes.
  // Umbrella categories like "place_of_worship" or "public_bathroom" get
  // rejected with 400 Unsupported types. Use the specific religion / facility
  // types instead.
  const body = {
    excludedPrimaryTypes: [
      'bus_station', 'subway_station', 'train_station', 'transit_station',
      'park', 'church', 'mosque', 'hindu_temple', 'synagogue', 'cemetery',
      'school', 'primary_school', 'secondary_school', 'university',
      'tourist_attraction', 'airport', 'embassy', 'police', 'fire_station',
      'parking', 'atm',
    ],
    maxResultCount: 20,
    rankPreference,
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
    },
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY(),
      'X-Goog-FieldMask': 'places.id,places.displayName,places.types,places.businessStatus',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error(`[places.searchNearby] HTTP ${res.status}`, await res.text())
    return []
  }

  const json = await res.json()
  if (!json.places) {
    console.warn(`[places.searchNearby] returned no "places" key. Body keys: ${Object.keys(json).join(',')}`)
  }
  const places: PlaceSummary[] = (json.places ?? []).map((p: {
    id: string
    displayName?: { text: string }
    types?: string[]
    businessStatus?: string
  }) => ({
    place_id:       p.id,
    name:           p.displayName?.text ?? 'Unknown',
    types:          p.types ?? [],
    business_status: p.businessStatus,
  }))

  await cacheSet(cacheKey, places, TTL.PLACE)
  return places
}

// Text Search (New) — paginated up to 3 pages × 20 = 60 results.
// Complements Nearby Search by surfacing places that match a broad query
// rather than just sitting in a radius. Cheap, useful for dense zones where
// Nearby's 20 cap is binding.
export async function searchByText(
  lat: number,
  lng: number,
  query: string,
  radiusMeters = 500,
): Promise<PlaceSummary[]> {
  const cacheKey = `places:text:${lat.toFixed(4)},${lng.toFixed(4)}:${radiusMeters}:${query.slice(0, 60)}`
  const cached = await cacheGet<PlaceSummary[]>(cacheKey)
  if (cached) return cached

  const all: PlaceSummary[] = []
  let pageToken: string | undefined

  for (let page = 0; page < 3; page++) {
    const body: Record<string, unknown> = {
      textQuery: query,
      pageSize: 20,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
      },
    }
    if (pageToken) body.pageToken = pageToken

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.id,places.displayName,places.types,places.businessStatus,nextPageToken',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      console.error(`[places.searchText] HTTP ${res.status}`, await res.text())
      break
    }

    const json = await res.json()
    const places: PlaceSummary[] = (json.places ?? []).map((p: {
      id: string
      displayName?: { text: string }
      types?: string[]
      businessStatus?: string
    }) => ({
      place_id:       p.id,
      name:           p.displayName?.text ?? 'Unknown',
      types:          p.types ?? [],
      business_status: p.businessStatus,
    }))
    all.push(...places)

    pageToken = json.nextPageToken
    if (!pageToken) break
  }

  await cacheSet(cacheKey, all, TTL.PLACE)
  return all
}

// Run multiple discovery strategies in parallel and dedupe.
//  - Nearby ranked by POPULARITY: top 20 most-popular
//  - Nearby ranked by DISTANCE:   top 20 closest
//  - Text Search "businesses":    up to 60 broadly-matching
// Union gives 60-100 unique places for dense zones.
//
// `saturated` is true when all three sources hit their caps — signal that
// "there are still more in this zone that we didn't fetch".
export async function discoverNearby(
  lat: number,
  lng: number,
  radiusMeters = 500,
): Promise<{ places: PlaceSummary[]; saturated: boolean }> {
  const [popular, nearest, textHits] = await Promise.all([
    searchNearby(lat, lng, radiusMeters, 'POPULARITY'),
    searchNearby(lat, lng, radiusMeters, 'DISTANCE'),
    searchByText(lat, lng, 'shops restaurants services offices businesses', radiusMeters),
  ])

  // Interleave preferring popularity > nearest > text relevance
  const seen   = new Set<string>()
  const merged: PlaceSummary[] = []
  const maxLen = Math.max(popular.length, nearest.length, textHits.length)
  for (let i = 0; i < maxLen; i++) {
    for (const arr of [popular, nearest, textHits]) {
      const p = arr[i]
      if (p && !seen.has(p.place_id)) { seen.add(p.place_id); merged.push(p) }
    }
  }

  const saturated = popular.length >= 20 && nearest.length >= 20 && textHits.length >= 60
  return { places: merged, saturated }
}

// Place Details — phone, website, ratings
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const cacheKey = `places:details:${placeId}`
  const cached = await cacheGet<PlaceDetails>(cacheKey)
  if (cached) return cached

  const url = `https://places.googleapis.com/v1/places/${placeId}`
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': KEY(),
      'X-Goog-FieldMask': 'id,displayName,internationalPhoneNumber,websiteUri,types,businessStatus,userRatingCount,rating',
    },
  })

  if (!res.ok) {
    console.error('Google Places details failed', placeId, res.status)
    return null
  }

  const p = await res.json()
  const details: PlaceDetails = {
    place_id:          p.id,
    name:              p.displayName?.text ?? 'Unknown',
    phone:             p.internationalPhoneNumber,
    website:           p.websiteUri,
    types:             p.types ?? [],
    business_status:   p.businessStatus,
    user_rating_count: p.userRatingCount,
    rating:            p.rating,
  }

  await cacheSet(cacheKey, details, TTL.PLACE)
  return details
}

// Map Google place types → our internal sector taxonomy
export function inferSector(types: string[]): string {
  const t = types.join(',').toLowerCase()
  if (t.match(/restaurant|cafe|bakery|food|bar|coffee/)) return 'F&B'
  if (t.match(/bank|finance|insurance|atm/))             return 'finance'
  if (t.match(/lawyer|accounting|notary|real_estate/))   return 'professional'
  if (t.match(/store|shopping|jewelry|clothing|electronics|book|grocer|supermarket|convenience/)) return 'retail'
  if (t.match(/beauty|spa|salon|gym|barber|hair|nail/))  return 'wellness'
  if (t.match(/doctor|dentist|pharmacy|clinic|hospital|veterinary/)) return 'health'
  if (t.match(/lodging|hotel|hostel/))                   return 'hospitality'
  if (t.match(/car_repair|laundry|cleaning|electrician|plumber/)) return 'services'
  return 'other'
}
