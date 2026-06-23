// ─────────────────────────────────────────────────────────────────────────────
// lib/api/labourRates.ts — CRUD helpers for `labour_rates` (PP1, migration 73)
// plus profit-assembly functions for service jobs and projects.
//
// Conventions mirror materials.ts / commercial.ts exactly:
//   - snake_case Row interfaces match the Supabase schema.
//   - camelCase domain interfaces used by the rest of the app.
//   - All write functions throw on error.
//   - Read functions return [] / null when Supabase is not configured.
//   - Nullable-clear update pattern: only keys present in patch are sent.
//
// RLS note: labour_rates is manager+ only. Workers will get an empty [] from
// listLabourRates (RLS blocks the select) rather than an error — matching the
// "read returns [] when unconfigured / unauthorised" house pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';
import { listTimeEntries } from './serviceJobs';
import { rollUpLabourCost, computeProfit } from '../commercial/costing';

// ---------------------------------------------------------------------------
// Error sentinel
// ---------------------------------------------------------------------------

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

// ---------------------------------------------------------------------------
// Row type (snake_case — matches migration 73)
// ---------------------------------------------------------------------------

interface LabourRateRow {
  id: string;
  role: string;
  loaded_rate: number | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Domain type (camelCase)
// ---------------------------------------------------------------------------

export interface LabourRate {
  id: string;
  role: string;
  loadedRate: number | null;
  isActive: boolean;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Title-case a labour role for DISPLAY only ("electrician" → "Electrician",
 *  "solar installer" → "Solar Installer"). The stored value is never changed —
 *  role matching for pricing stays exact — so this is purely cosmetic and safe
 *  to apply at every render site. */
export function formatRole(role: string): string {
  return role.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateLabourRateInput {
  role: string;
  loadedRate?: number | null;
  sortOrder?: number;
}

export interface UpdateLabourRateInput {
  role?: string;
  loadedRate?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function rowToLabourRate(r: LabourRateRow): LabourRate {
  return {
    id: r.id,
    role: r.role,
    loadedRate: r.loaded_rate === null ? null : Number(r.loaded_rate),
    isActive: r.is_active,
    sortOrder: r.sort_order,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD — read
// ---------------------------------------------------------------------------

/**
 * List all labour rates, ordered by sort_order then role.
 * Returns [] when Supabase is not configured (UI shows empty state).
 * Workers will also get [] due to RLS blocking the select — that is intentional.
 */
export async function listLabourRates(includeInactive = false): Promise<LabourRate[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('labour_rates').select('*');
  if (!includeInactive) {
    q = q.eq('is_active', true);
  }
  const { data, error } = await q
    .order('sort_order', { ascending: true })
    .order('role', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToLabourRate(r as LabourRateRow));
}

// ---------------------------------------------------------------------------
// CRUD — write
// ---------------------------------------------------------------------------

/** Create a new labour rate row. Throws when Supabase is not configured. */
export async function createLabourRate(input: CreateLabourRateInput): Promise<LabourRate> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('labour_rates')
    .insert({
      role: input.role,
      loaded_rate: input.loadedRate ?? null,
      sort_order: input.sortOrder ?? 0,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToLabourRate(data as LabourRateRow);
}

/**
 * Update mutable fields of a labour rate. Only provided keys are patched
 * (undefined = untouched; null = explicitly cleared for nullable fields).
 * loadedRate is nullable-clear: passing null writes NULL to the column.
 */
export async function updateLabourRate(
  id: string,
  patch: UpdateLabourRateInput,
): Promise<LabourRate> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.loadedRate !== undefined) update.loaded_rate = patch.loadedRate;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase
    .from('labour_rates')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToLabourRate(data as LabourRateRow);
}

/** Activate or deactivate a labour rate. */
export async function setLabourRateActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('labour_rates')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Profit assembly helpers
// ---------------------------------------------------------------------------

/**
 * Build a Map<role, loadedRate | null> from the currently active labour rates.
 * Used by getServiceJobProfit and getProjectProfit to resolve rates for costing.
 */
export async function ratesMap(): Promise<Map<string, number | null>> {
  const rates = await listLabourRates(false); // active only
  const map = new Map<string, number | null>();
  for (const r of rates) {
    map.set(r.role, r.loadedRate);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Profit result type
// ---------------------------------------------------------------------------

export interface JobProfitResult {
  revenue: number | null;
  materials: number | null;
  labour: number;
  gross: number;
  net: number;
  marginPct: number | null;
  costedHours: number;
  uncostedHours: number;
  byRole: { role: string; hours: number; cost: number | null }[];
  /**
   * true only when revenue is not null, materials is not null, and there are
   * zero uncosted hours — meaning every input to the profit calculation is known.
   */
  complete: boolean;
}

// ---------------------------------------------------------------------------
// Service job profit
// ---------------------------------------------------------------------------

/**
 * Fetch all inputs for a service job and compute its profit summary.
 *
 * Reads:
 *   - service_jobs row for contract_value + materials_cost
 *   - service_job_time_entries (via listTimeEntries) for hours + role
 *   - active labour rates via ratesMap()
 *
 * Returns a JobProfitResult. Never throws for missing data — nulls mean
 * "not yet entered".
 */
export async function getServiceJobProfit(jobId: string): Promise<JobProfitResult | null> {
  if (!supabaseConfigured()) return null;

  // 1. Fetch the service job for contract_value + materials_cost.
  //    We select only the columns we need to avoid having to expand the full
  //    ServiceJob domain type.
  const { data: jobData, error: jobError } = await supabase
    .from('service_jobs')
    .select('contract_value, materials_cost')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!jobData) return null;

  const revenue = jobData.contract_value === null || jobData.contract_value === undefined
    ? null
    : Number(jobData.contract_value);
  const materials = jobData.materials_cost === null || jobData.materials_cost === undefined
    ? null
    : Number(jobData.materials_cost);

  // 2. Fetch time entries (includes role column added by migration 73).
  //    listTimeEntries does select('*') which now includes the role column.
  const entries = await listTimeEntries(jobId);

  // 3. Fetch rates map.
  const rates = await ratesMap();

  // 4. Roll up labour cost.
  //    ServiceJobTimeEntry now carries role natively (migration 73 + type fix).
  const rollup = rollUpLabourCost(
    entries.map((e) => ({
      hours: e.hours,
      role: e.role,
    })),
    rates,
  );

  // 5. Compute profit.
  const profit = computeProfit({
    revenueExGst: revenue,
    materialsCost: materials,
    labourCost: rollup.labourCost,
  });

  return {
    revenue,
    materials,
    labour: rollup.labourCost,
    gross: profit.gross,
    net: profit.net,
    marginPct: profit.marginPct,
    costedHours: rollup.costedHours,
    uncostedHours: rollup.uncostedHours,
    byRole: rollup.byRole,
    complete: revenue !== null && materials !== null && rollup.uncostedHours === 0,
  };
}

// ---------------------------------------------------------------------------
// Project profit
// ---------------------------------------------------------------------------

/**
 * Fetch all inputs for a project and compute its profit summary.
 *
 * Reads:
 *   - projects row for contract_value + materials_cost
 *   - timesheets where project_id = projectId and status in
 *     ('submitted', 'approved') — selects hours + role only
 *   - active labour rates via ratesMap()
 */
export async function getProjectProfit(projectId: string): Promise<JobProfitResult | null> {
  if (!supabaseConfigured()) return null;

  // 1. Fetch the project for contract_value + materials_cost.
  const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .select('contract_value, materials_cost')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!projectData) return null;

  const revenue = projectData.contract_value === null || projectData.contract_value === undefined
    ? null
    : Number(projectData.contract_value);
  const materials = projectData.materials_cost === null || projectData.materials_cost === undefined
    ? null
    : Number(projectData.materials_cost);

  // 2. Fetch timesheets for this project (submitted + approved only).
  //    migration 39 defines: project_id, hours, status.
  //    migration 73 adds:    role (text null).
  //    We select only the two columns we need.
  const { data: sheetData, error: sheetError } = await supabase
    .from('timesheets')
    .select('hours, role')
    .eq('project_id', projectId)
    .in('status', ['submitted', 'approved']);
  if (sheetError) throw sheetError;

  const entries = (sheetData ?? []).map((row: { hours: unknown; role?: string | null }) => ({
    hours: Number(row.hours),
    role: row.role ?? null,
  }));

  // 3. Fetch rates map.
  const rates = await ratesMap();

  // 4. Roll up labour cost.
  const rollup = rollUpLabourCost(entries, rates);

  // 5. Compute profit.
  const profit = computeProfit({
    revenueExGst: revenue,
    materialsCost: materials,
    labourCost: rollup.labourCost,
  });

  return {
    revenue,
    materials,
    labour: rollup.labourCost,
    gross: profit.gross,
    net: profit.net,
    marginPct: profit.marginPct,
    costedHours: rollup.costedHours,
    uncostedHours: rollup.uncostedHours,
    byRole: rollup.byRole,
    complete: revenue !== null && materials !== null && rollup.uncostedHours === 0,
  };
}
