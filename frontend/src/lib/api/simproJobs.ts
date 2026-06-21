// ─────────────────────────────────────────────────────────────────────────────
// lib/api/simproJobs.ts — typed helpers for the `simpro_jobs` staging table
// (migration 70) and the "Confirm import" promote into projects / service_jobs.
//
// Conventions mirror lib/api/materials.ts + serviceJobs.ts:
//   - snake_case Row interfaces match the Supabase schema.
//   - camelCase domain interface (StagedJob) used by the UI.
//   - Writes throw on error; reads return [] when Supabase isn't configured.
//
// Pure parse/plan logic lives in lib/jobs/simproCsv.ts (TDD-tested). This file
// is the network plumbing only.
//
// ⚠️ PROVISIONAL (finalised with a real Simpro export): the stage→status maps
// and the project-promote shape below. Until then "Confirm import" defaults to
// promoting jobs as service_jobs (resolveJobType → 'service' for anything not
// explicitly 'project').
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';
import {
  SIMPRO_STAGES,
  type SimproStage,
  type SimproJobType,
  type ImportPlan,
  type SimproJobRow,
  type ExistingStagedRef,
} from '../jobs/simproCsv';
import { scheduleFromDue, scheduleFromStart, toISODate } from '../jobs/scheduleWeek';

/** Default schedule for a job: a 3-day bar ENDING on the due date when present,
 *  else STARTING on `fallbackIso` (the import/created date) so every job arrives
 *  pre-booked for the owner to adjust. */
function defaultSchedule(dueIso: string | null | undefined, fallbackIso: string): { start: string; end: string } {
  return dueIso ? scheduleFromDue(dueIso) : scheduleFromStart(fallbackIso);
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

// ---------------------------------------------------------------------------
// Row + domain types
// ---------------------------------------------------------------------------

interface SimproJobDbRow {
  id: string;
  external_ref: string;
  description: string | null;
  customer_name: string | null;
  telephone: string | null;
  email: string | null;
  site_name: string | null;
  site_address: string | null;
  suburb: string | null;
  category: string | null;
  job_type: SimproJobType | null;
  due_date: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  stage: SimproStage;
  contract_value: number | null;
  raw: Record<string, unknown> | null;
  import_batch_id: string | null;
  imported_at: string;
  imported_by: string | null;
  promoted_at: string | null;
  promoted_to_type: SimproJobType | null;
  promoted_to_id: string | null;
}

export interface StagedJob {
  id: string;
  externalRef: string;
  description: string | null;
  customerName: string | null;
  telephone: string | null;
  email: string | null;
  siteName: string | null;
  siteAddress: string | null;
  suburb: string | null;
  category: string | null;
  jobType: SimproJobType | null;
  dueDate: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  stage: SimproStage;
  contractValue: number | null;
  importBatchId: string | null;
  importedAt: string;
  promotedAt: string | null;
  promotedToType: SimproJobType | null;
  promotedToId: string | null;
}

function rowToStaged(r: SimproJobDbRow): StagedJob {
  return {
    id: r.id,
    externalRef: r.external_ref,
    description: r.description,
    customerName: r.customer_name,
    telephone: r.telephone,
    email: r.email,
    siteName: r.site_name,
    siteAddress: r.site_address,
    suburb: r.suburb,
    category: r.category,
    jobType: r.job_type,
    dueDate: r.due_date,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
    stage: r.stage,
    contractValue: r.contract_value === null ? null : Number(r.contract_value),
    importBatchId: r.import_batch_id,
    importedAt: r.imported_at,
    promotedAt: r.promoted_at,
    promotedToType: r.promoted_to_type,
    promotedToId: r.promoted_to_id,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Strip PostgREST .or() structural chars, then escape ILIKE specials. */
function escapeIlike(raw: string): string {
  return raw
    .replace(/[*,()]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export async function listSimproJobs(filters?: {
  stage?: SimproStage;
  search?: string;
  /** Cap rows fetched. A stage can hold 1,000+ imported jobs; the browse table
   *  windows to this so it never renders a "long receipt". Per-stage totals come
   *  from stageCounts(), so the count stays accurate even when the list is capped. */
  limit?: number;
}): Promise<StagedJob[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('simpro_jobs').select('*');
  if (filters?.stage) q = q.eq('stage', filters.stage);
  if (filters?.search && filters.search.trim() !== '') {
    const pattern = '%' + escapeIlike(filters.search.trim()) + '%';
    q = q.or(
      'external_ref.ilike.' +
        pattern +
        ',description.ilike.' +
        pattern +
        ',customer_name.ilike.' +
        pattern,
    );
  }
  q = q.order('imported_at', { ascending: false });
  if (filters?.limit && filters.limit > 0) q = q.limit(filters.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => rowToStaged(r as SimproJobDbRow));
}

/** Lightweight existing-ref list for planSimproImport (id + ref + promoted). */
export async function listStagedRefs(): Promise<ExistingStagedRef[]> {
  if (!supabaseConfigured()) return [];
  // Paginate past PostgREST's 1000-row select cap so re-import dedupe sees ALL
  // existing refs (a 1,376-row table would otherwise miss the last 376).
  const out: ExistingStagedRef[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('simpro_jobs')
      .select('external_ref, promoted_at')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      out.push({
        externalRef: (r as { external_ref: string }).external_ref,
        promoted: (r as { promoted_at: string | null }).promoted_at !== null,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Per-stage counts + total, for the hero card. */
export async function stageCounts(): Promise<{
  counts: Record<SimproStage, number>;
  total: number;
}> {
  const counts: Record<SimproStage, number> = {
    in_progress: 0,
    pending: 0,
    complete: 0,
    invoiced: 0,
    archived: 0,
  };
  if (!supabaseConfigured()) return { counts, total: 0 };
  // Per-stage exact head counts. A single `select('stage')` is capped at
  // PostgREST's default 1000 rows, which undercounts a 1,376-row table (Pending
  // read 0). head:true transfers no rows and the count is exact + uncapped.
  await Promise.all(
    SIMPRO_STAGES.map(async (stage) => {
      const { count, error } = await supabase
        .from('simpro_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('stage', stage);
      if (error) throw error;
      counts[stage] = count ?? 0;
    }),
  );
  const total = SIMPRO_STAGES.reduce((sum, s) => sum + counts[s], 0);
  return { counts, total };
}

// ---------------------------------------------------------------------------
// Import (persist staged rows)
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Run `worker` over `items` with at most `limit` in flight at once. Keeps large
 *  imports (1,000+ jobs) fast without firing thousands of requests at once.
 *  (JS is single-threaded, so the shared counters the workers touch are safe.) */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

/** Mutable staged fields shared by insert + update (everything except the
 *  external_ref match key, imported_by, and promotion state). */
function simproRowFields(row: SimproJobRow, batchId: string): Record<string, unknown> {
  return {
    description: row.description,
    customer_name: row.customerName,
    telephone: row.telephone,
    email: row.email,
    site_name: row.siteName,
    site_address: row.siteAddress,
    suburb: row.suburb,
    category: row.category,
    job_type: row.jobType,
    due_date: row.dueDate,
    stage: row.stage,
    contract_value: row.contractValue,
    raw: row.raw,
    import_batch_id: batchId,
  };
}

export interface CreateSimproJobInput {
  externalRef: string;
  description?: string | null;
  customerName?: string | null;
  telephone?: string | null;
  email?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  suburb?: string | null;
  category?: string | null;
  stage: SimproStage;
  dueDate?: string | null;
}

/** Manually add one job to the Sim-Pro Jobs list (not from a CSV import). Seeds
 *  a 3-day schedule bar from the due date when given. external_ref must be
 *  unique — a clash throws (the caller surfaces it). */
export async function createSimproJob(input: CreateSimproJobInput): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const payload: Record<string, unknown> = {
    external_ref: input.externalRef,
    description: input.description ?? null,
    customer_name: input.customerName ?? null,
    telephone: input.telephone ?? null,
    email: input.email ?? null,
    site_name: input.siteName ?? null,
    site_address: input.siteAddress ?? null,
    suburb: input.suburb ?? null,
    category: input.category ?? null,
    stage: input.stage,
    due_date: input.dueDate ?? null,
    imported_by: uid,
  };
  // Always seed a 3-day bar (due date if given, else today) so a new job is
  // pre-booked just like imported ones.
  const { start, end } = defaultSchedule(input.dueDate, toISODate(new Date()));
  payload.scheduled_start = start;
  payload.scheduled_end = end;
  const { error } = await supabase.from('simpro_jobs').insert(payload);
  if (error) throw error;
}

export interface UpdateSimproJobInput {
  externalRef?: string;
  description?: string | null;
  customerName?: string | null;
  telephone?: string | null;
  email?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  suburb?: string | null;
  category?: string | null;
  stage?: SimproStage;
  dueDate?: string | null;
}

/** Edit a staged Simpro job's fields and/or stage — for correcting bad imported
 *  data before confirming. Only keys present in the patch are written (undefined =
 *  untouched; null = explicitly cleared for nullable fields). external_ref is
 *  unique — a clash throws (the caller surfaces it). Does NOT touch the schedule
 *  bar (use scheduleSimproJob) or promotion state — editing the staging row does
 *  not retro-update an already-promoted live job. */
export async function updateSimproJob(id: string, patch: UpdateSimproJobInput): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.externalRef !== undefined) update.external_ref = patch.externalRef;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.customerName !== undefined) update.customer_name = patch.customerName;
  if (patch.telephone !== undefined) update.telephone = patch.telephone;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.siteName !== undefined) update.site_name = patch.siteName;
  if (patch.siteAddress !== undefined) update.site_address = patch.siteAddress;
  if (patch.suburb !== undefined) update.suburb = patch.suburb;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.stage !== undefined) update.stage = patch.stage;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from('simpro_jobs').update(update).eq('id', id);
  if (error) throw error;
}

/** Persist a planned import: inserts the adds, refreshes the updates (matched
 *  on external_ref — promotion state untouched). Failures accumulate per chunk. */
export async function importStagedJobs(plan: ImportPlan): Promise<{
  added: number;
  updated: number;
  skipped: number;
  failed: { count: number; firstError: string | null };
}> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const batchId = crypto.randomUUID();
  const today = toISODate(new Date());

  let added = 0;
  let updated = 0;
  let failCount = 0;
  let firstError: string | null = null;
  const recordFailure = (err: unknown) => {
    failCount += 1;
    if (firstError === null) firstError = err instanceof Error ? err.message : String(err);
  };

  // Inserts — 50-row chunks, up to 6 chunks in flight.
  await runPool(chunk(plan.adds, CHUNK_SIZE), 6, async (batch) => {
    const { error } = await supabase.from('simpro_jobs').insert(
      batch.map((row) => {
        const insert: Record<string, unknown> = {
          ...simproRowFields(row, batchId),
          external_ref: row.externalRef,
          imported_by: uid,
        };
        // Seed a 3-day bar so every imported job arrives pre-booked (due date
        // if present, else the import day) — the owner adjusts from there.
        const { start, end } = defaultSchedule(row.dueDate, today);
        insert.scheduled_start = start;
        insert.scheduled_end = end;
        return insert;
      }),
    );
    if (error) recordFailure(error);
    else added += batch.length;
  });

  // Updates — per-row (each matches one external_ref), up to 10 in flight.
  await runPool(plan.updates, 10, async (row) => {
    const { error } = await supabase
      .from('simpro_jobs')
      .update(simproRowFields(row, batchId))
      .eq('external_ref', row.externalRef);
    if (error) recordFailure(error);
    else updated += 1;
  });

  return {
    added,
    updated,
    skipped: plan.skips.length,
    failed: { count: failCount, firstError },
  };
}

// ---------------------------------------------------------------------------
// Confirm import (promote staged → projects / service_jobs)
// ---------------------------------------------------------------------------

// PROVISIONAL stage → live-status maps (finalised with the real export).
const SERVICE_STATUS: Record<SimproStage, string> = {
  in_progress: 'in_progress',
  pending: 'pending',
  complete: 'done',
  invoiced: 'done',
  archived: 'done',
};
const PROJECT_STATUS: Record<SimproStage, string> = {
  in_progress: 'active',
  pending: 'active',
  complete: 'completed',
  invoiced: 'completed',
  archived: 'archived',
};

function joinAddress(job: StagedJob): string | null {
  // Prefer the street "Site Address"; fall back to the site label. Append suburb.
  const street = job.siteAddress ?? job.siteName;
  const parts = [street, job.suburb].filter((p): p is string => !!p);
  return parts.length ? parts.join(', ') : null;
}

/** service_jobs row for a staged job (matched/idempotent on external_ref).
 *  scheduled_for prefers the timeline bar the owner actually set on the Sim-Pro
 *  tab (scheduled_start), falling back to the Simpro due date — so the board
 *  reflects the scheduling work instead of discarding it on promotion. */
function serviceJobPayload(job: StagedJob): Record<string, unknown> {
  return {
    title: job.description ?? `Simpro job ${job.externalRef}`,
    client_name: job.customerName,
    client_phone: job.telephone,
    address: joinAddress(job),
    external_ref: job.externalRef,
    contract_value: job.contractValue,
    scheduled_for: job.scheduledStart ?? job.dueDate,
    status: SERVICE_STATUS[job.stage],
  };
}

/** projects row for a staged job. Minimal shape — the richer phase/task scaffold
 *  (RPC) is part of CSV finalisation; for now an imported project gets defaults.
 *  Dates prefer the timeline bar (scheduled_start/end) the owner set, falling
 *  back to today / the due date. */
function projectPayload(job: StagedJob): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: job.description ?? `Simpro job ${job.externalRef}`,
    client_name: job.customerName ?? 'Unknown',
    start_date: job.scheduledStart ?? today,
    end_date: job.scheduledEnd ?? job.dueDate ?? today,
    status: PROJECT_STATUS[job.stage],
    external_ref: job.externalRef,
    contract_value: job.contractValue,
  };
}

/** All non-null external_ref values already in `table` (paginated past 1000). */
async function fetchExistingRefs(table: 'service_jobs' | 'projects'): Promise<Set<string>> {
  const refs = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('external_ref')
      .not('external_ref', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      const ref = (r as { external_ref: string | null }).external_ref;
      if (ref) refs.add(ref);
    }
    if (rows.length < PAGE) break;
  }
  return refs;
}

/** Promote every not-yet-promoted staged job into the live tables, routing by
 *  job_type (default 'service'). Idempotent: re-running only touches rows whose
 *  promoted_at is still null, and promote helpers upsert on external_ref. */
export async function confirmImport(): Promise<{
  projects: number;
  services: number;
  skipped: number;
  failed: { count: number; firstError: string | null };
}> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  // Paginate past the 1000-row cap so a >1000 backlog is fully promoted in one go.
  const pending: StagedJob[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('simpro_jobs')
      .select('*')
      .is('promoted_at', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) pending.push(rowToStaged(r as SimproJobDbRow));
    if (rows.length < PAGE) break;
  }

  let projects = 0;
  let services = 0;
  let failCount = 0;
  let firstError: string | null = null;
  const recordFailure = (err: unknown) => {
    failCount += 1;
    if (firstError === null) firstError = err instanceof Error ? err.message : String(err);
  };

  // Stamp staged rows promoted (chunked update keyed on external_ref). Only
  // called for rows whose live-table write already succeeded.
  const markPromoted = async (refs: string[], type: SimproJobType) => {
    const at = new Date().toISOString();
    for (const batch of chunk(refs, CHUNK_SIZE)) {
      const { error } = await supabase
        .from('simpro_jobs')
        .update({ promoted_at: at, promoted_to_type: type })
        .in('external_ref', batch);
      if (error) recordFailure(error);
    }
  };

  // Promote one target table in bulk: chunk-insert the new external_refs and
  // update the (rare) existing ones, stamping only what succeeds. This replaces
  // ~3 round-trips per job with a handful of chunked calls — a 1,376-job confirm
  // drops from minutes to seconds.
  const promoteTarget = async (
    table: 'service_jobs' | 'projects',
    type: SimproJobType,
    list: StagedJob[],
    payloadOf: (j: StagedJob) => Record<string, unknown>,
    onDone: (n: number) => void,
  ) => {
    if (list.length === 0) return;
    const existing = await fetchExistingRefs(table);
    const fresh = list.filter((j) => !existing.has(j.externalRef));
    const dupes = list.filter((j) => existing.has(j.externalRef));

    for (const batch of chunk(fresh, CHUNK_SIZE)) {
      const { error } = await supabase.from(table).insert(batch.map(payloadOf));
      if (error) {
        recordFailure(error);
        continue;
      }
      onDone(batch.length);
      await markPromoted(batch.map((j) => j.externalRef), type);
    }

    await runPool(dupes, 10, async (job) => {
      const { error } = await supabase
        .from(table)
        .update(payloadOf(job))
        .eq('external_ref', job.externalRef);
      if (error) {
        recordFailure(error);
        return;
      }
      onDone(1);
      await markPromoted([job.externalRef], type);
    });
  };

  await promoteTarget(
    'service_jobs',
    'service',
    pending.filter((j) => j.jobType !== 'project'),
    serviceJobPayload,
    (n) => {
      services += n;
    },
  );
  await promoteTarget(
    'projects',
    'project',
    pending.filter((j) => j.jobType === 'project'),
    projectPayload,
    (n) => {
      projects += n;
    },
  );

  return {
    projects,
    services,
    skipped: 0,
    failed: { count: failCount, firstError },
  };
}

/** Set a Simpro job's scheduled date range (the timeline bar). Dates are
 *  'YYYY-MM-DD'. */
export async function scheduleSimproJob(
  id: string,
  startIso: string,
  endIso: string,
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('simpro_jobs')
    .update({ scheduled_start: startIso, scheduled_end: endIso })
    .eq('id', id);
  if (error) throw error;
}

/** Clear a Simpro job's schedule (drag back off the timeline). */
export async function unscheduleSimproJob(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('simpro_jobs')
    .update({ scheduled_start: null, scheduled_end: null })
    .eq('id', id);
  if (error) throw error;
}
