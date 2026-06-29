// ─────────────────────────────────────────────────────────────────────────────
// lib/api/customerAssets.ts — a customer's serviceable assets (migration 86) +
// the quote ↔ asset link.
//
// Used by the quote "Customer Assets" tab: list the customer's equipment
// (inverters, switchboards, A/C, EV chargers…), add/edit/remove them, and link
// the ones a quote relates to (quote_assets).
//
// House conventions: snake_case Row + camelCase domain + rowToX mappers; writes
// throw; reads return [] / null when Supabase is not configured.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';

const NOT_CONFIGURED = new Error('Supabase is not configured.');

interface CustomerAssetRow {
  id: string;
  customer_id: string;
  property_id: string | null;
  name: string;
  asset_type: string | null;
  make: string | null;
  model: string | null;
  serial: string | null;
  location: string | null;
  install_date: string | null;
  warranty_until: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerAsset {
  id: string;
  customerId: string;
  propertyId: string | null;
  name: string;
  assetType: string | null;
  make: string | null;
  model: string | null;
  serial: string | null;
  location: string | null;
  installDate: string | null;
  warrantyUntil: string | null;
  notes: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToAsset(r: CustomerAssetRow): CustomerAsset {
  return {
    id: r.id,
    customerId: r.customer_id,
    propertyId: r.property_id,
    name: r.name,
    assetType: r.asset_type,
    make: r.make,
    model: r.model,
    serial: r.serial,
    location: r.location,
    installDate: r.install_date,
    warrantyUntil: r.warranty_until,
    notes: r.notes,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Assets — read / write
// ---------------------------------------------------------------------------

export async function listCustomerAssets(customerId: string, includeInactive = false): Promise<CustomerAsset[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('customer_assets').select('*').eq('customer_id', customerId);
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToAsset(r as CustomerAssetRow));
}

export interface CreateAssetInput {
  customerId: string;
  propertyId?: string | null;
  name: string;
  assetType?: string | null;
  make?: string | null;
  model?: string | null;
  serial?: string | null;
  location?: string | null;
  installDate?: string | null;
  warrantyUntil?: string | null;
  notes?: string | null;
}

export async function createAsset(input: CreateAssetInput): Promise<CustomerAsset> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('customer_assets')
    .insert({
      customer_id: input.customerId,
      property_id: input.propertyId ?? null,
      name: input.name,
      asset_type: input.assetType ?? null,
      make: input.make ?? null,
      model: input.model ?? null,
      serial: input.serial ?? null,
      location: input.location ?? null,
      install_date: input.installDate ?? null,
      warranty_until: input.warrantyUntil ?? null,
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToAsset(data as CustomerAssetRow);
}

export interface UpdateAssetInput {
  name?: string;
  assetType?: string | null;
  make?: string | null;
  model?: string | null;
  serial?: string | null;
  location?: string | null;
  installDate?: string | null;
  warrantyUntil?: string | null;
  notes?: string | null;
}

export async function updateAsset(id: string, patch: UpdateAssetInput): Promise<CustomerAsset> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.assetType !== undefined) update.asset_type = patch.assetType;
  if (patch.make !== undefined) update.make = patch.make;
  if (patch.model !== undefined) update.model = patch.model;
  if (patch.serial !== undefined) update.serial = patch.serial;
  if (patch.location !== undefined) update.location = patch.location;
  if (patch.installDate !== undefined) update.install_date = patch.installDate;
  if (patch.warrantyUntil !== undefined) update.warranty_until = patch.warrantyUntil;
  if (patch.notes !== undefined) update.notes = patch.notes;
  const { data, error } = await supabase
    .from('customer_assets')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToAsset(data as CustomerAssetRow);
}

export async function deleteAsset(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('customer_assets').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Quote ↔ asset links
// ---------------------------------------------------------------------------

/** The ids of the assets linked to a quote. */
export async function listQuoteAssetIds(quoteId: string): Promise<string[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase.from('quote_assets').select('asset_id').eq('quote_id', quoteId);
  if (error) throw error;
  return (data ?? []).map((r) => (r as { asset_id: string }).asset_id);
}

export async function attachAsset(quoteId: string, assetId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  // Idempotent: ignore the unique(quote_id, asset_id) conflict if already linked.
  const { error } = await supabase
    .from('quote_assets')
    .upsert({ quote_id: quoteId, asset_id: assetId }, { onConflict: 'quote_id,asset_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function detachAsset(quoteId: string, assetId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_assets').delete().eq('quote_id', quoteId).eq('asset_id', assetId);
  if (error) throw error;
}
