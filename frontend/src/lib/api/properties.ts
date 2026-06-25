// Typed CRUD helpers for the `properties` table (Maintenance domain).
//
// All write functions throw on error. Read functions return [] / null when
// Supabase is not configured so the UI can render empty states gracefully.

import { supabase, supabaseConfigured } from '../supabase';

// ---------------------------------------------------------------------------
// Row (snake_case — matches Supabase schema)
// ---------------------------------------------------------------------------

interface PropertyRow {
  id: string;
  customer_id: string;
  name: string;
  address: string | null;
  suburb: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Domain type (camelCase — used by the rest of the app)
// ---------------------------------------------------------------------------

export interface Property {
  id: string;
  customerId: string;
  name: string;
  address: string | null;
  suburb: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function rowToProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    customerId: r.customer_id,
    name: r.name,
    address: r.address,
    suburb: r.suburb,
    notes: r.notes,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Error sentinel
// ---------------------------------------------------------------------------

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/** Returns every property across all customers, ordered by name.
 *  Used for global search (match customer by property) and "properties under care" count. */
export async function listAllProperties(): Promise<Property[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToProperty(r as PropertyRow));
}

/** Returns a single property by id, or null when missing / not configured. */
export async function getProperty(id: string): Promise<Property | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProperty(data as PropertyRow) : null;
}

/** Returns all properties for a customer (active + inactive). */
export async function listPropertiesForCustomer(customerId: string): Promise<Property[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('customer_id', customerId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToProperty(r as PropertyRow));
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export interface CreatePropertyInput {
  customerId: string;
  name: string;
  address?: string;
  suburb?: string;
  notes?: string;
}

export async function createProperty(input: CreatePropertyInput): Promise<Property> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('properties')
    .insert({
      customer_id: input.customerId,
      name: input.name,
      address: input.address ?? null,
      suburb: input.suburb ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToProperty(data as PropertyRow);
}

export interface UpdatePropertyInput {
  name?: string;
  address?: string | null;
  suburb?: string | null;
  notes?: string | null;
}

export async function updateProperty(
  id: string,
  patch: UpdatePropertyInput,
): Promise<Property> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('properties')
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.address !== undefined && { address: patch.address }),
      ...(patch.suburb !== undefined && { suburb: patch.suburb }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToProperty(data as PropertyRow);
}

export async function setPropertyActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('properties')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}
