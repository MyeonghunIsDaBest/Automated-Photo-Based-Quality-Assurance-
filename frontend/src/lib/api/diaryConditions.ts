// Frontend client for detect-diary-conditions. Converts a buffered File to
// base64 and invokes the Edge Function. Returns { skipped: true } when the
// project hasn't opted in (or in mock mode), so callers render nothing.

import { supabase, supabaseConfigured } from '../supabase';

export type ConditionsWeather = 'sunny' | 'cloudy' | 'rain' | 'storm';

export interface DetectedConditions {
  weather: ConditionsWeather;
  temperatureF: number | null;
  crewCount: number;
  confidence: number;
}

export type DetectConditionsResult =
  | (DetectedConditions & { skipped: false })
  | { skipped: true };

const VISION_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Read a File into raw base64 (no `data:` prefix) + its media type. */
function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve({ base64: comma >= 0 ? result.slice(comma + 1) : result, mediaType: file.type });
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'));
    reader.readAsDataURL(file);
  });
}

/** Ask the AI to read a site photo for weather/temp/crew. Skips silently for
 *  non-image files, in mock mode, or when the project hasn't opted in. */
export async function detectConditions(opts: { projectId: string; file: File }): Promise<DetectConditionsResult> {
  if (!supabaseConfigured()) return { skipped: true };
  if (!VISION_TYPES.includes(opts.file.type)) return { skipped: true };
  const { base64, mediaType } = await fileToBase64(opts.file);
  const { data, error } = await supabase.functions.invoke('detect-diary-conditions', {
    body: { projectId: opts.projectId, imageBase64: base64, mediaType },
  });
  if (error) throw error;
  return data as DetectConditionsResult;
}
