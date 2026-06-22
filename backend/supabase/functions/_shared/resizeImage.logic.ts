// Pure decision logic split out of resizeImage.ts so vitest (no http-import
// resolver) can test it without pulling the Deno-only imagescript WASM
// import. The runtime wrapper `resizeForVision` lives in resizeImage.ts
// and re-exports this file's symbols for convenience.

/** Anthropic's "vision tokens are billed at full resolution up to this
 *  cap" threshold on Haiku 4.5 + Sonnet 4.6. Larger images get
 *  downsampled server-side anyway, but the pre-rescale bytes still
 *  travel over the wire — pay for cap-sized images on the client side. */
export const MAX_LONG_EDGE = 1568;

export interface ResizeDecision {
  /** True when the source image already fits inside MAX_LONG_EDGE on its
   *  longer side. Caller should pass the bytes through unchanged. */
  skip: boolean;
  /** Target dimensions when `skip` is false. Aspect ratio preserved. */
  targetWidth?: number;
  targetHeight?: number;
}

/** Pure: decide whether to resize and what dimensions to target.
 *
 *  Math: `scale = MAX_LONG_EDGE / max(w, h)`. Apply to both axes and
 *  round to integer pixels. Aspect ratio drifts by at most 1px on the
 *  short edge — imperceptible for vision QA. */
export function decideTargetSize(width: number, height: number): ResizeDecision {
  if (width <= 0 || height <= 0) {
    return { skip: true };           // defensive: garbage in → pass through
  }
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_LONG_EDGE) {
    return { skip: true };
  }
  const scale = MAX_LONG_EDGE / longEdge;
  return {
    skip: false,
    targetWidth:  Math.round(width  * scale),
    targetHeight: Math.round(height * scale),
  };
}
