// ─────────────────────────────────────────────────────────────────────────────
// lib/api/quoteSchedule.ts — resources scheduled to a quote (migration 85).
//
// The quote "Schedule" tab plans WHO works the job: an employee (profile)
// scheduled with hours + an optional date/start/finish, costed at a labour role's
// rate. Internal planning view — it does NOT feed the quote total (the Billable
// → Labour lines remain the costed source).
//
// House conventions mirror commercial.ts / quoteScripts.ts: snake_case Row +
// camelCase domain + rowToX mappers; writes throw; reads return [] when Supabase
// is not configured.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';

const NOT_CONFIGURED = new Error('Supabase is not configured.');

export type ScheduleResourceType = 'employee' | 'contractor' | 'plant';

interface ScheduleResourceRow {
  id: string;
  quote_id: string;
  resource_type: string;
  profile_id: string | null;
  resource_label: string | null;
  role: string | null;
  hours: number;
  scheduled_date: string | null;
  start_time: string | null;
  finish_time: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleResource {
  id: string;
  quoteId: string;
  resourceType: ScheduleResourceType;
  profileId: string | null;
  resourceLabel: string | null;
  role: string | null;
  hours: number;
  scheduledDate: string | null;
  startTime: string | null;
  finishTime: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToScheduleResource(r: ScheduleResourceRow): ScheduleResource {
  return {
    id: r.id,
    quoteId: r.quote_id,
    resourceType: (r.resource_type as ScheduleResourceType) ?? 'employee',
    profileId: r.profile_id,
    resourceLabel: r.resource_label,
    role: r.role,
    hours: Number(r.hours),
    scheduledDate: r.scheduled_date,
    startTime: r.start_time,
    finishTime: r.finish_time,
    sortOrder: r.sort_order,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listScheduleResources(quoteId: string): Promise<ScheduleResource[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('quote_schedule_resources')
    .select('*')
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToScheduleResource(r as ScheduleResourceRow));
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface AddScheduleResourceInput {
  quoteId: string;
  resourceType?: ScheduleResourceType;
  profileId?: string | null;
  resourceLabel?: string | null;
  role?: string | null;
  hours?: number;
  scheduledDate?: string | null;
  startTime?: string | null;
  finishTime?: string | null;
  sortOrder?: number;
}

export async function addScheduleResource(input: AddScheduleResourceInput): Promise<ScheduleResource> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('quote_schedule_resources')
    .insert({
      quote_id: input.quoteId,
      resource_type: input.resourceType ?? 'employee',
      profile_id: input.profileId ?? null,
      resource_label: input.resourceLabel ?? null,
      role: input.role ?? null,
      hours: input.hours ?? 0,
      scheduled_date: input.scheduledDate ?? null,
      start_time: input.startTime ?? null,
      finish_time: input.finishTime ?? null,
      sort_order: input.sortOrder ?? 0,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToScheduleResource(data as ScheduleResourceRow);
}

export interface UpdateScheduleResourceInput {
  role?: string | null;
  hours?: number;
  scheduledDate?: string | null;
  startTime?: string | null;
  finishTime?: string | null;
  sortOrder?: number;
}

export async function updateScheduleResource(
  id: string,
  patch: UpdateScheduleResourceInput,
): Promise<ScheduleResource> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.hours !== undefined) update.hours = patch.hours;
  if (patch.scheduledDate !== undefined) update.scheduled_date = patch.scheduledDate;
  if (patch.startTime !== undefined) update.start_time = patch.startTime;
  if (patch.finishTime !== undefined) update.finish_time = patch.finishTime;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase
    .from('quote_schedule_resources')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToScheduleResource(data as ScheduleResourceRow);
}

export async function removeScheduleResource(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_schedule_resources').delete().eq('id', id);
  if (error) throw error;
}
