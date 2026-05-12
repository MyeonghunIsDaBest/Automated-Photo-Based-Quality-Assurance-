import { useEffect, useState } from 'react';
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
}

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

async function fetchWeather(lat: number, lon: number, label: string): Promise<WeatherSnapshot> {
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

function readCache(): WeatherSnapshot | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fetchedAt: number; snap: WeatherSnapshot };
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.snap;
  } catch {
    return null;
  }
}

function writeCache(snap: WeatherSnapshot) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), snap }));
  } catch {
    /* quota — silently ignore */
  }
}

export function useWeather(): WeatherSnapshot {
  const [snap, setSnap] = useState<WeatherSnapshot>(() => {
    const cached = readCache();
    return cached ?? {
      current: null,
      forecast: [],
      locationLabel: '',
      loading: true,
      error: null,
    };
  });

  useEffect(() => {
    // Already hydrated from the session cache — skip the network round-trip.
    if (snap.current) return;
    let cancelled = false;

    const load = async (lat: number, lon: number, label: string) => {
      try {
        const result = await fetchWeather(lat, lon, label);
        if (cancelled) return;
        setSnap(result);
        writeCache(result);
      } catch (e) {
        if (cancelled) return;
        setSnap((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : 'Weather unavailable',
        }));
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { void load(pos.coords.latitude, pos.coords.longitude, 'Site location'); },
        () => { void load(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label); },
        { timeout: 5000, maximumAge: CACHE_TTL_MS },
      );
    } else {
      void load(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.label);
    }

    return () => { cancelled = true; };
    // Only run on mount — the snap.current guard handles re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return snap;
}
