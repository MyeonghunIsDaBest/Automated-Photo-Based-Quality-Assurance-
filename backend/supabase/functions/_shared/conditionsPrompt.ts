// Vision prompt + parser for detect-diary-conditions. Claude looks at a single
// site photo and infers the day's weather, rough temperature, and visible crew
// count, returning STRICT JSON so the parser can branch without heuristics
// beyond trimming to the first/last brace.

export const CONDITIONS_SYSTEM = [
  'You are a construction site supervisor reading a single field photo to log the day\'s conditions.',
  'From the image alone, infer the weather, approximate air temperature, and how many crew are visibly on site.',
  'Respond with STRICT JSON only, no prose, no markdown fences:',
  '{"weather":"sunny"|"cloudy"|"rain"|"storm","temperatureF":number|null,"crewCount":number,"confidence":number}',
  '- weather: best single match for the visible sky/ground conditions.',
  '- temperatureF: a rough Fahrenheit estimate from visible cues (clothing, frost, haze); null if there is no usable cue.',
  '- crewCount: number of distinct people visibly working in the frame; 0 if none.',
  '- confidence: 0-1, your overall confidence in this reading.',
].join('\n');

export const CONDITIONS_USER_TEXT =
  'Log the weather, temperature (°F), and visible crew count for this site photo as STRICT JSON.';

export type ConditionsWeather = 'sunny' | 'cloudy' | 'rain' | 'storm';

export interface DetectedConditions {
  weather: ConditionsWeather;
  temperatureF: number | null;
  crewCount: number;
  confidence: number;
}

const WEATHERS: ConditionsWeather[] = ['sunny', 'cloudy', 'rain', 'storm'];

/** Parse Claude's reply into DetectedConditions, or null if unusable. Trims
 *  anything outside the outermost braces so a stray fence/prose won't break
 *  JSON.parse, then clamps each field defensively. */
export function parseConditions(text: string): DetectedConditions | null {
  try {
    const cleaned = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    // deno-lint-ignore no-explicit-any
    const j: any = JSON.parse(cleaned);
    if (!WEATHERS.includes(j.weather)) return null;
    const tempRaw = j.temperatureF;
    const temperatureF =
      tempRaw == null || !Number.isFinite(Number(tempRaw)) ? null : Math.round(Number(tempRaw));
    const crewCount = Number.isFinite(Number(j.crewCount)) ? Math.max(0, Math.round(Number(j.crewCount))) : 0;
    const confRaw = Number(j.confidence);
    const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0;
    return { weather: j.weather, temperatureF, crewCount, confidence };
  } catch {
    return null;
  }
}
