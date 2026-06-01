// Typed read helpers for the `project_reports` table (migration 10).
//
// The Edge Function `generate-reports` is the canonical writer; the frontend
// is read-only. Mirrors the row shape into the existing `Report` interface
// in `~/types` so the Reports page can render scheduled and ad-hoc reports
// with the same component.

import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { Report } from '../../types';

export interface ProjectReportRow {
  id: string;
  project_id: string;
  report_type: 'daily' | 'weekly' | 'monthly';
  generated_at: string;
  date_from: string;
  date_to: string;
  storage_path: string | null;
  summary: {
    photosUploaded?: number;
    tasksUpdated?: number;
    overallProgress?: number;
    progressChange?: number;
    safetyFlags?: number;
  };
  status: 'queued' | 'ready' | 'failed';
  generation_run_id: string | null;
  failure_reason: string | null;
}

function rowToReport(row: ProjectReportRow): Report {
  return {
    id: row.id,
    projectId: row.project_id,
    reportType: row.report_type,
    generatedBy: 'system',
    generatedAt: row.generated_at,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    storageUrl: row.storage_path ?? undefined,
    summary: {
      photosUploaded:  row.summary.photosUploaded ?? 0,
      tasksUpdated:    row.summary.tasksUpdated ?? 0,
      overallProgress: row.summary.overallProgress ?? 0,
      progressChange:  row.summary.progressChange ?? 0,
      safetyFlags:     row.summary.safetyFlags ?? 0,
    },
  };
}

export async function listProjectReports(projectId: string, limit = 12): Promise<Report[]> {
  if (!supabaseConfigured()) return [];
  if (!isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('project_reports')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'ready')
    .order('generated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ProjectReportRow[]).map(rowToReport);
}

const NOT_CONFIGURED = new Error('Supabase is not configured.');

// On-demand report generation. Invokes the `generate-reports` Edge Function in
// its single-project mode — it aggregates real photos/tasks/safety_incidents
// for a rolling window, computes the period-over-period progress delta, and
// upserts the `project_reports` row (a same-day re-generate refreshes it).
// Returns the persisted report so the caller can show it immediately.
export async function generateReportNow(
  projectId: string,
  reportType: Report['reportType'],
): Promise<Report> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  if (!isUuid(projectId)) throw new Error('Reports require a live project.');
  const { data, error } = await supabase.functions.invoke('generate-reports', {
    body: { projectId, reportType },
  });
  if (error) throw error;
  const row = (data as { report?: ProjectReportRow } | null)?.report;
  if (!row) throw new Error('Report generation returned no data.');
  return rowToReport(row);
}
