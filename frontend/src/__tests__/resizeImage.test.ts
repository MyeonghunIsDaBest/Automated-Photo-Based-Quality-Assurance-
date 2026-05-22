import { describe, it, expect } from 'vitest';

// Pure decision logic lives in resizeImage.logic.ts so vitest doesn't
// have to resolve imagescript's `https://deno.land/x/...` import. The
// full resizeForVision wrapper is smoke-tested in deployment.
import { decideTargetSize } from '../../../backend/supabase/functions/_shared/resizeImage.logic';

describe('decideTargetSize', () => {
  it('skips when the long edge is already at the 1568 cap', () => {
    // Exactly at the cap → no resize. Saves one decode/encode pass per
    // pre-shrunk thumbnail.
    expect(decideTargetSize(1568, 1100)).toEqual({ skip: true });
  });

  it('skips when both edges are below the cap', () => {
    expect(decideTargetSize(800, 600)).toEqual({ skip: true });
  });

  it('scales a 4032×3024 phone photo to ≤1568 on the long edge, preserving aspect', () => {
    // The canonical iPhone 4:3 portrait — 4032×3024. Scaling to 1568 on
    // the long edge yields 1568×1176 (4:3 preserved within 1px rounding).
    const out = decideTargetSize(4032, 3024);
    expect(out.skip).toBe(false);
    expect(out.targetWidth).toBe(1568);
    expect(out.targetHeight).toBe(1176);
  });

  it('handles landscape orientation symmetrically', () => {
    // 3024×4032 (portrait) → the longer edge is the height; result is
    // 1176×1568, preserving the 3:4 ratio.
    const out = decideTargetSize(3024, 4032);
    expect(out.skip).toBe(false);
    expect(out.targetWidth).toBe(1176);
    expect(out.targetHeight).toBe(1568);
  });

  it('passes through zero / negative dimensions unchanged (defensive)', () => {
    expect(decideTargetSize(0, 1000)).toEqual({ skip: true });
    expect(decideTargetSize(-1, 1000)).toEqual({ skip: true });
  });

  it('preserves aspect ratio on an extreme aspect (panorama)', () => {
    // 6000×1000 panorama — only the width should be capped, height scales
    // proportionally to ~261. The vision target is on the long edge so
    // the short edge ends up well below the cap; that's fine.
    const out = decideTargetSize(6000, 1000);
    expect(out.skip).toBe(false);
    expect(out.targetWidth).toBe(1568);
    // 1000 × (1568/6000) = 261.33 → rounds to 261
    expect(out.targetHeight).toBe(261);
  });
});
