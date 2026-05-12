// Typed read/write helpers for the `project_config` table (migration 09).
//
// Mirror the shape of `lib/api/projects.ts`: snake_case row interface for the
// raw Supabase payload, a camelCase domain interface in `~/types`, and a
// rowToConfig() mapper that lives next to the row type so they stay paired.
//
// All write functions throw on error; the caller (e.g. ProjectConfigTab's
// save handler) catches and surfaces. Falls back to in-memory defaults when
// Supabase isn't configured so the mock-data demo still renders the admin UI.

import { supabase, supabaseConfigured } from '../supabase';
import type { ProjectConfig } from '../../types';

export interface ProjectConfigRow {
  project_id: string;
  ai_auto_update_threshold: number | string;
  ai_review_queue_threshold: number | string;
  ai_default_model: string;
  progression_mode: 'manual' | 'human_assisted' | 'full_auto';
  weight_checklist: number;
  weight_photos: number;
  weight_ai: number;
  target_photos_per_task: number;
  manual_floor_allowed: boolean;
  phash_threshold: number;
  accent_color: string | null;
  logo_storage_path: string | null;
  report_cadence: 'none' | 'weekly' | 'monthly';
  updated_by: string | null;
  updated_at: string;
}

export const DEFAULT_PROJECT_CONFIG: Omit<
  ProjectConfig,
  'projectId' | 'updatedAt' | 'updatedBy'
> = {
  aiAutoUpdateThreshold: 0.85,
  aiReviewQueueThreshold: 0.5,
  aiDefaultModel: 'mvp-stub@v0',
  progressionMode: 'human_assisted',
  weightChecklist: 40,
  weightPhotos: 25,
  weightAi: 35,
  targetPhotosPerTask: 3,
  manualFloorAllowed: true,
  phashThreshold: 6,
  accentColor: null,
  logoStoragePath: null,
  reportCadence: 'none',
};

function rowToConfig(row: ProjectConfigRow): ProjectConfig {
  return {
    projectId: row.project_id,
    // `numeric(4,3)` columns come back as strings from supabase-js; coerce
    // explicitly so consumers can compare against confidence numbers.
    aiAutoUpdateThreshold: Number(row.ai_auto_update_threshold),
    aiReviewQueueThreshold: Number(row.ai_review_queue_threshold),
    aiDefaultModel: row.ai_default_model,
    progressionMode: row.progression_mode,
    weightChecklist: row.weight_checklist,
    weightPhotos: row.weight_photos,
    weightAi: row.weight_ai,
    targetPhotosPerTask: row.target_photos_per_task,
    manualFloorAllowed: row.manual_floor_allowed,
    phashThreshold: row.phash_threshold,
    accentColor: row.accent_color,
    logoStoragePath: row.logo_storage_path,
    reportCadence: row.report_cadence,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function defaultsFor(projectId: string): ProjectConfig {
  return {
    ...DEFAULT_PROJECT_CONFIG,
    projectId,
    updatedBy: null,
    updatedAt: new Date(0).toISOString(),
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

export async function getProjectConfig(projectId: string): Promise<ProjectConfig> {
  if (!supabaseConfigured()) return defaultsFor(projectId);

  const { data, error } = await supabase
    .from('project_config')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw error;
  // Trigger + backfill in migration 09 mean a row should always exist.
  // Defensive fallback: hand back defaults so the UI can still render.
  if (!data) return defaultsFor(projectId);
  return rowToConfig(data as ProjectConfigRow);
}

// A patch covers any subset of the editable columns. `updated_by` is stamped
// server-side from `auth.uid()` in the WITH CHECK clause; we set it here too
// so the client-side optimistic state matches.
export interface ProjectConfigPatch {
  aiAutoUpdateThreshold?: number;
  aiReviewQueueThreshold?: number;
  aiDefaultModel?: string;
  progressionMode?: 'manual' | 'human_assisted' | 'full_auto';
  weightChecklist?: number;
  weightPhotos?: number;
  weightAi?: number;
  targetPhotosPerTask?: number;
  manualFloorAllowed?: boolean;
  phashThreshold?: number;
  accentColor?: string | null;
  logoStoragePath?: string | null;
  reportCadence?: 'none' | 'weekly' | 'monthly';
}

export async function updateProjectConfig(
  projectId: string,
  patch: ProjectConfigPatch,
): Promise<ProjectConfig> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error('not authenticated');

  // Build the snake_case patch. Only include keys the caller actually set —
  // avoids accidentally clearing a column the admin didn't touch.
  const update: Record<string, unknown> = { updated_by: userData.user.id };
  if (patch.aiAutoUpdateThreshold !== undefined) update.ai_auto_update_threshold = patch.aiAutoUpdateThreshold;
  if (patch.aiReviewQueueThreshold !== undefined) update.ai_review_queue_threshold = patch.aiReviewQueueThreshold;
  if (patch.aiDefaultModel !== undefined) update.ai_default_model = patch.aiDefaultModel;
  if (patch.progressionMode !== undefined) update.progression_mode = patch.progressionMode;
  if (patch.weightChecklist !== undefined) update.weight_checklist = patch.weightChecklist;
  if (patch.weightPhotos !== undefined) update.weight_photos = patch.weightPhotos;
  if (patch.weightAi !== undefined) update.weight_ai = patch.weightAi;
  if (patch.targetPhotosPerTask !== undefined) update.target_photos_per_task = patch.targetPhotosPerTask;
  if (patch.manualFloorAllowed !== undefined) update.manual_floor_allowed = patch.manualFloorAllowed;
  if (patch.phashThreshold !== undefined) update.phash_threshold = patch.phashThreshold;
  if (patch.accentColor !== undefined) update.accent_color = patch.accentColor;
  if (patch.logoStoragePath !== undefined) update.logo_storage_path = patch.logoStoragePath;
  if (patch.reportCadence !== undefined) update.report_cadence = patch.reportCadence;

  const { data, error } = await supabase
    .from('project_config')
    .update(update)
    .eq('project_id', projectId)
    .select('*')
    .single();

  if (error) throw error;
  return rowToConfig(data as ProjectConfigRow);
}
