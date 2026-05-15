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
): Promise<PlaceSummary[]> {
  const cacheKey = `places:nearby:${lat.toFixed(4)},${lng.toFixed(4)}:${radiusMeters}`
  const cached = await cacheGet<PlaceSummary[]>(cacheKey)
  if (cached) return cached

  const body = {
    includedTypes: ['restaurant', 'store', 'cafe', 'bakery', 'beauty_salon',
                    'gym', 'spa', 'lodging', 'shopping_mall', 'clothing_store',
                    'jewelry_store', 'electronics_store', 'book_store'],
    maxResultCount: 20,
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
    console.error('Google Places searchNearby failed', res.status, await res.text())
    return []
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

  await cacheSet(cacheKey, places, TTL.PLACE)
  return places
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
  if (t.match(/restaurant|cafe|bakery|food|bar/)) return 'F&B'
  if (t.match(/store|shopping|jewelry|clothing|electronics|book/)) return 'retail'
  if (t.match(/beauty|spa|salon|gym|health/)) return 'services'
  if (t.match(/lodging|hotel/)) return 'hospitality'
  return 'other'
}
