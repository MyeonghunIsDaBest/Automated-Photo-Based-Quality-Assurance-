// Typed CRUD helpers for `service_jobs`, `service_job_photos`, and
// `service_job_time_entries` (Service Jobs domain).
//
// Conventions mirror maintenanceRequests.ts exactly:
//   - snake_case Row interfaces match the Supabase schema (migration 63).
//   - camelCase domain interfaces used by the rest of the app.
//   - All write functions throw on error.
//   - Read functions return [] / null when Supabase is not configured so the
//     UI can render empty states gracefully.

import { supabase, supabaseConfigured } from '../supabase';
import { downscaleImageForUpload } from '../images/downscaleImage';
import { getPhotoUrl } from './photos';

// ---------------------------------------------------------------------------
// Literal union types
// ---------------------------------------------------------------------------

export type ServiceJobStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'done'        // shown as "Completed" on the board
  | 'invoiced'    // migration 76
  | 'paid'        // migration 76
  | 'archived'    // migration 76 — leaves the active board, kept in the archived view
  | 'cancelled';

export type ServiceJobPhotoKind = 'before' | 'after' | 'other';

// ---------------------------------------------------------------------------
// Rows (snake_case — matches Supabase schema, migration 63)
// ---------------------------------------------------------------------------

interface ServiceJobRow {
  id: string;
  title: string;
  description: string | null;
  external_ref: string | null;
  job_number: string | null;
  client_name: string | null;
  client_phone: string | null;
  address: string | null;
  customer_id: string | null;
  property_id: string | null;
  /** 'service' | 'project' (mig 93); absent pre-migration. */
  kind?: string | null;
  status: ServiceJobStatus;
  scheduled_for: string | null;
  assigned_to: string | null;
  materials: string | null;
  notes: string | null;
  contract_value: number | null;
  materials_cost: number | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ServiceJobPhotoRow {
  id: string;
  job_id: string;
  kind: ServiceJobPhotoKind;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

interface ServiceJobTimeEntryRow {
  id: string;
  job_id: string;
  user_id: string;
  date: string;
  hours: number;
  note: string | null;
  /** Added by migration 73 — text null, matches labour_rates.role by name. */
  role: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Domain types (camelCase — used by the rest of the app)
// ---------------------------------------------------------------------------

/** Work register a job belongs to (mirrors the quote registers, mig 93). */
export type ServiceJobKind = 'service' | 'project';

export interface ServiceJob {
  id: string;
  title: string;
  description: string | null;
  externalRef: string | null;
  /** Human-friendly in-app job number (continues the Sim-Pro sequence). Imported
   *  jobs use externalRef instead — see displayJobNumber(). */
  jobNumber: string | null;
  clientName: string | null;
  clientPhone: string | null;
  address: string | null;
  customerId: string | null;
  propertyId: string | null;
  /** service | project — inherited from the originating quote at conversion. */
  kind: ServiceJobKind;
  status: ServiceJobStatus;
  scheduledFor: string | null;
  assignedTo: string | null;
  materials: string | null;
  notes: string | null;
  contractValue: number | null;
  materialsCost: number | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ServiceJobPhoto {
  id: string;
  jobId: string;
  kind: ServiceJobPhotoKind;
  storagePath: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface ServiceJobTimeEntry {
  id: string;
  jobId: string;
  userId: string;
  date: string;
  hours: number;
  note: string | null;
  /** Role name matching labour_rates.role (migration 73). Null = uncosted. */
  role: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToServiceJob(r: ServiceJobRow): ServiceJob {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    externalRef: r.external_ref,
    jobNumber: r.job_number,
    clientName: r.client_name,
    clientPhone: r.client_phone,
    address: r.address,
    customerId: r.customer_id,
    propertyId: r.property_id,
    kind: (r.kind as ServiceJobKind) ?? 'service',
    status: r.status,
    scheduledFor: r.scheduled_for,
    assignedTo: r.assigned_to,
    materials: r.materials,
    notes: r.notes,
    contractValue: r.contract_value === null || r.contract_value === undefined ? null : Number(r.contract_value),
    materialsCost: r.materials_cost === null || r.materials_cost === undefined ? null : Number(r.materials_cost),
    createdBy: r.created_by,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

function rowToServiceJobPhoto(r: ServiceJobPhotoRow): ServiceJobPhoto {
  return {
    id: r.id,
    jobId: r.job_id,
    kind: r.kind,
    storagePath: r.storage_path,
    uploadedBy: r.uploaded_by,
    createdAt: r.created_at,
  };
}

function rowToServiceJobTimeEntry(r: ServiceJobTimeEntryRow): ServiceJobTimeEntry {
  return {
    id: r.id,
    jobId: r.job_id,
    userId: r.user_id,
    date: r.date,
    hours: Number(r.hours),
    note: r.note,
    role: r.role ?? null,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Error sentinel
// ---------------------------------------------------------------------------

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

// ---------------------------------------------------------------------------
// Job read helpers
// ---------------------------------------------------------------------------

/** All service jobs, newest first. Optional status filter. */
export async function listServiceJobs(filters?: {
  status?: ServiceJobStatus;
}): Promise<ServiceJob[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('service_jobs').select('*');
  if (filters?.status) {
    q = q.eq('status', filters.status);
  }
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToServiceJob(r as ServiceJobRow));
}

/** A customer's own service / promoted Sim-Pro jobs, newest first — for the
 *  customer portal so they can raise an issue against a specific job. Migration
 *  74 RLS scopes service_jobs SELECT to the caller's customer_id, so this only
 *  ever returns the signed-in customer's jobs. [] when not configured / no id. */
export async function listServiceJobsForCustomer(customerId: string): Promise<ServiceJob[]> {
  if (!supabaseConfigured() || !customerId) return [];
  const { data, error } = await supabase
    .from('service_jobs')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToServiceJob(r as ServiceJobRow));
}

/** Single service job by id, or null if not found. */
export async function getServiceJob(id: string): Promise<ServiceJob | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('service_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToServiceJob(data as ServiceJobRow) : null;
}

// ---------------------------------------------------------------------------
// Job write helpers
// ---------------------------------------------------------------------------

export interface CreateServiceJobInput {
  title: string;
  description?: string;
  clientName?: string;
  clientPhone?: string;
  address?: string;
  customerId?: string;
  propertyId?: string;
  assignedTo?: string;
  /** DATE string 'YYYY-MM-DD'. If provided, status is set to 'scheduled'. */
  scheduledFor?: string;
  /** service | project. Only sent when 'project' (pre-mig-93-safe default). */
  kind?: ServiceJobKind;
}

/** Create a service job. Status defaults to 'pending' (DB default) unless
 *  scheduledFor is provided, in which case status is set to 'scheduled'. */
export async function createServiceJob(input: CreateServiceJobInput): Promise<ServiceJob> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  // Assign the next continuous job number (mig 76). Best-effort: if the RPC is
  // unavailable (e.g. migration not applied yet) we still create the job with a
  // null number rather than blocking job creation.
  let jobNumber: string | null = null;
  try {
    const { data: numData, error: numError } = await supabase.rpc('next_job_number');
    if (!numError && numData != null) jobNumber = String(numData);
  } catch { /* leave null */ }
  const insert: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
    client_name: input.clientName ?? null,
    client_phone: input.clientPhone ?? null,
    address: input.address ?? null,
    customer_id: input.customerId ?? null,
    property_id: input.propertyId ?? null,
    assigned_to: input.assignedTo ?? null,
    job_number: jobNumber,
    created_by: uid,
  };
  // 'service' is the DB default — only send the column for project jobs, so
  // ordinary job creation keeps working on databases without migration 93.
  if (input.kind === 'project') insert.kind = 'project';
  // Only send status / scheduled_for when scheduling upfront; otherwise let
  // the DB default ('pending') apply so we don't override a future migration
  // that might change the default.
  if (input.scheduledFor) {
    insert.scheduled_for = input.scheduledFor;
    insert.status = 'scheduled' as ServiceJobStatus;
  }
  let { data, error } = await supabase
    .from('service_jobs')
    .insert(insert)
    .select('*')
    .single();
  // Pre-mig-93 fallback: if the DB doesn't have the kind column yet, retry once
  // without it so converting a project quote still creates the job (the mig-93
  // backfill promotes it to 'project' from the quote link when applied).
  if (error && 'kind' in insert && (error.code === 'PGRST204' || /'kind' column/i.test(error.message ?? ''))) {
    delete insert.kind;
    ({ data, error } = await supabase.from('service_jobs').insert(insert).select('*').single());
  }
  if (error) throw error;
  return rowToServiceJob(data as ServiceJobRow);
}

export interface UpdateServiceJobInput {
  title?: string;
  description?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  address?: string | null;
  customerId?: string | null;
  propertyId?: string | null;
  materials?: string | null;
  notes?: string | null;
  assignedTo?: string | null;
}

/** Update mutable fields of a service job. Only provided keys are patched
 *  (undefined = untouched; null = explicitly cleared). */
export async function updateServiceJob(
  id: string,
  patch: UpdateServiceJobInput,
): Promise<ServiceJob> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('service_jobs')
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.clientName !== undefined && { client_name: patch.clientName }),
      ...(patch.clientPhone !== undefined && { client_phone: patch.clientPhone }),
      ...(patch.address !== undefined && { address: patch.address }),
      ...(patch.customerId !== undefined && { customer_id: patch.customerId }),
      ...(patch.propertyId !== undefined && { property_id: patch.propertyId }),
      ...(patch.materials !== undefined && { materials: patch.materials }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.assignedTo !== undefined && { assigned_to: patch.assignedTo }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToServiceJob(data as ServiceJobRow);
}

/** Statuses at/after completion — the job is finished and stays finished as it
 *  moves Completed → Invoiced → Paid → Archived. */
const TERMINAL_STATUSES: ServiceJobStatus[] = ['done', 'invoiced', 'paid', 'archived'];

/** Update only the status column, managing completed_at across the lifecycle:
 *  stamp it when first completing ('done'), preserve it through invoiced/paid/
 *  archived, and clear it when re-opening (pending/scheduled/in_progress/cancelled). */
export async function updateServiceJobStatus(
  id: string,
  status: ServiceJobStatus,
): Promise<ServiceJob> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const statusPatch: Record<string, unknown> = { status };
  if (status === 'done') {
    // Stamp completion timestamp when first marking complete
    statusPatch.completed_at = new Date().toISOString();
  } else if (TERMINAL_STATUSES.includes(status)) {
    // invoiced / paid / archived — preserve the existing completed_at (omit it)
  } else {
    // Re-opened (pending/scheduled/in_progress) or cancelled — clear it
    statusPatch.completed_at = null;
  }
  const { data, error } = await supabase
    .from('service_jobs')
    .update(statusPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToServiceJob(data as ServiceJobRow);
}

/** Set a scheduled date and flip status to 'scheduled'. Clears completed_at
 *  in case the job is being re-scheduled after completion. */
export async function scheduleServiceJob(
  id: string,
  /** DATE string 'YYYY-MM-DD' */
  date: string,
): Promise<ServiceJob> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('service_jobs')
    .update({
      scheduled_for: date,
      status: 'scheduled' as ServiceJobStatus,
      completed_at: null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToServiceJob(data as ServiceJobRow);
}

/** Clear the schedule: drop scheduled_for and return status to 'pending'.
 *  Used when a job is dragged back to the Schedule board's unscheduled pool. */
export async function unscheduleServiceJob(id: string): Promise<ServiceJob> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('service_jobs')
    .update({ scheduled_for: null, status: 'pending' as ServiceJobStatus })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToServiceJob(data as ServiceJobRow);
}

/** Permanently delete a service job (cascades to photos + time entries via FK). */
export async function deleteServiceJob(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('service_jobs').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Photo helpers
// ---------------------------------------------------------------------------

const PHOTOS_BUCKET = 'photos';

/** Upload a photo for a service job, store in the photos bucket under the
 *  `service/{jobId}/` prefix, and insert a row in service_job_photos. */
export async function uploadServiceJobPhoto(
  jobId: string,
  file: File,
  kind: ServiceJobPhotoKind,
): Promise<ServiceJobPhoto> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { file: optimized } = await downscaleImageForUpload(file);
  const ext = (optimized.name.includes('.') ? optimized.name.split('.').pop()! : 'jpg').toLowerCase();
  const storagePath = `service/${jobId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(PHOTOS_BUCKET).upload(storagePath, optimized, {
    contentType: optimized.type || 'application/octet-stream',
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from('service_job_photos')
    .insert({ job_id: jobId, kind, storage_path: storagePath, uploaded_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return rowToServiceJobPhoto(data as ServiceJobPhotoRow);
}

/** List all photos for a service job with signed URLs, oldest first. */
export async function listServiceJobPhotos(
  jobId: string,
): Promise<(ServiceJobPhoto & { url: string | null })[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('service_job_photos')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((r) => rowToServiceJobPhoto(r as ServiceJobPhotoRow));
  return Promise.all(rows.map(async (p) => ({ ...p, url: await getPhotoUrl(p.storagePath) })));
}

/** Delete a single photo row.
 *  NOTE: storage object cleanup is out of scope for v1 — the blob remains in
 *  the bucket until a background purge job is added (future migration). */
export async function deleteServiceJobPhoto(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('service_job_photos').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Time entry helpers
// ---------------------------------------------------------------------------

export interface AddTimeEntryInput {
  userId: string;
  /** DATE string 'YYYY-MM-DD' */
  date: string;
  hours: number;
  note?: string;
  /** Labour role name matching labour_rates.role (migration 73). Null = uncosted. */
  role?: string | null;
}

/** Add a time entry to a service job. hours must be > 0. */
export async function addTimeEntry(
  jobId: string,
  input: AddTimeEntryInput,
): Promise<ServiceJobTimeEntry> {
  if (input.hours <= 0) throw new Error('hours must be > 0');
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('service_job_time_entries')
    .insert({
      job_id: jobId,
      user_id: input.userId,
      date: input.date,
      hours: input.hours,
      note: input.note ?? null,
      role: input.role ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToServiceJobTimeEntry(data as ServiceJobTimeEntryRow);
}

/** List all time entries for a service job, ordered by date ascending. */
export async function listTimeEntries(jobId: string): Promise<ServiceJobTimeEntry[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('service_job_time_entries')
    .select('*')
    .eq('job_id', jobId)
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToServiceJobTimeEntry(r as ServiceJobTimeEntryRow));
}

/** Delete a single time entry row. */
export async function deleteTimeEntry(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('service_job_time_entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Sum hours across all time entries, rounded to 2 decimal places. */
export function totalHours(entries: ServiceJobTimeEntry[]): number {
  const sum = entries.reduce((acc, e) => acc + e.hours, 0);
  return Math.round(sum * 100) / 100;
}

/** The number to display for a job: imported jobs keep their original Sim-Pro
 *  number (external_ref); in-app jobs use their continued job_number. Returns
 *  null when neither is set (legacy jobs created before mig 76). */
export function displayJobNumber(job: { externalRef: string | null; jobNumber: string | null }): string | null {
  return job.externalRef ?? job.jobNumber ?? null;
}

// ---------------------------------------------------------------------------
// Financial setters (PP1 — manager-gated by RLS)
// ---------------------------------------------------------------------------

/**
 * Set (or clear) the contract value on a service job.
 * Pass null to explicitly clear the field.
 */
export async function setContractValue(id: string, value: number | null): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('service_jobs')
    .update({ contract_value: value })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Set (or clear) the manual materials cost on a service job.
 * Pass null to explicitly clear the field (means "not entered").
 */
export async function setMaterialsCost(id: string, value: number | null): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('service_jobs')
    .update({ materials_cost: value })
    .eq('id', id);
  if (error) throw error;
}
