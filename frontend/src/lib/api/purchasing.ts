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
import { getCompanyTotals } from './stock';

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
  let q = supabase.from('purchase_orders').select('*, suppliers(name), purchase_order_items(count)');
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.kind) q = q.eq('kind', filters.kind);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToPO(r as PORow));
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
 *  reach target. Drives the low-stock dashboard. */
export async function getLowStock(): Promise<LowStockItem[]> {
  if (!supabaseConfigured()) return [];
  const [totals, rules] = await Promise.all([getCompanyTotals(), listReorderRules()]);
  const totalById = new Map(totals.map((t) => [t.materialId, t]));
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
      supplierId: rule.supplierId,
      costPrice: t?.costPrice ?? null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
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
