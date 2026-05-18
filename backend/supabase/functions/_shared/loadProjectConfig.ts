// Per-project config loader for the Edge Functions.
//
// Reads the `project_config` row introduced in migration 09 and returns the
// fields the photo-QA pipeline cares about. The row is guaranteed to exist
// by the `trg_create_project_config` trigger on `projects` (and the migration
// backfill for pre-existing projects), but a missing row must not 500 the
// caller — falls back to the constants in `_shared/thresholds.ts`, which
// mirror today's hardcoded behaviour.
//
// Caching: 60s in-memory TTL keyed by projectId. The Edge runtime is
// short-lived so cache hits are largely intra-request; the cache exists more
// to absorb bursts (a re-analyse flow that touches the same project several
// times in a few seconds) than to amortise DB load.

// @ts-expect-error Deno-only import.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import {
  CONFIDENCE_AUTO_UPDATE,
  CONFIDENCE_REVIEW_QUEUE,
  PHASH_DUPLICATE_THRESHOLD,
} from './thresholds.ts';

export interface ThresholdConfig {
  autoUpdate: number;          // ≥ this → 'auto_updated'
  reviewQueue: number;         // ≥ this → 'pending' (review queue)
  manualFloorAllowed: boolean; // manager override permitted by confirm-analysis
  defaultModel: string;        // analyze-photo default when body.model is null
  phashThreshold: number;      // ≤ this hamming distance → near-duplicate
}

const FALLBACK: ThresholdConfig = {
  autoUpdate: CONFIDENCE_AUTO_UPDATE,
  reviewQueue: CONFIDENCE_REVIEW_QUEUE,
  manualFloorAllowed: true,
  defaultModel: 'mvp-stub@v0',
  phashThreshold: PHASH_DUPLICATE_THRESHOLD,
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: ThresholdConfig; expiresAt: number }>();

export async function loadProjectConfig(
  sb: SupabaseClient,
  projectId: string,
): Promise<ThresholdConfig> {
  const now = Date.now();
  const hit = cache.get(projectId);
  if (hit && hit.expiresAt > now) return hit.value;

  const { data, error } = await sb
    .from('project_config')
    .select(
      'ai_auto_update_threshold, ai_review_queue_threshold, ai_default_model, manual_floor_allowed, phash_threshold',
    )
    .eq('project_id', projectId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.warn(`[loadProjectConfig] ${projectId}: ${error.message} — using fallback`);
    }
    return FALLBACK;
  }

  // Supabase returns `numeric` columns as strings; coerce explicitly so
  // downstream comparisons against AnalysisResult.confidence are numeric.
  const value: ThresholdConfig = {
    autoUpdate: Number(data.ai_auto_update_threshold),
    reviewQueue: Number(data.ai_review_queue_threshold),
    manualFloorAllowed: Boolean(data.manual_floor_allowed),
    defaultModel: String(data.ai_default_model),
    phashThreshold: Number(data.phash_threshold),
  };

  cache.set(projectId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

// Test seam — lets unit tests (when they land in Day 2+) reset the cache
// between cases so they don't bleed into each other.
export function _clearProjectConfigCache(): void {
  cache.clear();
}
