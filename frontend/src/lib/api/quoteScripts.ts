// ─────────────────────────────────────────────────────────────────────────────
// lib/api/quoteScripts.ts — reusable Scope-of-Works text templates (migration 80).
//
// Manager-editable templates dropped into a quote's customer-facing Description
// via the editor's "Insert script" picker. Type-aware (any|service|project).
// House conventions: writes throw; reads return [] when unconfigured.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

export type QuoteScriptType = 'any' | 'service' | 'project';

interface QuoteScriptRow {
  id: string;
  name: string;
  quote_type: string;
  body: string;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteScript {
  id: string;
  name: string;
  quoteType: QuoteScriptType;
  body: string;
  sortOrder: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToScript(r: QuoteScriptRow): QuoteScript {
  return {
    id: r.id,
    name: r.name,
    quoteType: (r.quote_type as QuoteScriptType) ?? 'any',
    body: r.body,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateScriptInput {
  name: string;
  quoteType: QuoteScriptType;
  body: string;
  sortOrder?: number;
}

export interface UpdateScriptInput {
  name?: string;
  quoteType?: QuoteScriptType;
  body?: string;
  sortOrder?: number;
}

export async function listScripts(includeInactive = false): Promise<QuoteScript[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('quote_scripts').select('*');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q.order('sort_order', { ascending: true }).order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToScript(r as QuoteScriptRow));
}

export async function createScript(input: CreateScriptInput): Promise<QuoteScript> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('quote_scripts')
    .insert({
      name: input.name,
      quote_type: input.quoteType,
      body: input.body,
      sort_order: input.sortOrder ?? 0,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToScript(data as QuoteScriptRow);
}

export async function updateScript(id: string, patch: UpdateScriptInput): Promise<QuoteScript> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.quoteType !== undefined) update.quote_type = patch.quoteType;
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase
    .from('quote_scripts')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToScript(data as QuoteScriptRow);
}

export async function setScriptActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_scripts').update({ is_active: active }).eq('id', id);
  if (error) throw error;
}

export async function deleteScript(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_scripts').delete().eq('id', id);
  if (error) throw error;
}
