// Typed CRUD helpers for the `projects` table.
//
// All functions throw on error — the caller (e.g. a TanStack Query mutation
// or a component effect) is responsible for catching and surfacing it.
//
// Falls back gracefully when Supabase isn't configured: every read returns
// `[]` / `null` and every write throws a clear error so the UI can keep
// running on the local Zustand store during the demo.

import { supabase, supabaseConfigured } from '../supabase';

export interface ProjectRow {
  id: string;
  name: string;
  client_name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: 'active' | 'on_hold' | 'completed' | 'archived';
  budget: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  client: string;
  description?: string;
  startDate: string;
  endDate: string;
  status?: ProjectRow['status'];
  budget?: number;
  /** Built-in construction phases to KEEP at creation; the others are dropped.
   *  Omit / undefined ⇒ keep all 8 (backward compatible). */
  phases?: string[];
  /** Names of extra custom phases to add at creation (dates default to the
   *  project window, editable later in the Gantt). */
  customPhases?: string[];
  milestones?: Array<{
    name: string;
    phase?: string;
    startDate: string;
    endDate: string;
  }>;
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

export async function listProjects(): Promise<ProjectRow[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectRow[];
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ProjectRow) ?? null;
}

// Creates a project + initial tasks atomically via the SQL RPC defined in
// `0001_init.sql`. Returns the new project id.
export async function createProjectWithTasks(input: CreateProjectInput): Promise<string> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase.rpc('create_project_with_tasks', {
    p_name: input.name,
    p_client: input.client,
    p_description: input.description ?? null,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_status: input.status ?? 'active',
    p_budget: input.budget ?? null,
    p_milestones: input.milestones ?? [],
    p_phases: input.phases ?? null,
    p_custom_phases:
      input.customPhases && input.customPhases.length > 0
        ? input.customPhases.map((name) => ({ name }))
        : null,
  });
  if (error) throw error;
  return data as string;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<ProjectRow, 'name' | 'client_name' | 'description' | 'start_date' | 'end_date' | 'status' | 'budget'>>,
): Promise<ProjectRow> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('projects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ProjectRow;
}

export async function deleteProject(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
