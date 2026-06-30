// ─────────────────────────────────────────────────────────────────────────────
// lib/api/stock.ts — multi-location stock control (migration 87).
//
// Items are `materials` flagged is_stock_item. The factory + each van are
// `stock_locations`; per-location quantities live in `stock_levels` (a running
// tally maintained by a DB trigger). Every change is an immutable row in
// `stock_movements` — usage/receipt/transfer/adjustment/stocktake — with a cost
// snapshot so a job's materials cost = Σ(qty × unit_cost) of its usage rows.
//
// House conventions: snake_case Row + camelCase domain + rowToX mappers; writes
// throw; reads return [] / null when Supabase is not configured.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';

const NOT_CONFIGURED = new Error('Supabase is not configured.');

export type LocationType = 'factory' | 'van';
export type MovementReason = 'usage' | 'receipt' | 'transfer_out' | 'transfer_in' | 'adjustment' | 'stocktake';
export type JobKind = 'service' | 'simpro';

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

interface StockLocationRow {
  id: string;
  name: string;
  type: string;
  assigned_worker_id: string | null;
  rego: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockLocation {
  id: string;
  name: string;
  type: LocationType;
  assignedWorkerId: string | null;
  rego: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToLocation(r: StockLocationRow): StockLocation {
  return {
    id: r.id,
    name: r.name,
    type: (r.type as LocationType) ?? 'van',
    assignedWorkerId: r.assigned_worker_id,
    rego: r.rego,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listStockLocations(includeInactive = false): Promise<StockLocation[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('stock_locations').select('*');
  if (!includeInactive) q = q.eq('is_active', true);
  // Factory first, then vans by name.
  const { data, error } = await q.order('type', { ascending: true }).order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToLocation(r as StockLocationRow));
}

/** The van assigned to the signed-in worker (null if none / manager). */
export async function myVan(): Promise<StockLocation | null> {
  if (!supabaseConfigured()) return null;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('stock_locations')
    .select('*')
    .eq('assigned_worker_id', uid)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToLocation(data as StockLocationRow) : null;
}

export interface CreateLocationInput {
  name: string;
  type?: LocationType;
  assignedWorkerId?: string | null;
  rego?: string | null;
}

export async function createLocation(input: CreateLocationInput): Promise<StockLocation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('stock_locations')
    .insert({
      name: input.name,
      type: input.type ?? 'van',
      assigned_worker_id: input.assignedWorkerId ?? null,
      rego: input.rego ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToLocation(data as StockLocationRow);
}

export interface UpdateLocationInput {
  name?: string;
  assignedWorkerId?: string | null;
  rego?: string | null;
  isActive?: boolean;
}

export async function updateLocation(id: string, patch: UpdateLocationInput): Promise<StockLocation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.assignedWorkerId !== undefined) update.assigned_worker_id = patch.assignedWorkerId;
  if (patch.rego !== undefined) update.rego = patch.rego;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  const { data, error } = await supabase.from('stock_locations').update(update).eq('id', id).select('*').single();
  if (error) throw error;
  return rowToLocation(data as StockLocationRow);
}

// ---------------------------------------------------------------------------
// Levels (per-location tally, joined with the material for display)
// ---------------------------------------------------------------------------

interface LevelEmbed {
  id: string;
  location_id: string;
  material_id: string;
  qty: number;
  updated_at: string;
  materials: { name: string; sku: string | null; unit: string; cost_price: number | null } | null;
}

export interface StockLevel {
  id: string;
  locationId: string;
  materialId: string;
  qty: number;
  updatedAt: string;
  // flattened material fields (present when fetched with the embed)
  name: string;
  sku: string | null;
  unit: string;
  costPrice: number | null;
}

function embedToLevel(r: LevelEmbed): StockLevel {
  return {
    id: r.id,
    locationId: r.location_id,
    materialId: r.material_id,
    qty: Number(r.qty),
    updatedAt: r.updated_at,
    name: r.materials?.name ?? '(item)',
    sku: r.materials?.sku ?? null,
    unit: r.materials?.unit ?? 'ea',
    costPrice: r.materials?.cost_price ?? null,
  };
}

const LEVEL_SELECT = '*, materials(name, sku, unit, cost_price)';

/** Stock held at a single location (a van or the factory), item-named. */
export async function listStockLevels(locationId: string): Promise<StockLevel[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('stock_levels')
    .select(LEVEL_SELECT)
    .eq('location_id', locationId);
  if (error) throw error;
  return (data ?? []).map((r) => embedToLevel(r as LevelEmbed)).sort((a, b) => a.name.localeCompare(b.name));
}

export interface CompanyTotal {
  materialId: string;
  name: string;
  sku: string | null;
  unit: string;
  costPrice: number | null;
  total: number;
  byLocation: { locationId: string; locationName: string; type: LocationType; qty: number }[];
}

interface TotalsEmbed extends LevelEmbed {
  stock_locations: { name: string; type: string } | null;
}

/** Company-wide on-hand per item (Σ across all locations) + a per-location breakdown. */
export async function getCompanyTotals(): Promise<CompanyTotal[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('stock_levels')
    .select('*, materials(name, sku, unit, cost_price), stock_locations(name, type)');
  if (error) throw error;
  const byMaterial = new Map<string, CompanyTotal>();
  for (const raw of data ?? []) {
    const r = raw as TotalsEmbed;
    const qty = Number(r.qty);
    let entry = byMaterial.get(r.material_id);
    if (!entry) {
      entry = {
        materialId: r.material_id,
        name: r.materials?.name ?? '(item)',
        sku: r.materials?.sku ?? null,
        unit: r.materials?.unit ?? 'ea',
        costPrice: r.materials?.cost_price ?? null,
        total: 0,
        byLocation: [],
      };
      byMaterial.set(r.material_id, entry);
    }
    entry.total += qty;
    entry.byLocation.push({
      locationId: r.location_id,
      locationName: r.stock_locations?.name ?? '(location)',
      type: (r.stock_locations?.type as LocationType) ?? 'van',
      qty,
    });
  }
  return [...byMaterial.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

interface MovementRow {
  id: string;
  material_id: string;
  location_id: string;
  qty_delta: number;
  reason: string;
  counterpart_location_id: string | null;
  service_job_id: string | null;
  simpro_job_id: string | null;
  unit_cost: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StockMovement {
  id: string;
  materialId: string;
  locationId: string;
  qtyDelta: number;
  reason: MovementReason;
  counterpartLocationId: string | null;
  serviceJobId: string | null;
  simproJobId: string | null;
  unitCost: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

function rowToMovement(r: MovementRow): StockMovement {
  return {
    id: r.id,
    materialId: r.material_id,
    locationId: r.location_id,
    qtyDelta: Number(r.qty_delta),
    reason: (r.reason as MovementReason) ?? 'adjustment',
    counterpartLocationId: r.counterpart_location_id,
    serviceJobId: r.service_job_id,
    simproJobId: r.simpro_job_id,
    unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/** A line of materials used on a job, pulled from a van. */
export interface UsageLine {
  materialId: string;
  qty: number;          // positive quantity used
  unitCost?: number | null; // cost snapshot (defaults to the material's cost at the UI)
}

export interface RecordUsageInput {
  locationId: string;   // the van the stock came off
  jobId: string;        // required — the job it was used on
  jobKind: JobKind;
  lines: UsageLine[];
}

/** Record materials used on a job — deducts from the van's tally (one movement per line). */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const rows = input.lines
    .filter((l) => l.qty > 0)
    .map((l) => ({
      material_id: l.materialId,
      location_id: input.locationId,
      qty_delta: -Math.abs(l.qty),
      reason: 'usage',
      service_job_id: input.jobKind === 'service' ? input.jobId : null,
      simpro_job_id: input.jobKind === 'simpro' ? input.jobId : null,
      unit_cost: l.unitCost ?? null,
      created_by: uid,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('stock_movements').insert(rows);
  if (error) throw error;
}

/** Manager one-off correction (+/−) at a location. */
export async function adjustStock(
  locationId: string,
  materialId: string,
  qtyDelta: number,
  note?: string,
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase.from('stock_movements').insert({
    material_id: materialId,
    location_id: locationId,
    qty_delta: qtyDelta,
    reason: 'adjustment',
    note: note ?? null,
    created_by: uid,
  });
  if (error) throw error;
}

/** Reconcile a location to counted quantities (creates stocktake deltas). Used to
 *  seed opening stock. Only items whose counted qty differs from the current
 *  tally produce a movement. */
export async function recordStocktake(
  locationId: string,
  counts: { materialId: string; countedQty: number }[],
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const current = await listStockLevels(locationId);
  const currentById = new Map(current.map((l) => [l.materialId, l.qty]));
  const rows = counts
    .map((c) => ({ materialId: c.materialId, delta: c.countedQty - (currentById.get(c.materialId) ?? 0) }))
    .filter((c) => c.delta !== 0)
    .map((c) => ({
      material_id: c.materialId,
      location_id: locationId,
      qty_delta: c.delta,
      reason: 'stocktake',
      note: 'Stock-take',
      created_by: uid,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('stock_movements').insert(rows);
  if (error) throw error;
}

/** Move stock between two locations (e.g. factory → van) as a paired out/in
 *  movement, so both running tallies update. Manager action. */
export async function transferStock(
  fromLocationId: string,
  toLocationId: string,
  materialId: string,
  qty: number,
  unitCost?: number | null,
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const n = Math.abs(qty);
  if (n <= 0 || fromLocationId === toLocationId) return;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase.from('stock_movements').insert([
    { material_id: materialId, location_id: fromLocationId, qty_delta: -n, reason: 'transfer_out', counterpart_location_id: toLocationId, unit_cost: unitCost ?? null, created_by: uid },
    { material_id: materialId, location_id: toLocationId, qty_delta: n, reason: 'transfer_in', counterpart_location_id: fromLocationId, unit_cost: unitCost ?? null, created_by: uid },
  ]);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Job materials cost (derived from usage movements)
// ---------------------------------------------------------------------------

export interface JobUsageLine {
  materialId: string;
  qty: number;       // positive quantity used
  unitCost: number | null;
  cost: number;      // qty × unitCost
}

export interface JobUsage {
  lines: JobUsageLine[];
  totalCost: number;
}

/** All materials used on a job + the rolled-up materials cost. */
export async function getJobUsage(jobId: string, jobKind: JobKind): Promise<JobUsage> {
  if (!supabaseConfigured()) return { lines: [], totalCost: 0 };
  const col = jobKind === 'service' ? 'service_job_id' : 'simpro_job_id';
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq(col, jobId)
    .eq('reason', 'usage');
  if (error) throw error;
  const lines = (data ?? []).map((raw) => {
    const m = rowToMovement(raw as MovementRow);
    const qty = Math.abs(m.qtyDelta);
    const unitCost = m.unitCost;
    return { materialId: m.materialId, qty, unitCost, cost: unitCost != null ? Math.round(qty * unitCost * 100) / 100 : 0 };
  });
  const totalCost = Math.round(lines.reduce((s, l) => s + l.cost, 0) * 100) / 100;
  return { lines, totalCost };
}

// ---------------------------------------------------------------------------
// Realtime — live tally (mirrors lib/api/deliveries.ts split-handler pattern)
// ---------------------------------------------------------------------------

/** Subscribe to stock_levels changes (optionally for one location). Returns an
 *  unsubscribe fn. Callers refetch the affected view on any change. */
export function subscribeToStockLevels(
  locationId: string | null,
  onChange: () => void,
): () => void {
  if (!supabaseConfigured()) return () => undefined;
  const channel = supabase
    .channel(locationId ? `stock_levels:${locationId}` : 'stock_levels:all')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stock_levels',
        ...(locationId ? { filter: `location_id=eq.${locationId}` } : {}),
      },
      () => onChange(),
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
