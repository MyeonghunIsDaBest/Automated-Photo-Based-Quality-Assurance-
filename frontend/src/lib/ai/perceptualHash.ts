// Perceptual hash for photo dedup. Uses blockhash-core's bmvbhash with bits=8
// → 64-bit hash → 16 hex chars. The SQL helper `phash_distance(a, b)` in
// `02_phase_c_seam.sql` assumes exactly that shape (`length(a) = 16`,
// `bit(64)` XOR), so don't change `BITS` without updating the migration.

import { bmvbhash } from 'blockhash-core';

const BITS = 8;

// Returns null when the file isn't a still image, decoding fails, or no 2D
// canvas context is available. Callers should treat null as "no dedup
// possible" — that's the safe fallback.
export async function computePerceptualHash(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;

  // HEIC isn't natively decodable in browsers and would silently 0×0 the
  // canvas. Skip — server-side hashing in Phase D can pick it up.
  if (/heic|heif/i.test(file.type)) return null;

  let url: string | null = null;
  try {
    url = URL.createObjectURL(file);
    const img = await loadImage(url);
    if (img.naturalWidth === 0 || img.naturalHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hash = bmvbhash(data, BITS);
    return typeof hash === 'string' && hash.length === BITS * BITS / 4 ? hash : null;
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// Hamming distance between two 16-char hex strings. Mirrors the SQL helper —
// keep symmetry with the Postgres function so the client-side prefilter and
// any server-side check converge.
export function phashDistance(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  let dist = 0;
  for (let i = 0; i < 16; i++) {
    const xa = parseInt(a[i], 16);
    const xb = parseInt(b[i], 16);
    if (Number.isNaN(xa) || Number.isNaN(xb)) return 64;
    let xor = xa ^ xb;
    while (xor) {
      dist += xor & 1;
      xor >>>= 1;
    }
  }
  return dist;
}
