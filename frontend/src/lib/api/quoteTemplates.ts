// ─────────────────────────────────────────────────────────────────────────────
// lib/api/quoteTemplates.ts — CRUD for quote templates (Sim-Pro-style "Take-Off"
// job bundles, migration 78) + applyTemplateToQuote.
//
// A template composes materials + prebuilds + labour for a job type. Applying it
// to a quote reuses the existing quote-item adders (commercial.ts), so the lines
// land identically to manual entry (markup, cost snapshot, totals all handled).
//
// Conventions mirror commercial.ts / materials.ts: snake_case Row + camelCase
// domain + rowToX mappers; writes throw; reads return [] / null when Supabase is
// not configured.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';
import {
  addQuoteItemFromMaterial,
  addQuoteItemFromPrebuild,
  addQuoteItemLabour,
} from './commercial';

const NOT_CONFIGURED = new Error('Supabase is not configured.');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuoteTemplateItemKind = 'material' | 'prebuild' | 'labour';

interface QuoteTemplateRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface QuoteTemplateItemRow {
  id: string;
  template_id: string;
  kind: string;
  material_id: string | null;
  prebuild_id: string | null;
  role: string | null;
  qty: number;
  sort_order: number;
}

export interface QuoteTemplate {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteTemplateItem {
  id: string;
  templateId: string;
  kind: QuoteTemplateItemKind;
  materialId: string | null;
  prebuildId: string | null;
  role: string | null;
  qty: number;
  sortOrder: number;
}

export interface QuoteTemplateWithItems extends QuoteTemplate {
  items: QuoteTemplateItem[];
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToTemplate(r: QuoteTemplateRow): QuoteTemplate {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToTemplateItem(r: QuoteTemplateItemRow): QuoteTemplateItem {
  return {
    id: r.id,
    templateId: r.template_id,
    kind: (r.kind as QuoteTemplateItemKind) ?? 'material',
    materialId: r.material_id,
    prebuildId: r.prebuild_id,
    role: r.role,
    qty: Number(r.qty),
    sortOrder: r.sort_order,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listTemplates(includeInactive = false): Promise<QuoteTemplate[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('quote_templates').select('*');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToTemplate(r as QuoteTemplateRow));
}

export async function getTemplateWithItems(id: string): Promise<QuoteTemplateWithItems | null> {
  if (!supabaseConfigured()) return null;
  const [tplResult, itemsResult] = await Promise.all([
    supabase.from('quote_templates').select('*').eq('id', id).maybeSingle(),
    supabase.from('quote_template_items').select('*').eq('template_id', id).order('sort_order', { ascending: true }),
  ]);
  if (tplResult.error) throw tplResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (!tplResult.data) return null;
  const items = (itemsResult.data ?? []).map((r) => rowToTemplateItem(r as QuoteTemplateItemRow));
  return { ...rowToTemplate(tplResult.data as QuoteTemplateRow), items };
}

// ---------------------------------------------------------------------------
// Write — templates
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  name: string;
  category?: string | null;
  description?: string | null;
}

export async function createTemplate(input: CreateTemplateInput): Promise<QuoteTemplate> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('quote_templates')
    .insert({
      name: input.name,
      category: input.category ?? null,
      description: input.description ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToTemplate(data as QuoteTemplateRow);
}

export interface UpdateTemplateInput {
  name?: string;
  category?: string | null;
  description?: string | null;
}

export async function updateTemplate(id: string, patch: UpdateTemplateInput): Promise<QuoteTemplate> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.description !== undefined) update.description = patch.description;
  const { data, error } = await supabase
    .from('quote_templates')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToTemplate(data as QuoteTemplateRow);
}

export async function setTemplateActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_templates').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_templates').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Write — template items
// ---------------------------------------------------------------------------

export interface AddTemplateItemInput {
  templateId: string;
  kind: QuoteTemplateItemKind;
  materialId?: string | null;
  prebuildId?: string | null;
  role?: string | null;
  qty: number;
  sortOrder?: number;
}

export async function addTemplateItem(input: AddTemplateItemInput): Promise<QuoteTemplateItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('quote_template_items')
    .insert({
      template_id: input.templateId,
      kind: input.kind,
      material_id: input.materialId ?? null,
      prebuild_id: input.prebuildId ?? null,
      role: input.role ?? null,
      qty: input.qty,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToTemplateItem(data as QuoteTemplateItemRow);
}

export async function updateTemplateItem(
  id: string,
  patch: { qty?: number; sortOrder?: number },
): Promise<QuoteTemplateItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.qty !== undefined) update.qty = patch.qty;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase
    .from('quote_template_items')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToTemplateItem(data as QuoteTemplateItemRow);
}

export async function removeTemplateItem(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_template_items').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Apply a template to a quote — reuses the quote-item adders
// ---------------------------------------------------------------------------

/**
 * Drop every line of a template onto a quote. Materials/prebuilds/labour each go
 * through their existing adder, so markup, cost snapshots, and totals are handled
 * identically to manual entry. Returns the count of lines added.
 */
export async function applyTemplateToQuote(quoteId: string, templateId: string): Promise<number> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const tpl = await getTemplateWithItems(templateId);
  if (!tpl) throw new Error('Template not found: ' + templateId);

  let added = 0;
  // Sequential (not parallel): each adder recomputes the quote totals, and we want
  // a stable sort_order matching the template order.
  for (const item of tpl.items) {
    if (item.kind === 'material' && item.materialId) {
      await addQuoteItemFromMaterial(quoteId, item.materialId, item.qty || 1);
      added += 1;
    } else if (item.kind === 'prebuild' && item.prebuildId) {
      const rows = await addQuoteItemFromPrebuild(quoteId, item.prebuildId);
      added += rows.length;
    } else if (item.kind === 'labour' && item.role) {
      await addQuoteItemLabour(quoteId, item.role, item.qty || 0);
      added += 1;
    }
  }
  return added;
}
