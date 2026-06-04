import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';

// Open-Meteo is keyless, CORS-enabled, and free for this volume. If we ever
// outgrow it the swap point is `fetchWeather` below — everything else takes
// the normalized snapshot shape.
const DEFAULT_LOCATION = { lat: -37.8136, lon: 144.9631, label: 'Melbourne' };
const CACHE_KEY = 'siteproof:weather:v1';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — site weather doesn't move fast

export type WeatherTone = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog';

export interface WeatherDay {
  day: string;            // e.g. 'WED'
  tone: WeatherTone;
  high: number;           // °C
  low: number;            // °C
  alert: string | null;   // 'RISK' when precip ≥ 70%
}

export interface CurrentWeather {
  tempC: number;
  windKmh: number;
  humidity: number;       // %
  precipPct: number;      // today's max precip probability %
  tone: WeatherTone;
}

export interface WeatherSnapshot {
  current: CurrentWeather | null;
  forecast: WeatherDay[];
  locationLabel: string;
  loading: boolean;
  error: string | null;
  /** True when `current` is a cached last-known reading shown after a live
   *  refresh failed (both providers down) — the card flags it instead of
   *  blanking. */
  stale?: boolean;
  /** Re-run the fetch (manual Retry). Attached by the hook; never serialized. */
  refetch: () => void;
}

// The data half of the snapshot — everything that gets fetched and cached.
type WeatherData = Omit<WeatherSnapshot, 'refetch'>;

// WMO weather code → coarse visual tone. Source: open-meteo.com/en/docs.
function codeToTone(code: number): WeatherTone {
  if (code === 0) return 'sun';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 85 && code <= 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

async function fetchOpenMeteo(lat: number, lon: number, label: string): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
    `&temperature_unit=celsius&wind_speed_unit=kmh&forecast_days=4&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  const data = await res.json();

  const current: CurrentWeather = {
    tempC: Math.round(data.current.temperature_2m),
    windKmh: Math.round(data.current.wind_speed_10m),
    humidity: Math.round(data.current.relative_humidity_2m),
    precipPct: data.daily?.precipitation_probability_max?.[0] ?? 0,
    tone: codeToTone(data.current.weather_code),
  };

  const forecast: WeatherDay[] = [];
  const days = Math.min(4, data.daily?.time?.length ?? 0);
  for (let i = 1; i < days; i++) {
    const precipMax = data.daily.precipitation_probability_max?.[i] ?? 0;
    forecast.push({
      day: format(new Date(data.daily.time[i]), 'EEE').toUpperCase(),
      tone: codeToTone(data.daily.weather_code[i]),
      high: Math.round(data.daily.temperature_2m_max[i]),
      low: Math.round(data.daily.temperature_2m_min[i]),
      alert: precipMax >= 70 ? 'RISK' : null,
    });
  }

  return { current, forecast, locationLabel: label, loading: false, error: null };
}

// ── Fallback provider (wttr.in) ───────────────────────────────────────────
// Open-Meteo is the primary source but has been intermittently 502'ing from
// some regions (the browser then reports it as a CORS error, since the 502
// page carries no CORS headers). wttr.in is a second keyless, CORS-enabled
// forecast API — its JSON shape + weather codes differ, so we normalize into
// the same WeatherData. Used only when Open-Meteo fails.
interface WttrHour { chanceofrain?: string; weatherDesc?: { value: string }[] }
interface WttrDay { date: string; maxtempC: string; mintempC: string; hourly?: WttrHour[] }
interface WttrResp {
  current_condition?: {
    temp_C: string; windspeedKmph: string; humidity: string;
    weatherDesc?: { value: string }[];
  }[];
  weather?: WttrDay[];
}

// wttr.in uses WWO weather descriptions, not WMO codes — map by keyword, which
// is robust to the long list of code variants.
function descToTone(desc: string): WeatherTone {
  const d = desc.toLowerCase();
  if (d.includes('thunder')) return 'storm';
  if (d.includes('snow') || d.includes('sleet') || d.includes('ice') || d.includes('blizzard')) return 'snow';
  if (d.includes('rain') || d.includes('drizzle') || d.includes('shower')) return 'rain';
  if (d.includes('fog') || d.includes('mist')) return 'fog';
  if (d.includes('overcast')) return 'cloud';
  if (d.includes('partly') || d.includes('partial')) return 'partly';
  if (d.includes('cloud')) return 'cloud';
  if (d.includes('sun') || d.includes('clear')) return 'sun';
  return 'cloud';
}

async function fetchWttr(lat: number, lon: number, label: string): Promise<WeatherData> {
  const res = await fetch(`https://wttr.in/${lat},${lon}?format=j1`);
  if (!res.ok) throw new Error(`Weather fallback ${res.status}`);
  const data = (await res.json()) as WttrResp;
  const cc = data.current_condition?.[0];
  if (!cc) throw new Error('Weather fallback: no data');

  const maxChance = (hourly: WttrHour[]) =>
    hourly.reduce((m, h) => Math.max(m, Number(h.chanceofrain ?? 0)), 0);

  const weatherDays = data.weather ?? [];
  const current: CurrentWeather = {
    tempC: Math.round(Number(cc.temp_C)),
    windKmh: Math.round(Number(cc.windspeedKmph)),
    humidity: Math.round(Number(cc.humidity)),
    precipPct: maxChance(weatherDays[0]?.hourly ?? []),
    tone: descToTone(cc.weatherDesc?.[0]?.value ?? ''),
  };

  const forecast: WeatherDay[] = [];
  const days = Math.min(4, weatherDays.length);
  for (let i = 1; i < days; i++) {
    const d = weatherDays[i];
    const hourly = d.hourly ?? [];
    const midday = hourly[4] ?? hourly[Math.floor(hourly.length / 2)] ?? hourly[0];
    const precip = maxChance(hourly);
    forecast.push({
      day: format(new Date(d.date), 'EEE').toUpperCase(),
      tone: descToTone(midday?.weatherDesc?.[0]?.value ?? ''),
      high: Math.round(Number(d.maxtempC)),
      low: Math.round(Number(d.mintempC)),
      alert: precip >= 70 ? 'RISK' : null,
    });
  }

  return { current, forecast, locationLabel: label, loading: false, error: null };
}

// Primary → fallback. Per-attempt retry lives in the hook.
async function fetchWeather(lat: number, lon: number, label: string): Promise<WeatherData> {
  try {
    return await fetchOpenMeteo(lat, lon, label);
  } catch (primaryErr) {
    try {
      return await fetchWttr(lat, lon, label);
    } catch {
      throw primaryErr; // surface the primary (Open-Meteo) error
    }
  }
}

function readCache(): WeatherData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; snap: WeatherData };
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.snap;
  } catch {
    return null;
  }
}

function writeCache(snap: WeatherData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), snap }));
  } catch {
    /* quota — silently ignore */
  }
}

// Last cached reading regardless of TTL — graceful fallback when a live refresh
// fails so the card shows the last-known weather (flagged stale) rather than
// blanking to "unavailable".
function readStaleCache(): WeatherData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { fetchedAt: number; snap: WeatherData }).snap ?? null;
  } catch {
    return null;
  }
}

export function useWeather(): WeatherSnapshot {
  const [snap, setSnap] = useState<WeatherData>(() => {
    const cached = readCache();
    return cached ?? {
      current: null,
      forecast: [],
      locationLabel: '',
      loading: true,
      error: null,
    };
  });
  // Bumped by refetch() to force the effect to re-run (manual Retry button).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // First mount + already hydrated from the session cache → skip the network.
    // A manual refetch (reloadKey > 0) always re-fetches.
    if (snap.current && reloadKey === 0) return;
    let cancelled = false;

    // Open-Meteo occasionally 5xx's transiently (the browser then surfaces it as
    // a CORS error, since the error page carries no CORS headers). Retry once
    // after a short delay before giving up — most blips clear on the second try.
    const attempt = async (lat: number, lon: number, label: string, tries = 0): Promise<void> => {
      try {
        const result = await fetchWeather(lat, lon, label);
        if (cancelled) return;
        setSnap(result);
        writeCache(result);
      } catch (e) {
        if (cancelled) return;
        if (tries < 1) {
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
          return attempt(lat, lon, label, tries + 1);
        }
        // Both providers + retry exhausted. Prefer last-known weather over a
        // blank "unavailable" card.
        const stale = readStaleCache();
        if (stale?.current) {
          setSnap({ ...stale, loading: false, error: null, stale: true });
          return;
        }
        setSnap((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : 'Weather unavailable',
        }));
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { void attempt(pos.coords.latitude, pos.coords.longitude, 'Site location'); },
        () => { void attempt(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label); },
        { timeout: 5000, maximumAge: CACHE_TTL_MS },
      );
    } else {
      void attempt(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label);
    }

    return () => { cancelled = true; };
    // Re-runs on manual refetch; the snap.current guard handles mount re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const refetch = useCallback(() => {
    setSnap((prev) => ({ ...prev, loading: true, error: null }));
    setReloadKey((k) => k + 1);
  }, []);

  return { ...snap, refetch };
}
