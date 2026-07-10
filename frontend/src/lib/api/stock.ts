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

export type LocationType = 'factory' | 'van' | 'site' | 'storage';

const LOCATION_TYPES: readonly LocationType[] = ['factory', 'van', 'site', 'storage'];

/** Validated type parse — an unknown value must NOT fall back to 'van'
 *  (a site masquerading as a van would leak into worker van gating). */
function parseLocationType(raw: string | null | undefined): LocationType {
  return LOCATION_TYPES.includes(raw as LocationType) ? (raw as LocationType) : 'storage';
}
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
  address: string | null;
  lat: number | null;
  lng: number | null;
  service_job_id?: string | null;
  simpro_job_id?: string | null;
  project_id?: string | null;
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
  /** Base address + map pin (factory site / van home base; migration 92). */
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** SITE locations may link to the job/project they serve (migration 96). */
  serviceJobId: string | null;
  simproJobId: string | null;
  projectId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToLocation(r: StockLocationRow): StockLocation {
  return {
    id: r.id,
    name: r.name,
    type: parseLocationType(r.type),
    assignedWorkerId: r.assigned_worker_id,
    rego: r.rego,
    isActive: r.is_active,
    address: r.address ?? null,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    serviceJobId: r.service_job_id ?? null,
    simproJobId: r.simpro_job_id ?? null,
    projectId: r.project_id ?? null,
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
    // Explicit: a SITE linked to a worker must never masquerade as their van.
    .eq('type', 'van')
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
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Site links (migration 96) — only sent when set, so inserts keep working pre-96. */
  serviceJobId?: string | null;
  simproJobId?: string | null;
  projectId?: string | null;
}

/** Readable message when a site/storage write hits a pre-mig-96 database. */
const NEEDS_MIG_96 = 'Sites & storage need database update 96 — apply it in Supabase, then retry.';

function isPre96Error(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 23514 = the old two-value type check; PGRST204 = the link columns missing.
  return (error.code === '23514' && /type_check/i.test(error.message ?? ''))
    || (error.code === 'PGRST204' && /(service_job_id|simpro_job_id|project_id)/i.test(error.message ?? ''));
}

export async function createLocation(input: CreateLocationInput): Promise<StockLocation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const type = input.type ?? 'van';
  const { data, error } = await supabase
    .from('stock_locations')
    .insert({
      name: input.name,
      type,
      // Drivers are a VAN concept — is_my_van() grants ledger rights on
      // assigned locations, so never let a site/storage row carry one.
      assigned_worker_id: type === 'van' ? (input.assignedWorkerId ?? null) : null,
      rego: input.rego ?? null,
      // Only send geo columns when set — keeps inserts working pre-mig-92.
      ...(input.address != null && { address: input.address }),
      ...(input.lat != null && { lat: input.lat }),
      ...(input.lng != null && { lng: input.lng }),
      // Site links — only when set (pre-mig-96 safe).
      ...(input.serviceJobId != null && { service_job_id: input.serviceJobId }),
      ...(input.simproJobId != null && { simpro_job_id: input.simproJobId }),
      ...(input.projectId != null && { project_id: input.projectId }),
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw isPre96Error(error) ? new Error(NEEDS_MIG_96) : error;
  return rowToLocation(data as StockLocationRow);
}

export interface UpdateLocationInput {
  name?: string;
  type?: LocationType;
  assignedWorkerId?: string | null;
  rego?: string | null;
  isActive?: boolean;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  serviceJobId?: string | null;
  simproJobId?: string | null;
  projectId?: string | null;
}

export async function updateLocation(id: string, patch: UpdateLocationInput): Promise<StockLocation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.assignedWorkerId !== undefined) update.assigned_worker_id = patch.assignedWorkerId;
  if (patch.rego !== undefined) update.rego = patch.rego;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.lat !== undefined) update.lat = patch.lat;
  if (patch.lng !== undefined) update.lng = patch.lng;
  if (patch.serviceJobId !== undefined) update.service_job_id = patch.serviceJobId;
  if (patch.simproJobId !== undefined) update.simpro_job_id = patch.simproJobId;
  if (patch.projectId !== undefined) update.project_id = patch.projectId;
  const { data, error } = await supabase.from('stock_locations').update(update).eq('id', id).select('*').single();
  if (error) throw error;
  return rowToLocation(data as StockLocationRow);
}

/** Find the SITE location linked to a job, or create one (manager action —
 *  e.g. the job-drawer "Create site location" shortcut). An archived match is
 *  REACTIVATED (its movement history stays attached) rather than duplicated
 *  or dead-ended. Racing creates resolve via the mig-96 partial unique index:
 *  the loser re-runs the find. */
export async function siteLocationForJob(
  jobId: string,
  jobKind: JobKind,
  defaults: { name: string; address?: string | null },
): Promise<{ location: StockLocation; created: boolean; reactivated: boolean }> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const col = jobKind === 'service' ? 'service_job_id' : 'simpro_job_id';

  const find = async (): Promise<StockLocation | null> => {
    const { data, error } = await supabase
      .from('stock_locations')
      .select('*')
      .eq(col, jobId)
      .eq('type', 'site')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToLocation(data as StockLocationRow) : null;
  };

  const existing = await find();
  if (existing) {
    if (!existing.isActive) {
      const location = await updateLocation(existing.id, { isActive: true });
      return { location, created: false, reactivated: true };
    }
    return { location: existing, created: false, reactivated: false };
  }

  try {
    const location = await createLocation({
      name: defaults.name,
      type: 'site',
      address: defaults.address ?? null,
      serviceJobId: jobKind === 'service' ? jobId : null,
      simproJobId: jobKind === 'simpro' ? jobId : null,
    });
    return { location, created: true, reactivated: false };
  } catch (ex) {
    // 23505 = another manager won the create race — theirs is the site.
    if ((ex as { code?: string })?.code === '23505') {
      const winner = await find();
      if (winner) return { location: winner, created: false, reactivated: false };
    }
    throw ex;
  }
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
  byLocation: { locationId: string; locationName: string; type: LocationType; isActive: boolean; qty: number }[];
}

interface TotalsEmbed extends LevelEmbed {
  stock_locations: { name: string; type: string; is_active?: boolean } | null;
}

/** Company-wide on-hand per item (Σ across all locations) + a per-location breakdown. */
export async function getCompanyTotals(): Promise<CompanyTotal[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('stock_levels')
    .select('*, materials(name, sku, unit, cost_price), stock_locations(name, type, is_active)');
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
      type: parseLocationType(r.stock_locations?.type),
      isActive: r.stock_locations?.is_active ?? true,
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
// Movement history (reports)
// ---------------------------------------------------------------------------

export interface MovementView {
  id: string;
  materialId: string;
  name: string;
  unit: string;
  locationId: string;
  locationName: string;
  qtyDelta: number;
  reason: MovementReason;
  serviceJobId: string | null;
  simproJobId: string | null;
  unitCost: number | null;
  note: string | null;
  createdAt: string;
}

interface MovementViewEmbed extends MovementRow {
  materials: { name: string; unit: string } | null;
  stock_locations: { name: string } | null;
}

export interface MovementFilters {
  locationId?: string;
  materialId?: string;
  reason?: MovementReason;
  startDate?: string;   // ISO date (inclusive)
  endDate?: string;     // ISO date (inclusive — matched to end of day)
  limit?: number;
}

/** Filtered stock movements (audit trail), newest first, item- + location-named.
 *  Powers the Reports history filters, per-location history, and item drawer. */
export async function listMovements(filters: MovementFilters = {}): Promise<MovementView[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('stock_movements').select('*, materials(name, unit), stock_locations(name)');
  if (filters.locationId) q = q.eq('location_id', filters.locationId);
  if (filters.materialId) q = q.eq('material_id', filters.materialId);
  if (filters.reason) q = q.eq('reason', filters.reason);
  if (filters.startDate) q = q.gte('created_at', filters.startDate);
  if (filters.endDate) q = q.lte('created_at', `${filters.endDate}T23:59:59.999Z`);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(filters.limit ?? 200);
  if (error) throw error;
  return (data ?? []).map(embedToMovementView);
}

/** Recent stock movements (the audit trail), newest first, item- and location-named. */
export async function listRecentMovements(limit = 200): Promise<MovementView[]> {
  return listMovements({ limit });
}

function embedToMovementView(raw: unknown): MovementView {
  const r = raw as MovementViewEmbed;
  return {
    id: r.id,
    materialId: r.material_id,
    name: r.materials?.name ?? '(item)',
    unit: r.materials?.unit ?? 'ea',
    locationId: r.location_id,
    locationName: r.stock_locations?.name ?? '(location)',
    qtyDelta: Number(r.qty_delta),
    reason: (r.reason as MovementReason) ?? 'adjustment',
    serviceJobId: r.service_job_id,
    simproJobId: r.simpro_job_id,
    unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
    note: r.note,
    createdAt: r.created_at,
  };
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

// ---------------------------------------------------------------------------
// Job boxes — stock allocations (migration 95)
//
// A manager packs factory stock for a won job and allocates it to the
// scheduled tech. NOTHING moves until the tech ACCEPTS at pickup — the accept
// RPC emits the ordinary paired transfer movements (source → their van), so
// the ledger stays immutable and "who took the box" is on record.
// ---------------------------------------------------------------------------

export type AllocationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface AllocationLine {
  id: string;
  materialId: string;
  name: string;
  unit: string;
  sku: string | null;
  qty: number;
  unitCost: number | null;
}

export interface StockAllocation {
  id: string;
  serviceJobId: string | null;
  simproJobId: string | null;
  /** Short label for the job the box belongs to (title / Simpro ref). */
  jobLabel: string;
  sourceLocationId: string;
  sourceLocationName: string;
  destLocationId: string | null;
  assignedTo: string;
  status: AllocationStatus;
  note: string | null;
  declineNote: string | null;
  createdBy: string | null;
  createdAt: string;
  acceptedAt: string | null;
  lines: AllocationLine[];
}

interface AllocationLineEmbed {
  id: string;
  material_id: string;
  qty: string | number;
  unit_cost: string | number | null;
  sort_order: number;
  materials: { name: string; unit: string; sku: string | null } | null;
}

interface AllocationEmbed {
  id: string;
  service_job_id: string | null;
  simpro_job_id: string | null;
  source_location_id: string;
  dest_location_id: string | null;
  assigned_to: string;
  status: string;
  note: string | null;
  decline_note: string | null;
  created_by: string | null;
  created_at: string;
  accepted_at: string | null;
  source: { name: string } | null;
  service_jobs: { title: string } | null;
  simpro_jobs: { external_ref: string; customer_name: string | null } | null;
  stock_allocation_lines: AllocationLineEmbed[];
}

// Two FKs point at stock_locations, so the source embed must name its
// constraint explicitly.
const ALLOCATION_SELECT =
  '*, source:stock_locations!stock_allocations_source_location_id_fkey(name), ' +
  'service_jobs(title), simpro_jobs(external_ref, customer_name), ' +
  'stock_allocation_lines(id, material_id, qty, unit_cost, sort_order, materials(name, unit, sku))';

function embedToAllocation(raw: unknown): StockAllocation {
  const r = raw as AllocationEmbed;
  const jobLabel = r.service_jobs?.title
    ?? (r.simpro_jobs ? `Simpro ${r.simpro_jobs.external_ref}${r.simpro_jobs.customer_name ? ` — ${r.simpro_jobs.customer_name}` : ''}` : '(job)');
  return {
    id: r.id,
    serviceJobId: r.service_job_id,
    simproJobId: r.simpro_job_id,
    jobLabel,
    sourceLocationId: r.source_location_id,
    sourceLocationName: r.source?.name ?? '(location)',
    destLocationId: r.dest_location_id,
    assignedTo: r.assigned_to,
    status: (r.status as AllocationStatus) ?? 'pending',
    note: r.note,
    declineNote: r.decline_note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
    lines: [...(r.stock_allocation_lines ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        id: l.id,
        materialId: l.material_id,
        name: l.materials?.name ?? '(item)',
        unit: l.materials?.unit ?? 'ea',
        sku: l.materials?.sku ?? null,
        qty: Number(l.qty),
        unitCost: l.unit_cost != null ? Number(l.unit_cost) : null,
      })),
  };
}

/** All job boxes for one job (manager view in the job drawer), newest first. */
export async function listJobAllocations(jobId: string, jobKind: JobKind): Promise<StockAllocation[]> {
  if (!supabaseConfigured()) return [];
  const col = jobKind === 'service' ? 'service_job_id' : 'simpro_job_id';
  const { data, error } = await supabase
    .from('stock_allocations')
    .select(ALLOCATION_SELECT)
    .eq(col, jobId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(embedToAllocation);
}

/** The signed-in worker's pending job boxes (My Van banner), oldest first. */
export async function listMyPendingAllocations(): Promise<StockAllocation[]> {
  if (!supabaseConfigured()) return [];
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('stock_allocations')
    .select(ALLOCATION_SELECT)
    .eq('assigned_to', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(embedToAllocation);
}

/** Count of company-wide unaccepted boxes (Stock hub manager strip). */
export async function countPendingAllocations(): Promise<number> {
  if (!supabaseConfigured()) return 0;
  const { count, error } = await supabase
    .from('stock_allocations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

export interface CreateAllocationInput {
  jobId: string;
  jobKind: JobKind;
  sourceLocationId: string;
  assignedTo: string;
  note?: string | null;
  lines: { materialId: string; qty: number; unitCost?: number | null }[];
}

/** Pack a job box (manager). Inserts header + lines, then notifies the
 *  assignee. All-or-nothing: if the lines fail, the header is rolled back. */
export async function createAllocation(input: CreateAllocationInput): Promise<string> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const lines = input.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) throw new Error('A job box needs at least one item.');

  const { data, error } = await supabase
    .from('stock_allocations')
    .insert({
      service_job_id: input.jobKind === 'service' ? input.jobId : null,
      simpro_job_id: input.jobKind === 'simpro' ? input.jobId : null,
      source_location_id: input.sourceLocationId,
      assigned_to: input.assignedTo,
      note: input.note ?? null,
      created_by: uid,
    })
    .select('id')
    .single();
  if (error) throw error;
  const allocationId = (data as { id: string }).id;

  const { error: lineError } = await supabase.from('stock_allocation_lines').insert(
    lines.map((l, i) => ({
      allocation_id: allocationId,
      material_id: l.materialId,
      qty: l.qty,
      unit_cost: l.unitCost ?? null,
      sort_order: i,
    })),
  );
  if (lineError) {
    // Roll the header back — a lineless box would still notify + count as pending.
    await supabase.from('stock_allocations').delete().eq('id', allocationId);
    throw lineError;
  }

  // Tell the assignee (best-effort — the box still exists if this fails).
  const { error: notifyError } = await supabase.rpc('notify_user', {
    p_user: input.assignedTo,
    p_type: 'stock_allocation',
    p_priority: 'medium',
    p_title: 'Job box ready',
    p_message: 'A job box has been packed for you — accept it at pickup in My Van.',
    p_metadata: { allocationId },
  });
  if (notifyError) console.warn('Job box created but the notification failed:', notifyError.message);

  return allocationId;
}

/** Worker accepts at pickup — the RPC moves the stock (source → their van). */
export async function acceptAllocation(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.rpc('accept_stock_allocation', { p_allocation: id });
  if (error) throw error;
}

/** Worker declines with a short reason; no stock moves. */
export async function declineAllocation(id: string, note: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.rpc('decline_stock_allocation', { p_allocation: id, p_note: note || null });
  if (error) throw error;
}

/** Manager cancels a still-pending box. Throws if it was already actioned. */
export async function cancelAllocation(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('stock_allocations')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  if (error) throw error;
  if ((data ?? []).length === 0) {
    throw new Error('This job box is no longer pending — refresh to see its current state.');
  }
}

/** Requested-vs-on-hand per line (pure). Allocating short is allowed — the
 *  physical box is truth — but the UI flags it honestly. */
export function allocationShortfalls(
  levels: StockLevel[],
  lines: { materialId: string; qty: number }[],
): Map<string, { onHand: number; short: number }> {
  const byMaterial = new Map(levels.map((l) => [l.materialId, l.qty]));
  const out = new Map<string, { onHand: number; short: number }>();
  for (const line of lines) {
    const onHand = byMaterial.get(line.materialId) ?? 0;
    if (line.qty > onHand) out.set(line.materialId, { onHand, short: Math.round((line.qty - onHand) * 100) / 100 });
  }
  return out;
}
