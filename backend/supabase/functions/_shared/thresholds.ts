// Product-policy thresholds for the Photo-QA seam. NOT environment variables —
// these are part of the user-visible behaviour ("AI auto-updates when ≥ 85%
// confident") and changing them is a versioned product decision.

export const CONFIDENCE_AUTO_UPDATE = 0.85;
export const CONFIDENCE_REVIEW_QUEUE = 0.5;

// Hash distance ≤ this is treated as a near-duplicate. 0..64 (lower = closer).
// 6 corresponds to ~10% bit difference, conservative enough to catch the same
// wall photographed seconds apart but loose enough that a slightly different
// angle still flags. Tune via the Phase C verification dataset.
export const PHASH_DUPLICATE_THRESHOLD = 6;
