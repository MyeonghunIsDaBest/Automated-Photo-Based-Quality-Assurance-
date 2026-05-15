// Typed CRUD helpers for the `tasks` table.
// See `projects.ts` for the same conventions (throw on error, no-op on
// missing env, snake_case row shape).

import { supabase, supabaseConfigured } from '../supabase';
import { differenceInDays, parseISO } from 'date-fns';
import type { Task, ConstructionPhase, TaskStatus } from '../../types';

export interface TaskRow {
  id: string;
  project_id: string;
  zone_id: string | null;
  assignee_id: string | null;
  parent_task_id: string | null;
  name: string;
  phase: ConstructionPhase;
  start_date: string;
  end_date: string;
  percent_complete: number;
  status: TaskStatus;
  dependencies: string[];
  photo_count: number;
  notes: string[] | null;
  update_source: 'manual' | 'ai_auto' | 'supervisor';
  created_by: string | null;
  created_at: string;
  last_updated: string;
  // Migration 12 — optional in the type so pre-12 fetches still parse;
  // mapTaskRow defaults to false.
  is_phase_anchor?: boolean | null;
}

// Translate a snake_case DB row into the camelCase frontend `Task` shape.
// Centralized here so every read path (queries + realtime payloads) stays
// consistent.
export function mapTaskRow(row: TaskRow): Task {
  const duration =
    Math.max(0, differenceInDays(parseISO(row.end_date), parseISO(row.start_date))) + 1;
  return {
    id: row.id,
    projectId: row.project_id,
    zoneId: row.zone_id ?? undefined,
    assigneeId: row.assignee_id ?? undefined,
    parentTaskId: row.parent_task_id ?? undefined,
    name: row.name,
    phase: row.phase,
    startDate: row.start_date,
    endDate: row.end_date,
    durationDays: duration,
    percentComplete: row.percent_complete,
    status: row.status,
    dependencies: row.dependencies ?? [],
    photoCount: row.photo_count,
    lastUpdated: row.last_updated,
    updateSource: row.update_source,
    notes: row.notes ?? [],
    isPhaseAnchor: Boolean(row.is_phase_anchor),
  };
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

export async function listTasks(projectId?: string): Promise<TaskRow[]> {
  if (!supabaseConfigured()) return [];
  const q = supabase.from('tasks').select('*').order('start_date');
  const { data, error } = projectId ? await q.eq('project_id', projectId) : await q;
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

export async function createTask(
  task: Omit<TaskRow, 'id' | 'created_at' | 'last_updated' | 'photo_count' | 'dependencies' | 'created_by'> & {
    dependencies?: string[];
  },
): Promise<TaskRow> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...task,
      dependencies: task.dependencies ?? [],
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as TaskRow;
}

export async function updateTaskProgress(id: string, percentComplete: number): Promise<TaskRow> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const status =
    percentComplete >= 100 ? 'complete'
    : percentComplete > 0    ? 'in_progress'
    :                          'not_started';

  const { data, error } = await supabase
    .from('tasks')
    .update({
      percent_complete: percentComplete,
      status,
      last_updated: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as TaskRow;
}

export async function updateTask(id: string, patch: Partial<TaskRow>): Promise<TaskRow> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...patch, last_updated: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as TaskRow;
}

export async function deleteTask(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}
