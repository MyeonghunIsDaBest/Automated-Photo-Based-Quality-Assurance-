// ─────────────────────────────────────────────────────────────────────────────
// lib/geo.ts — free-stack geography helpers (no API key):
//   • geocodeSearch()  — Nominatim (OpenStreetMap) address search, AU-biased
//   • getOrGeocode()   — cache-aware single-address geocode (geocoded_addresses,
//                        migration 92; falls back to live lookup pre-migration)
//   • haversineKm()    — straight-line distance between two pins ("≈ direct")
// Nominatim usage policy: low volume, identified requests, debounced UI calls.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from './supabase';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeocodeResult extends GeoPoint {
  /** Display label from the geocoder (full formatted address). */
  label: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Normalised cache key for an address string. */
export function addressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Straight-line (haversine) distance in km, rounded to 1 decimal. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

/** Free-text address search (Nominatim, biased to Australia). Returns up to
 *  `limit` candidates. Throws on network failure — callers show the error. */
export async function geocodeSearch(query: string, limit = 5): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${NOMINATIM}?format=jsonv2&countrycodes=au&limit=${limit}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  return rows.map((r) => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name }));
}

// Session-scoped memo (works even pre-migration-92) + polite spacing so a
// burst of live lookups (e.g. 8 uncached job addresses) never exceeds the
// Nominatim 1-request/second usage policy.
const memCache = new Map<string, GeoPoint | null>();
let nextLiveLookupAt = 0;
async function politeGap(): Promise<void> {
  const now = Date.now();
  const wait = nextLiveLookupAt - now;
  nextLiveLookupAt = Math.max(now, nextLiveLookupAt) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Geocode one address with a Supabase-backed cache (migration 92). Returns
 *  null when the address can't be resolved. Cache read/write failures (e.g.
 *  migration not applied yet) degrade silently to a live lookup. */
export async function getOrGeocode(address: string): Promise<GeoPoint | null> {
  const key = addressKey(address);
  if (!key) return null;
  if (memCache.has(key)) return memCache.get(key) ?? null;

  if (supabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('geocoded_addresses')
        .select('lat, lng')
        .eq('address_key', key)
        .maybeSingle();
      if (!error && data) {
        const pt = { lat: Number(data.lat), lng: Number(data.lng) };
        memCache.set(key, pt);
        return pt;
      }
    } catch { /* cache table missing (pre-mig-92) — fall through to live lookup */ }
  }

  let hit: GeocodeResult | undefined;
  try {
    await politeGap();
    [hit] = await geocodeSearch(address, 1);
  } catch {
    return null; // offline / rate-limited — caller just shows no distance
  }
  if (!hit) {
    memCache.set(key, null); // don't re-ask for an unresolvable address this session
    return null;
  }
  memCache.set(key, { lat: hit.lat, lng: hit.lng });

  if (supabaseConfigured()) {
    try {
      await supabase
        .from('geocoded_addresses')
        .upsert({ address_key: key, address: address.trim(), lat: hit.lat, lng: hit.lng }, { onConflict: 'address_key' });
    } catch { /* cache write is best-effort */ }
  }
  return { lat: hit.lat, lng: hit.lng };
}
