// safety_incidents API. Reads + manager-only mutations against the table
// added in `02_phase_c_seam.sql`. AI-detected incidents (with
// ai_analysis_id) are inserted server-side by the analyze-photo Edge
// Function; manual incidents flow through `createManualIncident()` here.

import { supabase, supabaseConfigured } from '../supabase';
import type { SafetyFlag, SafetySeverity } from '../../types';

export type SafetyIncidentStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface SafetyIncidentRow {
  id: string;
  project_id: string;
  photo_id: string | null;
  ai_analysis_id: string | null;
  flags: SafetyFlag[];
  severity: SafetySeverity;
  status: SafetyIncidentStatus;
  reported_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface SafetyIncident {
  id: string;
  projectId: string;
  photoId: string | null;
  aiAnalysisId: string | null;
  flags: SafetyFlag[];
  severity: SafetySeverity;
  status: SafetyIncidentStatus;
  reportedBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  notes: string | null;
  createdAt: string;
}

const NOT_CONFIGURED = new Error('Supabase is not configured.');

function rowToIncident(row: SafetyIncidentRow): SafetyIncident {
  return {
    id:           row.id,
    projectId:    row.project_id,
    photoId:      row.photo_id,
    aiAnalysisId: row.ai_analysis_id,
    flags:        row.flags ?? [],
    severity:     row.severity,
    status:       row.status,
    reportedBy:   row.reported_by,
    resolvedBy:   row.resolved_by,
    resolvedAt:   row.resolved_at,
    notes:        row.notes,
    createdAt:    row.created_at,
  };
}

export async function listSafetyIncidents(projectId: string): Promise<SafetyIncident[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('safety_incidents')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToIncident(r as SafetyIncidentRow));
}

export interface ManualIncidentInput {
  projectId: string;
  flags: SafetyFlag[];
  severity: SafetySeverity;
  notes?: string;
  photoId?: string | null;
}

// Manual hazard log — RLS requires reported_by = auth.uid() and
// ai_analysis_id IS NULL. Manager+ tier; the Safety page button is gated by
// `canLogSafetyIncident` (Phase A).
export async function createManualIncident(input: ManualIncidentInput): Promise<SafetyIncident> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('safety_incidents')
    .insert({
      project_id:     input.projectId,
      photo_id:       input.photoId ?? null,
      ai_analysis_id: null,
      flags:          input.flags,
      severity:       input.severity,
      status:         'open',
      reported_by:    user.id,
      notes:          input.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToIncident(data as SafetyIncidentRow);
}

// Status transitions. RLS requires manager+ for UPDATE.
export async function acknowledgeIncident(id: string, notes?: string): Promise<SafetyIncident> {
  return updateStatus(id, 'acknowledged', notes);
}

export async function resolveIncident(id: string, notes?: string): Promise<SafetyIncident> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('safety_incidents')
    .update({
      status:      'resolved',
      resolved_by: user?.id ?? null,
      resolved_at: new Date().toISOString(),
      ...(notes !== undefined ? { notes } : {}),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToIncident(data as SafetyIncidentRow);
}

export async function dismissIncident(id: string, notes?: string): Promise<SafetyIncident> {
  return updateStatus(id, 'dismissed', notes);
}

async function updateStatus(id: string, status: SafetyIncidentStatus, notes?: string): Promise<SafetyIncident> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('safety_incidents')
    .update({ status, ...(notes !== undefined ? { notes } : {}) })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToIncident(data as SafetyIncidentRow);
}
