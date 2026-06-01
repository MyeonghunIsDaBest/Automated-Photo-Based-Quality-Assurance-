// Typed CRUD + realtime for the `incident_reports` table (roadmap P1.7) — the
// formal WHS incident register (injury / near-miss reports). Full-swap domain:
// the Safety page owns this data, no Zustand mirror.
//
// DISTINCT from lib/api/safetyIncidents.ts, which fronts the AI photo-hazard
// `safety_incidents` table (flags/severity flagged by analyze-photo). This
// module is the human-authored incident report with the full WHS field set.
//
// Returns the existing `IncidentReport` domain type from pages/safety/types so
// the page's IncidentRow renderer needs no changes.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { IncidentReport, IncidentStatus } from '../../pages/safety/types';

export interface IncidentReportRow {
  id: string;
  project_id: string;
  org_id: string | null;
  type: IncidentReport['type'];
  occurred_at: string;
  location: string;
  description: string;
  severity: IncidentReport['severity'];
  person_involved: string | null;
  body_part: string | null;
  treatment_given: string | null;
  contributing_factors: string | null;
  recommended_action: string | null;
  witnesses: string | null;
  photo_names: string[];
  reported_by: string;
  reported_at: string;
  status: IncidentStatus;
  created_at: string;
}

export function mapIncidentReportRow(r: IncidentReportRow): IncidentReport {
  return {
    id: r.id,
    type: r.type,
    occurredAt: r.occurred_at,
    location: r.location,
    description: r.description,
    severity: r.severity,
    personInvolved: r.person_involved ?? undefined,
    bodyPart: r.body_part ?? undefined,
    treatmentGiven: r.treatment_given ?? undefined,
    contributingFactors: r.contributing_factors ?? undefined,
    recommendedAction: r.recommended_action ?? undefined,
    witnesses: r.witnesses ?? undefined,
    photoNames: Array.isArray(r.photo_names) ? r.photo_names : undefined,
    reportedBy: r.reported_by,
    reportedAt: r.reported_at,
    status: r.status,
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

/** All incident reports for a project, most-recent occurrence first. Empty in
 *  mock mode or for a non-UUID (demo) project id. */
export async function listIncidentReports(projectId: string): Promise<IncidentReport[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('incident_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapIncidentReportRow(r as IncidentReportRow));
}

/** A new report is the IncidentReport shape minus the generated id. */
export type NewIncidentReport = Omit<IncidentReport, 'id'>;

/** Insert an incident report; returns the persisted row (with its id). */
export async function createIncidentReport(
  projectId: string,
  i: NewIncidentReport,
): Promise<IncidentReport> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('incident_reports')
    .insert({
      project_id: projectId,
      type: i.type,
      occurred_at: i.occurredAt,
      location: i.location,
      description: i.description,
      severity: i.severity,
      person_involved: i.personInvolved ?? null,
      body_part: i.bodyPart ?? null,
      treatment_given: i.treatmentGiven ?? null,
      contributing_factors: i.contributingFactors ?? null,
      recommended_action: i.recommendedAction ?? null,
      witnesses: i.witnesses ?? null,
      photo_names: i.photoNames ?? [],
      reported_by: i.reportedBy,
      reported_at: i.reportedAt,
      status: i.status,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapIncidentReportRow(data as IncidentReportRow);
}

/** Update an incident report's investigation status. Returns the updated row. */
export async function setIncidentReportStatus(
  id: string,
  status: IncidentStatus,
): Promise<IncidentReport> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('incident_reports')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapIncidentReportRow(data as IncidentReportRow);
}

export async function deleteIncidentReport(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('incident_reports').delete().eq('id', id);
  if (error) throw error;
}

/** Subscribe to incident inserts/updates/deletes for a project. Returns an
 *  unsubscribe fn for useEffect cleanup. No-op in mock mode. */
export function subscribeToProjectIncidentReports(
  projectId: string,
  handlers: {
    onUpsert: (i: IncidentReport) => void;
    onDelete: (id: string) => void;
  },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`incident_reports:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'incident_reports', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapIncidentReportRow(payload.new as IncidentReportRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'incident_reports', filter: `project_id=eq.${projectId}` },
      (payload) => handlers.onUpsert(mapIncidentReportRow(payload.new as IncidentReportRow)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'incident_reports', filter: `project_id=eq.${projectId}` },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
