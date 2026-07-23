// ─────────────────────────────────────────────────────────────────────────────
// lib/api/purchasing.ts — Stock Phase 2/3: reorder rules, stock settings, and
// purchase orders (restock + on-the-job).
//
// The restock engine: when the company total of a stocked item drops below its
// min, draftRestocks() creates a 'suggested' restock PO to the preferred
// wholesaler (qty = target − total) and alerts the nominated stock controller.
//
// House conventions: snake_case Row + camelCase domain + rowToX; writes throw;
// reads return [] / null when not configured.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';
import { getCompanyTotals, listStockLocations } from './stock';
import type { OpenPoItem, SupplierSkuEntry, MatchedInvoiceLine } from '../purchasing/invoiceMatch';

const NOT_CONFIGURED = new Error('Supabase is not configured.');

export type POKind = 'restock' | 'job';
export type POStatus = 'suggested' | 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';

// ---------------------------------------------------------------------------
// Reorder rules
// ---------------------------------------------------------------------------

interface ReorderRuleRow {
  material_id: string;
  min_qty: number;
  target_qty: number;
  supplier_id: string | null;
  reorder_enabled: boolean;
}

export interface ReorderRule {
  materialId: string;
  minQty: number;
  targetQty: number;
  supplierId: string | null;
  reorderEnabled: boolean;
}

function rowToRule(r: ReorderRuleRow): ReorderRule {
  return {
    materialId: r.material_id,
    minQty: Number(r.min_qty),
    targetQty: Number(r.target_qty),
    supplierId: r.supplier_id,
    reorderEnabled: r.reorder_enabled,
  };
}

export async function listReorderRules(): Promise<ReorderRule[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase.from('stock_reorder_rules').select('*');
  if (error) throw error;
  return (data ?? []).map((r) => rowToRule(r as ReorderRuleRow));
}

export interface UpsertReorderRuleInput {
  minQty?: number;
  targetQty?: number;
  supplierId?: string | null;
  reorderEnabled?: boolean;
}

export async function upsertReorderRule(materialId: string, patch: UpsertReorderRuleInput): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase
    .from('stock_reorder_rules')
    .upsert(
      {
        material_id: materialId,
        ...(patch.minQty !== undefined && { min_qty: patch.minQty }),
        ...(patch.targetQty !== undefined && { target_qty: patch.targetQty }),
        ...(patch.supplierId !== undefined && { supplier_id: patch.supplierId }),
        ...(patch.reorderEnabled !== undefined && { reorder_enabled: patch.reorderEnabled }),
        created_by: uid,
      },
      { onConflict: 'material_id' },
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Stock settings (singleton)
// ---------------------------------------------------------------------------

export interface StockSettings {
  stockControllerId: string | null;
  autoSend: boolean;
}

export async function getStockSettings(): Promise<StockSettings> {
  if (!supabaseConfigured()) return { stockControllerId: null, autoSend: false };
  const { data, error } = await supabase.from('stock_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return {
    stockControllerId: (data?.stock_controller_id as string | null) ?? null,
    autoSend: (data?.auto_send as boolean | undefined) ?? false,
  };
}

export async function updateStockSettings(patch: Partial<StockSettings>): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.stockControllerId !== undefined) update.stock_controller_id = patch.stockControllerId;
  if (patch.autoSend !== undefined) update.auto_send = patch.autoSend;
  const { error } = await supabase.from('stock_settings').update(update).eq('id', 1);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

interface PORow {
  id: string;
  number: string;
  kind: string;
  supplier_id: string | null;
  destination_location_id: string | null;
  service_job_id: string | null;
  simpro_job_id: string | null;
  status: string;
  expected_date: string | null;
  notes: string | null;
  created_by: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  kind: POKind;
  supplierId: string | null;
  destinationLocationId: string | null;
  serviceJobId: string | null;
  simproJobId: string | null;
  status: POStatus;
  expectedDate: string | null;
  notes: string | null;
  createdBy: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // present via embeds
  supplierName?: string | null;
  itemsCount?: number;
  /** Σ qty_ordered × unit_cost across the order's lines (listPurchaseOrders only). */
  orderedTotal?: number;
}

function rowToPO(r: PORow & { suppliers?: { name: string } | null; purchase_order_items?: Array<{ count: number }> }): PurchaseOrder {
  return {
    id: r.id,
    number: r.number,
    kind: (r.kind as POKind) ?? 'restock',
    supplierId: r.supplier_id,
    destinationLocationId: r.destination_location_id,
    serviceJobId: r.service_job_id,
    simproJobId: r.simpro_job_id,
    status: (r.status as POStatus) ?? 'draft',
    expectedDate: r.expected_date,
    notes: r.notes,
    createdBy: r.created_by,
    sentAt: r.sent_at,
    receivedAt: r.received_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    supplierName: r.suppliers?.name ?? null,
    itemsCount: r.purchase_order_items?.[0]?.count,
  };
}

interface POItemRow {
  id: string;
  po_id: string;
  material_id: string | null;
  description: string | null;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number | null;
  sort_order: number;
}

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  materialId: string | null;
  description: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number | null;
  sortOrder: number;
}

function rowToPOItem(r: POItemRow): PurchaseOrderItem {
  return {
    id: r.id,
    poId: r.po_id,
    materialId: r.material_id,
    description: r.description,
    qtyOrdered: Number(r.qty_ordered),
    qtyReceived: Number(r.qty_received),
    unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
    sortOrder: r.sort_order,
  };
}

export async function listPurchaseOrders(filters?: { status?: POStatus; kind?: POKind }): Promise<PurchaseOrder[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_items(qty_ordered, unit_cost)');
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.kind) q = q.eq('kind', filters.kind);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((raw) => {
    const r = raw as PORow & { purchase_order_items?: Array<{ qty_ordered: number; unit_cost: number | null }> };
    const po = rowToPO(r as PORow);
    const items = r.purchase_order_items ?? [];
    po.itemsCount = items.length;
    po.orderedTotal = Math.round(items.reduce((s, i) => s + Number(i.qty_ordered) * (i.unit_cost != null ? Number(i.unit_cost) : 0), 0) * 100) / 100;
    return po;
  });
}

export interface POWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

export async function getPurchaseOrderWithItems(id: string): Promise<POWithItems | null> {
  if (!supabaseConfigured()) return null;
  const [poRes, itemsRes] = await Promise.all([
    supabase.from('purchase_orders').select('*, suppliers(name)').eq('id', id).maybeSingle(),
    supabase.from('purchase_order_items').select('*').eq('po_id', id).order('sort_order', { ascending: true }),
  ]);
  if (poRes.error) throw poRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (!poRes.data) return null;
  return {
    ...rowToPO(poRes.data as PORow),
    items: (itemsRes.data ?? []).map((r) => rowToPOItem(r as POItemRow)),
  };
}

export interface POLineInput {
  materialId: string | null;
  description?: string | null;
  qtyOrdered: number;
  unitCost?: number | null;
}

export interface CreatePOInput {
  kind?: POKind;
  supplierId?: string | null;
  destinationLocationId?: string | null;
  serviceJobId?: string | null;
  simproJobId?: string | null;
  status?: POStatus;
  expectedDate?: string | null;
  notes?: string | null;
  items: POLineInput[];
}

export async function createPurchaseOrder(input: CreatePOInput): Promise<PurchaseOrder> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('purchase_orders')
    .insert({
      kind: input.kind ?? 'restock',
      supplier_id: input.supplierId ?? null,
      destination_location_id: input.destinationLocationId ?? null,
      service_job_id: input.serviceJobId ?? null,
      simpro_job_id: input.simproJobId ?? null,
      status: input.status ?? 'draft',
      expected_date: input.expectedDate ?? null,
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  const po = rowToPO(data as PORow);
  if (input.items.length > 0) {
    const rows = input.items.map((l, i) => ({
      po_id: po.id,
      material_id: l.materialId,
      description: l.description ?? null,
      qty_ordered: l.qtyOrdered,
      unit_cost: l.unitCost ?? null,
      sort_order: i,
    }));
    const { error: itemsErr } = await supabase.from('purchase_order_items').insert(rows);
    if (itemsErr) throw itemsErr;
  }
  return po;
}

// ── PO line editing (draft/suggested orders) ──

export async function addPOItem(poId: string, line: POLineInput, sortOrder = 0): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('purchase_order_items').insert({
    po_id: poId,
    material_id: line.materialId,
    description: line.description ?? null,
    qty_ordered: line.qtyOrdered,
    unit_cost: line.unitCost ?? null,
    sort_order: sortOrder,
  });
  if (error) throw error;
}

export async function updatePOItem(itemId: string, patch: { qtyOrdered?: number; unitCost?: number | null }): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.qtyOrdered !== undefined) update.qty_ordered = patch.qtyOrdered;
  if (patch.unitCost !== undefined) update.unit_cost = patch.unitCost;
  const { error } = await supabase.from('purchase_order_items').update(update).eq('id', itemId);
  if (error) throw error;
}

export async function removePOItem(itemId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('purchase_order_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function updatePurchaseOrderStatus(id: string, status: POStatus): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const stamp: Record<string, unknown> = { status };
  if (status === 'sent') stamp.sent_at = new Date().toISOString();
  if (status === 'received') stamp.received_at = new Date().toISOString();
  const { error } = await supabase.from('purchase_orders').update(stamp).eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Notify (restock alert) — wraps the SECURITY DEFINER RPC
// ---------------------------------------------------------------------------

export async function notifyUser(
  userId: string,
  n: { type: string; priority?: string; title: string; message: string; metadata?: Record<string, unknown> },
): Promise<void> {
  if (!supabaseConfigured()) return;
  const { error } = await supabase.rpc('notify_user', {
    p_user: userId,
    p_type: n.type,
    p_priority: n.priority ?? 'medium',
    p_title: n.title,
    p_message: n.message,
    p_metadata: n.metadata ?? {},
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Low-stock + restock engine
// ---------------------------------------------------------------------------

export interface LowStockItem {
  materialId: string;
  name: string;
  sku: string | null;
  unit: string;
  total: number;
  minQty: number;
  targetQty: number;
  needed: number; // target − total (clamped ≥ 0)
  supplierId: string | null;
  costPrice: number | null;
}

/** Items at or below their minimum (enabled rules only), with the qty needed to
 *  reach target. Drives the low-stock dashboard.
 *
 *  Preferred-wholesaler precedence: the rule's own supplier wins; when the rule
 *  has none, the material's supplier (set by the catalogue import / material
 *  form) is used — so a wholesaler-linked import groups restock POs correctly
 *  without hand-setting hundreds of rules. The rules editor still overrides. */
export async function getLowStock(): Promise<LowStockItem[]> {
  if (!supabaseConfigured()) return [];
  const [totals, rules] = await Promise.all([getCompanyTotals(), listReorderRules()]);
  const totalById = new Map(totals.map((t) => [t.materialId, t]));

  // Fallback supplier ids — one slim query over materials that HAVE a supplier.
  const materialSupplier = new Map<string, string>();
  if (rules.some((r) => r.reorderEnabled && r.supplierId === null)) {
    const { data } = await supabase
      .from('materials')
      .select('id, supplier_id')
      .not('supplier_id', 'is', null);
    for (const raw of data ?? []) {
      const r = raw as { id: string; supplier_id: string | null };
      if (r.supplier_id) materialSupplier.set(r.id, r.supplier_id);
    }
  }

  const out: LowStockItem[] = [];
  for (const rule of rules) {
    if (!rule.reorderEnabled) continue;
    const t = totalById.get(rule.materialId);
    const total = t?.total ?? 0;
    if (total >= rule.minQty) continue;
    out.push({
      materialId: rule.materialId,
      name: t?.name ?? '(item)',
      sku: t?.sku ?? null,
      unit: t?.unit ?? 'ea',
      total,
      minQty: rule.minQty,
      targetQty: rule.targetQty,
      needed: Math.max(0, Math.round((rule.targetQty - total) * 100) / 100),
      supplierId: rule.supplierId ?? materialSupplier.get(rule.materialId) ?? null,
      costPrice: t?.costPrice ?? null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Per-LOCATION minimums (migration 99) — "does THIS building/van hold enough?"
//
// Additive to the company rules above, never merged with them: a below-min
// FACTORY/WAREHOUSE row suggests a PURCHASE to that location; a below-min
// van/storage/site row suggests a TRANSFER from the factory. Nothing automatic.
// ---------------------------------------------------------------------------

interface LocationReorderRuleRow {
  location_id: string;
  material_id: string;
  min_qty: number;
  target_qty: number;
}

export interface LocationReorderRule {
  locationId: string;
  materialId: string;
  minQty: number;
  targetQty: number;
}

export async function listLocationReorderRules(locationId?: string): Promise<LocationReorderRule[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('stock_location_reorder_rules').select('location_id, material_id, min_qty, target_qty');
  if (locationId) q = q.eq('location_id', locationId);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as LocationReorderRuleRow[]).map((r) => ({
    locationId: r.location_id,
    materialId: r.material_id,
    minQty: Number(r.min_qty),
    targetQty: Number(r.target_qty),
  }));
}

export async function upsertLocationReorderRule(
  locationId: string,
  materialId: string,
  patch: { minQty?: number; targetQty?: number },
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase
    .from('stock_location_reorder_rules')
    .upsert(
      {
        location_id: locationId,
        material_id: materialId,
        ...(patch.minQty !== undefined && { min_qty: patch.minQty }),
        ...(patch.targetQty !== undefined && { target_qty: patch.targetQty }),
        created_by: uid,
      },
      { onConflict: 'location_id,material_id' },
    );
  if (error) throw error;
}

export type ShortfallAction = 'order' | 'transfer';

export interface LocationShortfall {
  locationId: string;
  locationName: string;
  locationType: string;
  /** factory/warehouse → 'order' (buy to this location); van/storage/site →
   *  'transfer' (move from the factory). */
  action: ShortfallAction;
  materialId: string;
  name: string;
  sku: string | null;
  unit: string;
  onHand: number;
  minQty: number;
  targetQty: number;
  /** Qty to reach target (or min when no target is set), clamped ≥ 0. */
  suggestedQty: number;
  /** Transfer rows only: what the factory currently holds — honesty about
   *  whether the suggested move is even coverable. Null on order rows. */
  factoryOnHand: number | null;
}

/** PURE — exported for single-fork tests. Rules for inactive/missing locations
 *  are ignored; a material with no level row at its ruled location counts as 0. */
export function computeLocationShortfalls(
  rules: LocationReorderRule[],
  locations: Array<{ id: string; name: string; type: string; isActive: boolean }>,
  totals: Array<{ materialId: string; name: string; sku: string | null; unit: string; byLocation: Array<{ locationId: string; qty: number }> }>,
): LocationShortfall[] {
  const locById = new Map(locations.map((l) => [l.id, l]));
  const factory = locations.find((l) => l.type === 'factory' && l.isActive) ?? null;

  const qtyByLocMat = new Map<string, number>();
  const meta = new Map<string, { name: string; sku: string | null; unit: string }>();
  for (const t of totals) {
    meta.set(t.materialId, { name: t.name, sku: t.sku, unit: t.unit });
    for (const bl of t.byLocation) {
      qtyByLocMat.set(`${bl.locationId}:${t.materialId}`, bl.qty);
    }
  }

  const out: LocationShortfall[] = [];
  for (const rule of rules) {
    const loc = locById.get(rule.locationId);
    if (!loc || !loc.isActive) continue;
    if (rule.minQty <= 0) continue; // zeroed rule = removed
    const onHand = qtyByLocMat.get(`${rule.locationId}:${rule.materialId}`) ?? 0;
    if (onHand >= rule.minQty) continue;
    const m = meta.get(rule.materialId);
    const action: ShortfallAction = loc.type === 'factory' ? 'order' : 'transfer';
    const goal = rule.targetQty > 0 ? rule.targetQty : rule.minQty;
    out.push({
      locationId: loc.id,
      locationName: loc.name,
      locationType: loc.type,
      action,
      materialId: rule.materialId,
      name: m?.name ?? '(item)',
      sku: m?.sku ?? null,
      unit: m?.unit ?? 'ea',
      onHand,
      minQty: rule.minQty,
      targetQty: rule.targetQty,
      suggestedQty: Math.max(0, Math.round((goal - onHand) * 100) / 100),
      factoryOnHand: action === 'transfer'
        ? (factory ? (qtyByLocMat.get(`${factory.id}:${rule.materialId}`) ?? 0) : null)
        : null,
    });
  }
  return out.sort((a, b) => a.locationName.localeCompare(b.locationName) || a.name.localeCompare(b.name));
}

/** Every ruled location currently below one of its minimums, with the
 *  type-appropriate suggested action. Renders beside getLowStock's company
 *  list on the Restock tab — the two are never merged. */
export async function getLocationShortfalls(): Promise<LocationShortfall[]> {
  if (!supabaseConfigured()) return [];
  const [rules, locations, totals] = await Promise.all([
    listLocationReorderRules(),
    listStockLocations(),
    getCompanyTotals(),
  ]);
  return computeLocationShortfalls(rules, locations, totals);
}

/** Which items are already on an OPEN restock PO (suggested/draft/sent/partial):
 *  materialId → that PO's number. Drives the "already on order" flags. */
export async function getOnOrderMap(): Promise<Map<string, string>> {
  if (!supabaseConfigured()) return new Map();
  const open = (await listPurchaseOrders({ kind: 'restock' }))
    .filter((p) => ['suggested', 'draft', 'sent', 'partial'].includes(p.status));
  if (open.length === 0) return new Map();
  const numberById = new Map(open.map((p) => [p.id, p.number]));
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select('material_id, po_id')
    .in('po_id', open.map((p) => p.id));
  if (error) throw error;
  const map = new Map<string, string>();
  for (const raw of data ?? []) {
    const r = raw as { material_id: string | null; po_id: string };
    if (r.material_id && !map.has(r.material_id)) map.set(r.material_id, numberById.get(r.po_id) ?? 'PO');
  }
  return map;
}

export interface RestockResult {
  ordersCreated: number;
  itemsDrafted: number;
}

/** Draft 'suggested' restock POs for everything below min (grouped by preferred
 *  wholesaler, destined for the factory), skipping items already on an open
 *  restock PO, then alert the nominated stock controller. Returns a summary. */
export async function draftRestocks(): Promise<RestockResult> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const low = (await getLowStock()).filter((l) => l.needed > 0);
  if (low.length === 0) return { ordersCreated: 0, itemsDrafted: 0 };

  // Skip items already on an open restock PO (suggested/draft/sent/partial).
  const open = await listPurchaseOrders({ kind: 'restock' });
  const openIds = open.filter((p) => ['suggested', 'draft', 'sent', 'partial'].includes(p.status)).map((p) => p.id);
  const onOrder = new Set<string>();
  if (openIds.length > 0) {
    const { data } = await supabase.from('purchase_order_items').select('material_id, po_id').in('po_id', openIds);
    for (const r of data ?? []) if ((r as { material_id: string | null }).material_id) onOrder.add((r as { material_id: string }).material_id);
  }
  const toOrder = low.filter((l) => !onOrder.has(l.materialId));
  if (toOrder.length === 0) return { ordersCreated: 0, itemsDrafted: 0 };

  // Factory = restock destination.
  const { data: facData } = await supabase.from('stock_locations').select('id').eq('type', 'factory').limit(1).maybeSingle();
  const factoryId = (facData?.id as string | undefined) ?? null;

  // Group by preferred supplier (null → its own "unassigned supplier" order).
  const bySupplier = new Map<string, LowStockItem[]>();
  for (const l of toOrder) {
    const key = l.supplierId ?? '__none__';
    const arr = bySupplier.get(key);
    if (arr) arr.push(l); else bySupplier.set(key, [l]);
  }

  let ordersCreated = 0;
  let itemsDrafted = 0;
  for (const [key, lines] of bySupplier) {
    await createPurchaseOrder({
      kind: 'restock',
      supplierId: key === '__none__' ? null : key,
      destinationLocationId: factoryId,
      status: 'suggested',
      notes: 'Auto-drafted: stock below minimum.',
      items: lines.map((l) => ({ materialId: l.materialId, description: l.name, qtyOrdered: l.needed, unitCost: l.costPrice })),
    });
    ordersCreated += 1;
    itemsDrafted += lines.length;
  }

  // Alert the nominated controller.
  const settings = await getStockSettings();
  if (settings.stockControllerId) {
    await notifyUser(settings.stockControllerId, {
      type: 'stock_low',
      priority: 'high',
      title: 'Restock needed',
      message: `${itemsDrafted} item${itemsDrafted === 1 ? '' : 's'} below minimum — ${ordersCreated} restock order${ordersCreated === 1 ? '' : 's'} drafted for review.`,
      metadata: { ordersCreated, itemsDrafted },
    }).catch(() => {});
  }

  return { ordersCreated, itemsDrafted };
}

// ---------------------------------------------------------------------------
// Receiving + supplier invoices (Phase 3)
// ---------------------------------------------------------------------------

/** Receive quantities against a PO's lines. For a restock PO with a destination,
 *  each received qty creates a `receipt` stock movement (tops up that location).
 *  Updates each line's qty_received + the PO status (received / partial). */
export async function receivePurchaseOrder(
  poId: string,
  receipts: { itemId: string; qtyNow: number }[],
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const po = await getPurchaseOrderWithItems(poId);
  if (!po) throw new Error('Purchase order not found.');
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const receiptById = new Map(receipts.filter((r) => r.qtyNow > 0).map((r) => [r.itemId, r.qtyNow]));

  const movements: Record<string, unknown>[] = [];
  for (const item of po.items) {
    const qtyNow = receiptById.get(item.id);
    if (!qtyNow) continue;
    const newReceived = item.qtyReceived + qtyNow;
    const { error: upErr } = await supabase
      .from('purchase_order_items')
      .update({ qty_received: newReceived })
      .eq('id', item.id);
    if (upErr) throw upErr;
    item.qtyReceived = newReceived; // keep local copy for the status calc
    if (po.kind === 'restock' && po.destinationLocationId && item.materialId) {
      movements.push({
        material_id: item.materialId,
        location_id: po.destinationLocationId,
        qty_delta: qtyNow,
        reason: 'receipt',
        unit_cost: item.unitCost ?? null,
        note: `Received on ${po.number}`,
        created_by: uid,
      });
    }
  }
  if (movements.length > 0) {
    const { error: mvErr } = await supabase.from('stock_movements').insert(movements);
    if (mvErr) throw mvErr;
  }
  const allReceived = po.items.every((i) => i.qtyReceived >= i.qtyOrdered);
  await updatePurchaseOrderStatus(poId, allReceived ? 'received' : 'partial');
}

interface SupplierInvoiceRow {
  id: string;
  po_id: string | null;
  supplier_id: string | null;
  number: string | null;
  invoice_date: string | null;
  amount: number | null;
  status: string;
  file_ref: string | null;
  notes: string | null;
  created_at: string;
}

export type SupplierInvoiceStatus = 'unmatched' | 'matched' | 'disputed' | 'paid';

export interface SupplierInvoice {
  id: string;
  poId: string | null;
  supplierId: string | null;
  number: string | null;
  invoiceDate: string | null;
  amount: number | null;
  status: SupplierInvoiceStatus;
  fileRef: string | null;
  notes: string | null;
  createdAt: string;
}

function rowToSupplierInvoice(r: SupplierInvoiceRow): SupplierInvoice {
  return {
    id: r.id,
    poId: r.po_id,
    supplierId: r.supplier_id,
    number: r.number,
    invoiceDate: r.invoice_date,
    amount: r.amount != null ? Number(r.amount) : null,
    status: (r.status as SupplierInvoiceStatus) ?? 'unmatched',
    fileRef: r.file_ref,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export async function listSupplierInvoices(poId: string): Promise<SupplierInvoice[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('supplier_invoices')
    .select('*')
    .eq('po_id', poId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSupplierInvoice(r as SupplierInvoiceRow));
}

export interface CreateSupplierInvoiceInput {
  poId: string | null;
  supplierId: string | null;
  number?: string | null;
  invoiceDate?: string | null;
  amount?: number | null;
  status?: SupplierInvoiceStatus;
  notes?: string | null;
}

export async function createSupplierInvoice(input: CreateSupplierInvoiceInput): Promise<SupplierInvoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('supplier_invoices')
    .insert({
      po_id: input.poId,
      supplier_id: input.supplierId,
      number: input.number ?? null,
      invoice_date: input.invoiceDate ?? null,
      amount: input.amount ?? null,
      status: input.status ?? 'unmatched',
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToSupplierInvoice(data as SupplierInvoiceRow);
}

/** Sum of a PO's ordered lines (qty × unit cost) — for the invoice match check. */
export function poOrderedTotal(items: PurchaseOrderItem[]): number {
  return Math.round(items.reduce((s, i) => s + i.qtyOrdered * (i.unitCost ?? 0), 0) * 100) / 100;
}

// ─── Wholesaler invoice lines (P7.1b, migration 104) ────────────────────────────
// Line-level ingestion on top of the mig-89 header: the upload screen parses a
// CSV (lib/purchasing/invoiceCsv), plans a match (lib/purchasing/invoiceMatch),
// and this section supplies the matcher's inputs + persists the confirmed plan.

/** The supplier's learned code memory (mig 98) — feeds the matcher's pack-factor
 *  resolution. Missing table (pre-mig-98) degrades to "no memory". */
/** Error codes meaning "the table isn't there" (pre-migration): PostgREST's
 *  schema-cache misses (PGRST205, and PGRST200 for a missing embed) plus raw
 *  Postgres 42P01. ONLY these may degrade to empty — a transient network/5xx
 *  error must throw, or a blip would silently switch off the over-invoice guard
 *  and drop learned pack factors for the whole preview. */
function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST200';
}

export async function listSupplierSkusForSupplier(supplierId: string): Promise<SupplierSkuEntry[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('supplier_skus')
    .select('supplier_sku, material_id, qty_multiplier')
    .eq('supplier_id', supplierId);
  if (error) {
    if (isMissingRelation(error)) return []; // pre-mig-98 → no memory
    throw error;
  }
  return (data ?? []).map((r) => ({
    supplierSku: String((r as { supplier_sku: string }).supplier_sku),
    materialId: String((r as { material_id: string }).material_id),
    qtyMultiplier: Number((r as { qty_multiplier: number }).qty_multiplier) || 1,
  }));
}

/** The "remember this code" teach write — upserts one supplier-SKU mapping.
 *  Substitutions deliberately do NOT call this (one-delivery-only). */
export async function upsertSupplierSku(
  supplierId: string,
  supplierSku: string,
  materialId: string,
  qtyMultiplier = 1,
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase
    .from('supplier_skus')
    .upsert(
      {
        supplier_id: supplierId,
        supplier_sku: supplierSku,
        material_id: materialId,
        qty_multiplier: qtyMultiplier,
        learned_by: uid,
      },
      { onConflict: 'supplier_id,supplier_sku' },
    );
  if (error) throw error;
}

/** Statuses that count a PO as "open" for invoice matching — ordered but not
 *  finished. Suggested (never sent) / received / cancelled don't take invoices. */
const OPEN_PO_STATUSES: POStatus[] = ['draft', 'sent', 'partial'];

/** The matcher's PO-side input: every open PO line for this supplier, with our
 *  material SKU/name and — crucially — how much of each line has ALREADY been
 *  invoiced (Σ persisted allocated lines), so part shipments and re-uploads can
 *  never over-invoice. Pre-mig-104 the lines table is missing: the sums read as
 *  0, which is safe because the confirm WRITE fails loudly before any damage. */
export async function listOpenPoItemsForSupplier(supplierId: string): Promise<OpenPoItem[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, number, status, purchase_order_items(id, material_id, description, qty_ordered, unit_cost, sort_order), suppliers(name)')
    .eq('supplier_id', supplierId)
    .in('status', OPEN_PO_STATUSES)
    .order('created_at', { ascending: true });
  if (error) throw error;

  type Raw = {
    id: string; number: string;
    purchase_order_items: Array<{ id: string; material_id: string | null; description: string | null; qty_ordered: number; unit_cost: number | null; sort_order: number }>;
  };
  const pos = (data ?? []) as unknown as Raw[];

  // Our-material metadata for sku/name (the matcher's our-SKU + fuzzy steps).
  const materialIds = [...new Set(pos.flatMap((p) => p.purchase_order_items.map((i) => i.material_id)).filter((x): x is string => !!x))];
  const matMeta = new Map<string, { sku: string | null; name: string | null }>();
  if (materialIds.length > 0) {
    const { data: mats } = await supabase.from('materials').select('id, sku, name').in('id', materialIds);
    for (const m of (mats ?? []) as Array<{ id: string; sku: string | null; name: string | null }>) {
      matMeta.set(m.id, { sku: m.sku, name: m.name });
    }
  }

  // Already-invoiced quantities per PO line (allocated lines carry po_item_id;
  // freight/credit/overflow rows don't). ONLY a missing table (pre-mig-104)
  // degrades to zeros — the confirm write fails loudly first in that state.
  // Any OTHER read error throws: a transient failure silently reading as
  // "never invoiced" would disable the over-invoice guard for the preview.
  const poItemIds = pos.flatMap((p) => p.purchase_order_items.map((i) => i.id));
  const invoicedSoFar = new Map<string, number>();
  if (poItemIds.length > 0) {
    const { data: lines, error: linesErr } = await supabase
      .from('supplier_invoice_lines')
      .select('po_item_id, qty')
      .in('po_item_id', poItemIds);
    if (linesErr && !isMissingRelation(linesErr)) throw linesErr;
    if (!linesErr) {
      for (const l of (lines ?? []) as Array<{ po_item_id: string | null; qty: number | null }>) {
        if (!l.po_item_id || l.qty == null) continue;
        invoicedSoFar.set(l.po_item_id, (invoicedSoFar.get(l.po_item_id) ?? 0) + Number(l.qty));
      }
    }
  }

  const out: OpenPoItem[] = [];
  for (const p of pos) {
    for (const i of [...p.purchase_order_items].sort((a, b) => a.sort_order - b.sort_order)) {
      if (!i.material_id) continue; // free-text lines can't be matched by material
      const meta = matMeta.get(i.material_id);
      out.push({
        poItemId: i.id,
        poId: p.id,
        poNumber: p.number,
        materialId: i.material_id,
        sku: meta?.sku ?? null,
        name: meta?.name ?? i.description,
        qtyOrdered: Number(i.qty_ordered),
        qtyInvoicedSoFar: Math.round((invoicedSoFar.get(i.id) ?? 0) * 100) / 100,
        unitCost: i.unit_cost != null ? Number(i.unit_cost) : 0,
      });
    }
  }
  return out;
}

export interface ConfirmInvoicePlanInput {
  supplierId: string;
  number: string;
  invoiceDate: string | null;
  /** Header amount ex-GST as typed from the paper invoice. */
  subtotalExGst: number;
  gstAmount: number | null;
  notes?: string | null;
  /** The reviewed plan lines (manual fixes applied). */
  lines: MatchedInvoiceLine[];
}

/** Persist a confirmed match plan: header + every line with its match status.
 *  Header status: every line matched (or accepted freight) → 'matched'; any open
 *  variance/unmatched → 'disputed'. The mig-104 unique index refuses duplicate
 *  invoice numbers per supplier; surfaced as a friendly error. No client-side
 *  transaction exists, so a failed line insert rolls the header back manually. */
export async function createSupplierInvoiceWithLines(input: ConfirmInvoicePlanInput): Promise<SupplierInvoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;

  // Freight never disputes an invoice; variances, unmatched lines, and credit
  // lines (returns needing manual reconciliation) do.
  const hasProblem = input.lines.some((l) =>
    l.matchStatus === 'unmatched' || l.matchStatus === 'price_variance' || l.matchStatus === 'qty_variance' || l.matchStatus === 'credit');

  const { data: header, error: headErr } = await supabase
    .from('supplier_invoices')
    .insert({
      supplier_id: input.supplierId,
      po_id: null, // set after we know the dominant PO (needs the po_item → po map)
      number: input.number,
      invoice_date: input.invoiceDate,
      amount: input.subtotalExGst,
      subtotal_ex_gst: input.subtotalExGst,
      gst_amount: input.gstAmount,
      status: hasProblem ? 'disputed' : 'matched',
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (headErr) {
    if ((headErr as { code?: string }).code === '23505') {
      throw new Error(`Invoice ${input.number} is already recorded for this supplier.`);
    }
    if ((headErr as { code?: string }).code === 'PGRST204') {
      throw new Error('The invoice-lines upgrade (migration 104) is not applied yet — apply it in Supabase, then retry.');
    }
    throw headErr;
  }
  const invoice = rowToSupplierInvoice(header as SupplierInvoiceRow);

  const rows = input.lines.map((l, idx) => ({
    invoice_id: invoice.id,
    po_item_id: l.poItemId,
    material_id: l.materialId,
    supplier_sku: l.supplierSku,
    description: l.description,
    qty: l.qty,
    unit_price: l.unitPrice,
    line_total: l.lineTotal,
    match_status: l.matchStatus,
    note: l.note,
    sort_order: idx,
  }));
  const { error: linesErr } = await supabase.from('supplier_invoice_lines').insert(rows);
  if (linesErr) {
    // Manual rollback — a header without its lines would silently pass future
    // duplicate checks while carrying no allocation records. The delete itself
    // is CHECKED: if it also fails (same outage), the stranded header must be
    // named NOW — otherwise every retry hits the duplicate guard with a
    // misleading "already recorded" while no allocation lines exist.
    const { error: rollbackErr } = await supabase.from('supplier_invoices').delete().eq('id', invoice.id);
    if (rollbackErr) {
      throw new Error(
        `Invoice ${input.number} was recorded WITHOUT its lines (the save failed midway and cleanup also failed). ` +
        `Delete invoice ${input.number} for this supplier, then re-import.`,
      );
    }
    if (isMissingRelation(linesErr)) {
      throw new Error('The invoice-lines table (migration 104) is missing — apply it in Supabase, then retry.');
    }
    throw linesErr;
  }

  // Primary-PO header pointer = the PO with the most allocated lines (real
  // attribution lives per line; best-effort, failure is non-fatal).
  try {
    const itemIds = [...new Set(input.lines.map((l) => l.poItemId).filter((x): x is string => !!x))];
    if (itemIds.length > 0) {
      const { data: items } = await supabase.from('purchase_order_items').select('id, po_id').in('id', itemIds);
      const poIdByItem = new Map<string, string>();
      for (const it of (items ?? []) as Array<{ id: string; po_id: string }>) poIdByItem.set(it.id, it.po_id);
      const counts = new Map<string, number>();
      for (const l of input.lines) {
        const poId = l.poItemId ? poIdByItem.get(l.poItemId) : undefined;
        if (poId) counts.set(poId, (counts.get(poId) ?? 0) + 1);
      }
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (dominant) await supabase.from('supplier_invoices').update({ po_id: dominant }).eq('id', invoice.id);
    }
  } catch { /* pointer only — the per-line links are authoritative */ }

  return invoice;
}
