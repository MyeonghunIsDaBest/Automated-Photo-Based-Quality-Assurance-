// ─────────────────────────────────────────────────────────────────────────────
// lib/api/materials.ts — Typed CRUD helpers for the materials catalogue domain.
//
// Tables: materials, prebuilds, prebuild_items, material_tags,
//         material_candidates  (migration 64).
//
// All write functions throw on error. Read functions return [] / null when
// Supabase is not configured so the UI can render empty states gracefully.
//
// approveCandidate(candidateId, materialId) — accepts an EXISTING material id
// (created by the caller via createMaterial before calling this). Only updates
// the candidate row (status "approved" + approved_material_id). If that update
// fails, returns { linkError } — non-throwing — so the caller can surface it.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';
import type { CsvMaterialRow, ImportPlan } from '../catalogue/csv';
import type { PrebuildImportPlan } from '../catalogue/prebuildCsv';

// ---------------------------------------------------------------------------
// Error sentinel
// ---------------------------------------------------------------------------

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

// ---------------------------------------------------------------------------
// ILIKE wildcard escaping
//
// PostgREST uses ILIKE under the hood for .ilike(). The special chars % _ \
// must be escaped in the user-supplied string.
//
// Additionally, * , ( ) have structural meaning inside PostgREST .or() filter
// strings and cannot be safely quoted within them — stripping them is simpler
// and correct (users don't intend regex/filter syntax in a material name
// search). Strip them before escaping ILIKE chars.
// ---------------------------------------------------------------------------

function escapeIlikePattern(raw: string): string {
  // Strip PostgREST .or() structural chars: * , ( )
  const stripped = raw.replace(/[*,()/]/g, '');
  return stripped
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

// ---------------------------------------------------------------------------
// Row types (snake_case — matches Supabase schema)
// ---------------------------------------------------------------------------

interface MaterialRow {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  cost_price: number | null;
  sell_price: number | null;
  tags: string[];
  category: string | null;
  subcategory: string | null;
  is_favourite: boolean;
  is_stock_item: boolean;
  stock_on_hand: number;
  supplier_id: string | null;
  is_active: boolean;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PrebuildRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  is_favourite: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PrebuildItemRow {
  id: string;
  prebuild_id: string;
  material_id: string;
  qty: number;
  sort_order: number;
}

interface MaterialTagRow {
  id: string;
  name: string;
  created_at: string;
}

interface MaterialCandidateRow {
  id: string;
  raw_text: string;
  occurrences: number;
  last_seen: string | null;
  status: string;
  approved_material_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Domain types (camelCase — used by the rest of the app)
// ---------------------------------------------------------------------------

export interface Material {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  costPrice: number | null;
  sellPrice: number | null;
  tags: string[];
  /** Simpro "Group" — top-level catalogue grouping (free text). */
  category: string | null;
  /** Simpro "Subgroup" — second-level grouping within a category (free text). */
  subcategory: string | null;
  /** Starred for the Catalogue tab's Favourites group / filter (org-wide). */
  isFavourite: boolean;
  /** Held in stock — surfaced on the quote's Stock tab (Simpro). */
  isStockItem: boolean;
  /** Quantity currently on hand (single-location v1). */
  stockOnHand: number;
  supplierId: string | null;
  isActive: boolean;
  source: 'manual' | 'csv' | 'mined';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Prebuild {
  id: string;
  name: string;
  description: string | null;
  /** Simpro "Group" — top-level prebuild grouping (free text). */
  category: string | null;
  /** Simpro "Subgroup" — second-level grouping within a category (free text). */
  subcategory: string | null;
  /** Starred for the Pre-Builds tab's Favourites group / filter (org-wide). */
  isFavourite: boolean;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Item count — only present when fetched via listPrebuilds (embed count). */
  itemsCount?: number;
}

/** A prebuild plus its rolled-up Material Cost + Sell Price (from listPrebuildsPriced). */
export interface PrebuildPriced extends Prebuild {
  materialCost: number;
  sellPrice: number;
}

export interface PrebuildItem {
  id: string;
  prebuildId: string;
  materialId: string;
  qty: number;
  sortOrder: number;
}

export interface PrebuildWithItems extends Prebuild {
  items: PrebuildItem[];
}

export interface MaterialTag {
  id: string;
  name: string;
  createdAt: string;
}

export type CandidateStatus = 'pending' | 'approved' | 'dismissed';

export interface MaterialCandidate {
  id: string;
  rawText: string;
  occurrences: number;
  lastSeen: string | null;
  status: CandidateStatus;
  approvedMaterialId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateMaterialInput {
  sku?: string | null;
  name: string;
  description?: string | null;
  unit: string;
  costPrice?: number | null;
  sellPrice?: number | null;
  tags?: string[];
  category?: string | null;
  subcategory?: string | null;
  isFavourite?: boolean;
  isStockItem?: boolean;
  stockOnHand?: number;
  supplierId?: string | null;
  source?: 'manual' | 'csv' | 'mined';
}

export interface UpdateMaterialInput {
  sku?: string | null;
  name?: string;
  description?: string | null;
  unit?: string;
  costPrice?: number | null;
  sellPrice?: number | null;
  tags?: string[];
  category?: string | null;
  subcategory?: string | null;
  isFavourite?: boolean;
  isStockItem?: boolean;
  stockOnHand?: number;
  supplierId?: string | null;
}

export interface CreatePrebuildInput {
  name: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  isFavourite?: boolean;
}

export interface UpdatePrebuildInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  isFavourite?: boolean;
}

export interface CreatePrebuildItemInput {
  prebuildId: string;
  materialId: string;
  qty: number;
  sortOrder?: number;
}

export interface UpdatePrebuildItemInput {
  qty?: number;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToMaterial(r: MaterialRow): Material {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    unit: r.unit,
    costPrice: r.cost_price,
    sellPrice: r.sell_price,
    tags: r.tags,
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
    isFavourite: r.is_favourite ?? false,
    isStockItem: r.is_stock_item ?? false,
    stockOnHand: r.stock_on_hand != null ? Number(r.stock_on_hand) : 0,
    supplierId: r.supplier_id,
    isActive: r.is_active,
    source: r.source as 'manual' | 'csv' | 'mined',
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToPrebuild(r: PrebuildRow & { prebuild_items?: Array<{ count: number }> }): Prebuild {
  const embedCount = r.prebuild_items?.[0]?.count;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    subcategory: r.subcategory ?? null,
    isFavourite: r.is_favourite ?? false,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(embedCount !== undefined && { itemsCount: embedCount }),
  };
}

function rowToPrebuildItem(r: PrebuildItemRow): PrebuildItem {
  return {
    id: r.id,
    prebuildId: r.prebuild_id,
    materialId: r.material_id,
    qty: r.qty,
    sortOrder: r.sort_order,
  };
}

function rowToTag(r: MaterialTagRow): MaterialTag {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
  };
}

function rowToCandidate(r: MaterialCandidateRow): MaterialCandidate {
  return {
    id: r.id,
    rawText: r.raw_text,
    occurrences: r.occurrences,
    lastSeen: r.last_seen,
    status: r.status as CandidateStatus,
    approvedMaterialId: r.approved_material_id,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Materials — read
// ---------------------------------------------------------------------------

export async function listMaterials(filters?: {
  search?: string;
  tag?: string;
  includeInactive?: boolean;
}): Promise<Material[]> {
  if (!supabaseConfigured()) return [];

  let q = supabase.from('materials').select('*');

  if (!(filters?.includeInactive)) {
    q = q.eq('is_active', true);
  }

  if (filters?.search && filters.search.trim() !== '') {
    const escaped = escapeIlikePattern(filters.search.trim());
    const pattern = '%' + escaped + '%';
    q = q.or('name.ilike.' + pattern + ',sku.ilike.' + pattern);
  }

  if (filters?.tag && filters.tag.trim() !== '') {
    q = q.contains('tags', [filters.tag.trim()]);
  }

  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToMaterial(r as MaterialRow));
}

export async function getMaterialById(id: string): Promise<Material | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToMaterial(data as MaterialRow) : null;
}

// ---------------------------------------------------------------------------
// Materials — write
// ---------------------------------------------------------------------------

export async function createMaterial(input: CreateMaterialInput): Promise<Material> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('materials')
    .insert({
      sku: input.sku ?? null,
      name: input.name,
      description: input.description ?? null,
      unit: input.unit,
      cost_price: input.costPrice ?? null,
      sell_price: input.sellPrice ?? null,
      tags: input.tags ?? [],
      category: input.category ?? null,
      subcategory: input.subcategory ?? null,
      is_favourite: input.isFavourite ?? false,
      is_stock_item: input.isStockItem ?? false,
      stock_on_hand: input.stockOnHand ?? 0,
      supplier_id: input.supplierId ?? null,
      source: input.source ?? 'manual',
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToMaterial(data as MaterialRow);
}

export async function updateMaterial(
  id: string,
  patch: UpdateMaterialInput,
): Promise<Material> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('materials')
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.sku !== undefined && { sku: patch.sku }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.unit !== undefined && { unit: patch.unit }),
      ...(patch.costPrice !== undefined && { cost_price: patch.costPrice }),
      ...(patch.sellPrice !== undefined && { sell_price: patch.sellPrice }),
      ...(patch.tags !== undefined && { tags: patch.tags }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.subcategory !== undefined && { subcategory: patch.subcategory }),
      ...(patch.isFavourite !== undefined && { is_favourite: patch.isFavourite }),
      ...(patch.isStockItem !== undefined && { is_stock_item: patch.isStockItem }),
      ...(patch.stockOnHand !== undefined && { stock_on_hand: patch.stockOnHand }),
      ...(patch.supplierId !== undefined && { supplier_id: patch.supplierId }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToMaterial(data as MaterialRow);
}

export async function setMaterialActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('materials')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Permanently delete a material. Distinct from setMaterialActive(false), which
 * only archives it (reversible). A material referenced by a prebuild item is
 * protected by an ON DELETE RESTRICT foreign key — Postgres raises 23503; we
 * translate that into a friendly message pointing the user at deactivate.
 */
export async function deleteMaterial(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('materials').delete().eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23503') {
      throw new Error(
        "This material is used by a prebuild, so it can't be deleted. Remove it from the prebuild first, or deactivate the material instead.",
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Prebuilds — read
// ---------------------------------------------------------------------------

export async function listPrebuilds(includeInactive = false): Promise<Prebuild[]> {
  if (!supabaseConfigured()) return [];
  // Embed prebuild_items(count) to get item counts in one query without
  // fetching all item rows.
  let q = supabase.from('prebuilds').select('*, prebuild_items(count)');
  if (!includeInactive) {
    q = q.eq('is_active', true);
  }
  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToPrebuild(r as PrebuildRow & { prebuild_items?: Array<{ count: number }> }));
}

export async function getPrebuildWithItems(id: string): Promise<PrebuildWithItems | null> {
  if (!supabaseConfigured()) return null;
  const [prebuildResult, itemsResult] = await Promise.all([
    supabase.from('prebuilds').select('*').eq('id', id).maybeSingle(),
    supabase.from('prebuild_items').select('*').eq('prebuild_id', id).order('sort_order', { ascending: true }),
  ]);
  if (prebuildResult.error) throw prebuildResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (!prebuildResult.data) return null;
  return {
    ...rowToPrebuild(prebuildResult.data as PrebuildRow),
    items: (itemsResult.data ?? []).map((r) => rowToPrebuildItem(r as PrebuildItemRow)),
  };
}

/**
 * List prebuilds with their rolled-up Material Cost + Sell Price, in one embedded
 * query (no per-prebuild fetch). Sell mirrors the `materialSell` rule used at
 * add-time: a material's catalogue sell price if set, else cost × (1 + markup).
 * `materialMarkup` is passed in by the caller (the office-wide default material
 * markup from commercial settings) to avoid a materials.ts -> commercial.ts cycle.
 */
export async function listPrebuildsPriced(
  materialMarkup: number,
  includeInactive = false,
): Promise<PrebuildPriced[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase
    .from('prebuilds')
    .select('*, prebuild_items(qty, materials(cost_price, sell_price))');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;

  type PricedRow = PrebuildRow & {
    prebuild_items?: Array<{
      qty: number;
      materials: { cost_price: number | null; sell_price: number | null } | null;
    }>;
  };

  return (data ?? []).map((raw) => {
    const r = raw as PricedRow;
    const items = r.prebuild_items ?? [];
    let materialCost = 0;
    let sellPrice = 0;
    for (const it of items) {
      const qty = Number(it.qty) || 0;
      const cost = it.materials?.cost_price ?? null;
      const sell = it.materials?.sell_price ?? null;
      materialCost += qty * (cost ?? 0);
      const unitSell = sell != null ? sell : cost != null ? cost * (1 + materialMarkup) : 0;
      sellPrice += qty * unitSell;
    }
    return {
      ...rowToPrebuild(r as PrebuildRow),
      itemsCount: items.length,
      materialCost: Math.round(materialCost * 100) / 100,
      sellPrice: Math.round(sellPrice * 100) / 100,
    };
  });
}

// ---------------------------------------------------------------------------
// Prebuilds — write
// ---------------------------------------------------------------------------

export async function createPrebuild(input: CreatePrebuildInput): Promise<Prebuild> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('prebuilds')
    .insert({
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
      subcategory: input.subcategory ?? null,
      is_favourite: input.isFavourite ?? false,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToPrebuild(data as PrebuildRow);
}

export async function updatePrebuild(
  id: string,
  patch: UpdatePrebuildInput,
): Promise<Prebuild> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('prebuilds')
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.subcategory !== undefined && { subcategory: patch.subcategory }),
      ...(patch.isFavourite !== undefined && { is_favourite: patch.isFavourite }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToPrebuild(data as PrebuildRow);
}

export async function setPrebuildActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('prebuilds')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Permanently delete a prebuild. Its prebuild_items cascade away (ON DELETE
 * CASCADE); any quote template that referenced it has that reference nulled
 * (ON DELETE SET NULL), so deletion never fails on a foreign key here.
 * Distinct from setPrebuildActive(false) (reversible archive).
 */
export async function deletePrebuild(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('prebuilds').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Prebuild items
// ---------------------------------------------------------------------------

export async function addPrebuildItem(input: CreatePrebuildItemInput): Promise<PrebuildItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('prebuild_items')
    .insert({
      prebuild_id: input.prebuildId,
      material_id: input.materialId,
      qty: input.qty,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToPrebuildItem(data as PrebuildItemRow);
}

export async function updatePrebuildItem(
  id: string,
  patch: UpdatePrebuildItemInput,
): Promise<PrebuildItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('prebuild_items')
    .update({
      ...(patch.qty !== undefined && { qty: patch.qty }),
      ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToPrebuildItem(data as PrebuildItemRow);
}

export async function removePrebuildItem(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('prebuild_items').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function listTags(): Promise<MaterialTag[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('material_tags')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToTag(r as MaterialTagRow));
}

export async function createTag(name: string): Promise<MaterialTag> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('material_tags')
    .insert({ name })
    .select('*')
    .single();
  if (error) throw error;
  return rowToTag(data as MaterialTagRow);
}

export async function deleteTag(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('material_tags').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export async function listCandidates(status: CandidateStatus): Promise<MaterialCandidate[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('material_candidates')
    .select('*')
    .eq('status', status)
    .order('occurrences', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToCandidate(r as MaterialCandidateRow));
}

/**
 * Approve a candidate by linking it to an EXISTING material (already created
 * by the caller). Only updates the candidate row: status → "approved",
 * approved_material_id → materialId. If that update fails the error is
 * returned in `linkError` (non-throwing) so the caller can surface it without
 * treating the already-created material as lost.
 */
export async function approveCandidate(
  candidateId: string,
  materialId: string,
): Promise<{ linkError: string | null }> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  const { error: linkErr } = await supabase
    .from('material_candidates')
    .update({ status: 'approved', approved_material_id: materialId })
    .eq('id', candidateId);

  return { linkError: linkErr ? linkErr.message : null };
}

export async function dismissCandidate(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('material_candidates')
    .update({ status: 'dismissed' })
    .eq('id', id);
  if (error) throw error;
}

export interface UpdateCandidateInput {
  /** Edit the mined text (cleanup before approving). raw_text is UNIQUE — a
   *  collision with another candidate raises 23505, surfaced to the caller. */
  rawText?: string;
  /** Move between pending / approved / dismissed (e.g. restore a dismissed row
   *  back to pending). */
  status?: CandidateStatus;
}

/** Edit a candidate's text and/or status. Used by the Suggestions inbox to
 *  clean up mined text before approving and to restore dismissed rows. */
export async function updateCandidate(
  id: string,
  patch: UpdateCandidateInput,
): Promise<MaterialCandidate> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('material_candidates')
    .update({
      ...(patch.rawText !== undefined && { raw_text: patch.rawText }),
      ...(patch.status !== undefined && { status: patch.status }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('Another suggestion already has that exact text.');
    }
    throw error;
  }
  return rowToCandidate(data as MaterialCandidateRow);
}

// ---------------------------------------------------------------------------
// Bulk import runner
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function csvRowToInsert(row: CsvMaterialRow, uid: string | null): Record<string, unknown> {
  return {
    sku: row.sku,
    name: row.name,
    description: row.description,
    unit: row.unit ?? 'ea',
    cost_price: row.costPrice,
    sell_price: row.sellPrice,
    tags: row.tags,
    // Optional P3 columns — only sent when the file provided them, so DB
    // defaults apply otherwise (and old 7-column files behave exactly as before).
    ...(row.category !== null && { category: row.category }),
    ...(row.subcategory !== null && { subcategory: row.subcategory }),
    ...(row.isStockItem !== null && { is_stock_item: row.isStockItem }),
    ...(row.isFavourite !== null && { is_favourite: row.isFavourite }),
    source: 'csv',
    created_by: uid,
  };
}

function csvRowToUpdate(row: CsvMaterialRow): Record<string, unknown> {
  return {
    sku: row.sku,
    name: row.name,
    // Blank/absent cells never clobber what's already on the material — a CSV
    // update can only SET values, never clear them (clear in the app instead).
    // This makes slim price-update exports safe: blank description/unit/sell
    // cells leave those fields exactly as they are.
    ...(row.description !== null && { description: row.description }),
    ...(row.unit !== null && { unit: row.unit }),
    ...(row.costPrice !== null && { cost_price: row.costPrice }),
    ...(row.sellPrice !== null && { sell_price: row.sellPrice }),
    ...(row.tags.length > 0 && { tags: row.tags }),
    ...(row.category !== null && { category: row.category }),
    ...(row.subcategory !== null && { subcategory: row.subcategory }),
    ...(row.isStockItem !== null && { is_stock_item: row.isStockItem }),
    ...(row.isFavourite !== null && { is_favourite: row.isFavourite }),
  };
}

export async function runImport(
  plan: ImportPlan,
): Promise<{
  added: number;
  updated: number;
  skipped: number;
  failed: { count: number; firstError: string | null };
}> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;

  let added = 0;
  let updated = 0;
  let failCount = 0;
  let firstError: string | null = null;

  function recordFailure(err: unknown) {
    failCount += 1;
    if (firstError === null) {
      firstError = err instanceof Error ? err.message : String(err);
    }
  }

  // Inserts — chunked; failures are caught per-chunk and accumulated
  for (const batch of chunk(plan.adds, CHUNK_SIZE)) {
    const { error } = await supabase
      .from('materials')
      .insert(batch.map((row) => csvRowToInsert(row, uid)));
    if (error) {
      recordFailure(error);
      // Continue — the next chunk may succeed
    } else {
      added += batch.length;
    }
  }

  // Updates — individual (each has a known id); failures accumulated
  for (const batch of chunk(plan.updates, CHUNK_SIZE)) {
    for (const { id, row } of batch) {
      const { error } = await supabase
        .from('materials')
        .update(csvRowToUpdate(row))
        .eq('id', id);
      if (error) {
        recordFailure(error);
      } else {
        updated += 1;
      }
    }
  }

  return { added, updated, skipped: plan.skips.length, failed: { count: failCount, firstError } };
}

/**
 * Execute a pre-build import plan (P3 pipeline): creates each planned pre-build
 * then its material lines in file order, via the same CRUD the editor uses.
 * Sequential + per-prebuild error isolation: one bad assembly doesn't stop the
 * rest, and the report says exactly what landed.
 */
export async function runPrebuildImport(
  plan: PrebuildImportPlan,
): Promise<{ created: number; itemsAdded: number; failed: { count: number; firstError: string | null } }> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  let created = 0;
  let itemsAdded = 0;
  let failCount = 0;
  let firstError: string | null = null;

  for (const c of plan.creates) {
    let createdId: string | null = null;
    let lines = 0;
    try {
      const pb = await createPrebuild({
        name: c.prebuild.name,
        category: c.prebuild.category,
        subcategory: c.prebuild.subcategory,
        isFavourite: c.prebuild.isFavourite,
      });
      createdId = pb.id;
      for (let i = 0; i < c.items.length; i++) {
        await addPrebuildItem({ prebuildId: pb.id, materialId: c.items[i].materialId, qty: c.items[i].qty, sortOrder: i });
        lines += 1;
      }
      created += 1;
      itemsAdded += lines;
    } catch (ex) {
      failCount += 1;
      if (firstError === null) {
        const msg = ex instanceof Error ? ex.message : String(ex);
        firstError = `"${c.prebuild.name}": ${msg}`;
      }
      // All-or-nothing per assembly: a half-built prebuild would be skipped
      // by name on every retry yet misprice every quote that uses it. Roll
      // the header back (items cascade); best-effort — if even the delete
      // fails, the name-skip at least keeps retries from double-creating.
      if (createdId !== null) {
        try {
          await deletePrebuild(createdId);
        } catch {
          /* leave the failure counts as-is; nothing more we can do client-side */
        }
      }
    }
  }

  return { created, itemsAdded, failed: { count: failCount, firstError } };
}
