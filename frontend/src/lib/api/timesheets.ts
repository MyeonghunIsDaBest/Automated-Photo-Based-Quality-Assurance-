// Typed CRUD + realtime for the `timesheets` table (roadmap P5.1). Full-swap.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, isUuid } from '../supabase';
import type { DiaryEntry } from '../../pages/gantt/types';

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface Timesheet {
  id: string;
  projectId: string;
  workerName: string;
  workDate: string;
  hours: number;
  notes?: string;
  status: TimesheetStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  /** Clock-in / clock-out (migration 41). An open shift = timeIn set, timeOut
   *  null → the Time-clock view shows a live running timer. */
  timeIn?: string;
  timeOut?: string;
}

export interface TimesheetRow {
  id: string;
  project_id: string;
  org_id: string | null;
  worker_name: string;
  work_date: string;
  hours: number;
  notes: string | null;
  status: TimesheetStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  time_in: string | null;
  time_out: string | null;
}

export function mapTimesheetRow(r: TimesheetRow): Timesheet {
  return {
    id: r.id,
    projectId: r.project_id,
    workerName: r.worker_name,
    workDate: r.work_date,
    hours: Number(r.hours),
    notes: r.notes ?? undefined,
    status: r.status,
    approvedBy: r.approved_by ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    timeIn: r.time_in ?? undefined,
    timeOut: r.time_out ?? undefined,
  };
}

const NOT_CONFIGURED = new Error('Supabase is not configured.');

export async function listTimesheets(projectId: string): Promise<Timesheet[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  const { data, error } = await supabase
    .from('timesheets')
    .select('*')
    .eq('project_id', projectId)
    .order('work_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapTimesheetRow(r as TimesheetRow));
}

export interface NewTimesheet {
  workerName: string;
  workDate: string;
  hours: number;
  notes?: string;
  createdBy?: string;
}

export async function createTimesheet(projectId: string, t: NewTimesheet): Promise<Timesheet> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('timesheets')
    .insert({
      project_id: projectId,
      worker_name: t.workerName,
      work_date: t.workDate,
      hours: t.hours,
      notes: t.notes ?? null,
      status: 'submitted',
      created_by: t.createdBy ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapTimesheetRow(data as TimesheetRow);
}

export interface TimesheetPatch {
  hours?: number;
  notes?: string;
  status?: TimesheetStatus;
  approvedBy?: string | null;
}

export async function updateTimesheet(id: string, patch: TimesheetPatch): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.hours !== undefined) row.hours = patch.hours;
  if (patch.notes !== undefined) row.notes = patch.notes ?? null;
  if (patch.status !== undefined) {
    row.status = patch.status;
    if (patch.status === 'approved') {
      row.approved_by = patch.approvedBy ?? null;
      row.approved_at = new Date().toISOString();
    } else {
      // Any non-approved transition clears the approval stamp.
      row.approved_at = null;
      row.approved_by = null;
    }
  }
  const { error } = await supabase.from('timesheets').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteTimesheet(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('timesheets').delete().eq('id', id);
  if (error) throw error;
}

// ─── Time clock (migration 41) ───────────────────────────────────────────────

/** Clock a worker in for today — opens a shift (time_in now, time_out null,
 *  status 'draft', hours 0). Returns the open-shift row. The unique partial
 *  index blocks a second open shift for the same worker/day. */
export async function clockIn(projectId: string, workerName: string, createdBy?: string): Promise<Timesheet> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('timesheets')
    .insert({
      project_id: projectId,
      worker_name: workerName,
      work_date: new Date().toISOString().slice(0, 10),
      hours: 0,
      status: 'draft',
      time_in: new Date().toISOString(),
      created_by: createdBy ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapTimesheetRow(data as TimesheetRow);
}

/** Clock a worker out — stamps time_out, derives hours from the elapsed shift
 *  (2dp), and moves the entry to 'submitted' for manager approval. An optional
 *  `notes` captures what the worker did during the shift (set when provided so
 *  a blank doesn't wipe an activity already saved live during the shift). */
export async function clockOut(id: string, timeInIso: string, notes?: string): Promise<Timesheet> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const now = new Date();
  // 4-dp precision so short shifts (even seconds) survive in the data, not 0.
  const hours = Math.max(0, Math.round(((now.getTime() - new Date(timeInIso).getTime()) / 3_600_000) * 10000) / 10000);
  const patch: Record<string, unknown> = {
    time_out: now.toISOString(),
    hours,
    status: 'submitted',
    updated_at: now.toISOString(),
  };
  if (notes !== undefined) patch.notes = notes || null;
  const { data, error } = await supabase
    .from('timesheets')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapTimesheetRow(data as TimesheetRow);
}

// ─── Diary → timesheets bridge (migration 42) ────────────────────────────────

/** Gap-fill a diary entry's personnel into timesheets. For each person with
 *  hours > 0, create a timesheet ONLY if that worker has no sheet for the
 *  entry's date yet — so a manual / clocked / approved row is never overwritten
 *  and nothing is duplicated. The go-forward twin of migration 42's one-time
 *  backfill, so re-saving an entry is idempotent (the workers already synced are
 *  now "taken" and skipped). Best-effort: a failure is logged, never thrown, so
 *  it can't block the diary save. No-op in mock mode / for a demo (non-uuid)
 *  project. */
export async function syncDiaryPersonnelToTimesheets(entry: DiaryEntry): Promise<void> {
  if (!supabaseConfigured() || !isUuid(entry.projectId)) return;
  const people = (entry.personnel ?? []).filter((p) => p.workerName?.trim() && p.hours > 0);
  if (people.length === 0) return;
  try {
    // Workers who already have a sheet that day — gap-fill skips them.
    const { data, error } = await supabase
      .from('timesheets')
      .select('worker_name')
      .eq('project_id', entry.projectId)
      .eq('work_date', entry.date);
    if (error) throw error;
    const taken = new Set((data ?? []).map((r) => (r as { worker_name: string }).worker_name));

    const rows = people
      .filter((p) => !taken.has(p.workerName))
      // collapse same-named people within the one entry (first wins)
      .filter((p, i, arr) => arr.findIndex((q) => q.workerName === p.workerName) === i)
      .map((p) => ({
        project_id: entry.projectId,
        worker_name: p.workerName,
        work_date: entry.date,
        hours: Math.min(24, Math.max(0, p.hours)),
        notes: [p.role, p.company].filter(Boolean).join(' · ') || null,
        status: 'submitted' as const,
        created_by: entry.createdBy ?? null,
        source_diary_entry_id: entry.id,
      }));
    if (rows.length === 0) return;

    const { error: insErr } = await supabase.from('timesheets').insert(rows);
    if (insErr) throw insErr;
  } catch (e) {
    console.warn(
      '[timesheets] diary→timesheet sync failed (diary entry still saved):',
      e instanceof Error ? e.message : e,
    );
  }
}

export function subscribeToProjectTimesheets(
  projectId: string,
  handlers: { onInsert: (t: Timesheet) => void; onUpdate: (t: Timesheet) => void; onDelete: (id: string) => void },
): () => void {
  if (!supabaseConfigured() || !isUuid(projectId)) return () => void 0;
  const channel: RealtimeChannel = supabase
    .channel(`timesheets:${projectId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'timesheets', filter: `project_id=eq.${projectId}` },
      (p) => handlers.onInsert(mapTimesheetRow(p.new as TimesheetRow)))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'timesheets', filter: `project_id=eq.${projectId}` },
      (p) => handlers.onUpdate(mapTimesheetRow(p.new as TimesheetRow)))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'timesheets', filter: `project_id=eq.${projectId}` },
      (p) => { const old = p.old as { id?: string }; if (old?.id) handlers.onDelete(old.id); })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
