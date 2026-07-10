// ─────────────────────────────────────────────────────────────────────────────
// lib/recentMaterials.ts — tiny MRU list of materials recently added to any
// quote, so the pickers can surface "you'll probably want these again" first.
// localStorage only (per browser/user), capped at 8, no migration required.
// Storage failures (private mode, blocked) degrade to a no-op.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'casone.recentMaterials';
const MAX = 8;

export function getRecentMaterialIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentMaterial(id: string): void {
  try {
    const next = [id, ...getRecentMaterialIds().filter((x) => x !== id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage blocked — fine */ }
}
