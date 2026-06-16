// Typed CRUD helpers for `maintenance_requests` and
// `maintenance_request_photos` (Maintenance domain).
//
// All write functions throw on error. Read functions return [] / null when
// Supabase is not configured so the UI can render empty states gracefully.
// Exception: listRequestPhotos returns [] (not throwing) when not configured,
// consistent with the approved plan code.

import { supabase, supabaseConfigured } from '../supabase';
import { downscaleImageForUpload } from '../images/downscaleImage';
import { getPhotoUrl } from './photos';

// ---------------------------------------------------------------------------
// Literal union types
// ---------------------------------------------------------------------------

export type MaintenanceRequestStatus =
  | 'new'
  | 'acknowledged'
  | 'scheduled'
  | 'completed'
  | 'cancelled';

export type MaintenanceRequestSource = 'portal' | 'internal' | 'email';

// ---------------------------------------------------------------------------
// Rows (snake_case — matches Supabase schema)
// ---------------------------------------------------------------------------

interface MaintenanceRequestRow {
  id: string;
  property_id: string;
  title: string;
  description: string | null;
  urgency: number;
  status: MaintenanceRequestStatus;
  source: MaintenanceRequestSource;
  reported_by: string | null;
  assigned_to: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  created_at: string;
  email_message_id: string | null;
  // Nested joins (PostgREST — present only when requested via select)
  properties?: {
    name: string;
    customer_id: string;
    customers?: { name: string } | null;
  } | null;
}

interface MaintenanceRequestPhotoRow {
  id: string;
  request_id: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Domain types (camelCase — used by the rest of the app)
// ---------------------------------------------------------------------------

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  title: string;
  description: string | null;
  urgency: number;
  status: MaintenanceRequestStatus;
  source: MaintenanceRequestSource;
  reportedBy: string | null;
  assignedTo: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  createdAt: string;
  emailMessageId: string | null;
}

/** Extended view used by list functions that join property + customer names. */
export interface MaintenanceRequestWithContext extends MaintenanceRequest {
  propertyName: string | null;
  customerId: string | null;
  customerName: string | null;
}

export interface MaintenanceRequestPhoto {
  id: string;
  requestId: string;
  storagePath: string;
  uploadedBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToRequest(r: MaintenanceRequestRow): MaintenanceRequest {
  return {
    id: r.id,
    propertyId: r.property_id,
    title: r.title,
    description: r.description,
    urgency: r.urgency,
    status: r.status,
    source: r.source,
    reportedBy: r.reported_by,
    assignedTo: r.assigned_to,
    scheduledFor: r.scheduled_for,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    emailMessageId: r.email_message_id,
  };
}

function rowToRequestWithContext(r: MaintenanceRequestRow): MaintenanceRequestWithContext {
  const base = rowToRequest(r);
  const prop = r.properties ?? null;
  return {
    ...base,
    propertyName: prop?.name ?? null,
    customerId: prop?.customer_id ?? null,
    // customers join is a to-one — PostgREST returns object or null, never array
    customerName: prop?.customers?.name ?? null,
  };
}

function rowToRequestPhoto(r: MaintenanceRequestPhotoRow): MaintenanceRequestPhoto {
  return {
    id: r.id,
    requestId: r.request_id,
    storagePath: r.storage_path,
    uploadedBy: r.uploaded_by,
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
// Read helpers
// ---------------------------------------------------------------------------

/** All requests whose property belongs to the given customer, newest first. */
export async function listRequestsForCustomer(
  customerId: string,
): Promise<MaintenanceRequestWithContext[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*, properties!inner(name, customer_id, customers(name))')
    .eq('properties.customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToRequestWithContext(r as MaintenanceRequestRow));
}

/** All requests for a single property, newest first. */
export async function listRequestsForProperty(
  propertyId: string,
): Promise<MaintenanceRequest[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToRequest(r as MaintenanceRequestRow));
}

/** Internal queue — supports optional customer or status filters.
 *  Ordered by urgency desc (most urgent first), then created_at asc
 *  (oldest within same urgency first). */
export async function listAllRequests(filters?: {
  customerId?: string;
  status?: MaintenanceRequestStatus;
}): Promise<MaintenanceRequestWithContext[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase
    .from('maintenance_requests')
    .select('*, properties!inner(name, customer_id, customers(name))');

  if (filters?.customerId) {
    q = q.eq('properties.customer_id', filters.customerId);
  }
  if (filters?.status) {
    q = q.eq('status', filters.status);
  }

  const { data, error } = await q
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToRequestWithContext(r as MaintenanceRequestRow));
}

/** Single request with property + customer context. */
export async function getRequest(
  id: string,
): Promise<MaintenanceRequestWithContext | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*, properties(name, customer_id, customers(name))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToRequestWithContext(data as MaintenanceRequestRow) : null;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export interface CreateRequestInput {
  propertyId: string;
  title: string;
  description?: string;
  /** 1 (low) – 5 (critical). Clamped + rounded to integer on insert. */
  urgency: number;
  source: 'portal' | 'internal';
  assignedTo?: string;
  /** DATE string 'YYYY-MM-DD' — passed through untouched. */
  scheduledFor?: string;
}

export async function createRequest(input: CreateRequestInput): Promise<MaintenanceRequest> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  // Clamp urgency to [1,5] integer as required by the CHECK constraint
  const urgency = Math.min(5, Math.max(1, Math.round(input.urgency)));
  const { data, error } = await supabase
    .from('maintenance_requests')
    .insert({
      property_id: input.propertyId,
      title: input.title,
      description: input.description ?? null,
      urgency,
      source: input.source,
      // Both portal and internal sources track who submitted the request
      reported_by: uid,
      assigned_to: input.assignedTo ?? null,
      scheduled_for: input.scheduledFor ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToRequest(data as MaintenanceRequestRow);
}

/** Update only the status column (and completed_at when relevant). */
export async function updateRequestStatus(
  id: string,
  status: MaintenanceRequestStatus,
): Promise<MaintenanceRequest> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const patch: Record<string, unknown> = { status };
  if (status === 'completed') {
    patch.completed_at = new Date().toISOString();
  } else {
    // Moving out of completed clears the timestamp
    patch.completed_at = null;
  }
  const { data, error } = await supabase
    .from('maintenance_requests')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRequest(data as MaintenanceRequestRow);
}

/** Assign (or unassign) a request to a profile. */
export async function assignRequest(
  id: string,
  profileId: string | null,
): Promise<MaintenanceRequest> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('maintenance_requests')
    .update({ assigned_to: profileId })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRequest(data as MaintenanceRequestRow);
}

/** Set a scheduled date and flip status to 'scheduled'. */
export async function scheduleRequest(
  id: string,
  /** DATE string 'YYYY-MM-DD' — passed through untouched. */
  date: string,
): Promise<MaintenanceRequest> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('maintenance_requests')
    // Clear completed_at in case a completed request is being re-opened by
    // re-scheduling — keeps completed_at consistent with updateRequestStatus.
    .update({ scheduled_for: date, status: 'scheduled' as MaintenanceRequestStatus, completed_at: null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRequest(data as MaintenanceRequestRow);
}

/** Mark a request as completed (sets status + completed_at timestamp). */
export async function completeRequest(id: string): Promise<MaintenanceRequest> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('maintenance_requests')
    .update({
      status: 'completed' as MaintenanceRequestStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToRequest(data as MaintenanceRequestRow);
}

// ---------------------------------------------------------------------------
// Photo helpers
// ---------------------------------------------------------------------------

const PHOTOS_BUCKET = 'photos';

export async function uploadRequestPhoto(
  requestId: string,
  file: File,
): Promise<MaintenanceRequestPhoto> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { file: optimized } = await downscaleImageForUpload(file);
  const ext = (optimized.name.includes('.') ? optimized.name.split('.').pop()! : 'jpg').toLowerCase();
  const storagePath = `maintenance/${requestId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(PHOTOS_BUCKET).upload(storagePath, optimized, {
    contentType: optimized.type || 'application/octet-stream',
    upsert: false,
  });
  if (up.error) throw up.error;
  const { data, error } = await supabase
    .from('maintenance_request_photos')
    .insert({ request_id: requestId, storage_path: storagePath, uploaded_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return rowToRequestPhoto(data as MaintenanceRequestPhotoRow);
}

export async function listRequestPhotos(
  requestId: string,
): Promise<(MaintenanceRequestPhoto & { url: string | null })[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('maintenance_request_photos')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((r) => rowToRequestPhoto(r as MaintenanceRequestPhotoRow));
  return Promise.all(rows.map(async (p) => ({ ...p, url: await getPhotoUrl(p.storagePath) })));
}
