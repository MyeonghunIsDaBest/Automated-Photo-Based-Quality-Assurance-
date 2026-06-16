// Typed CRUD helpers for the `customers` table (Maintenance domain).
//
// All write functions throw on error. Read functions return [] / null when
// Supabase is not configured so the UI can render empty states gracefully.

import { supabase, supabaseConfigured } from '../supabase';

// ---------------------------------------------------------------------------
// Row (snake_case — matches Supabase schema)
// ---------------------------------------------------------------------------

interface CustomerRow {
  id: string;
  name: string;
  customer_type: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Domain type (camelCase — used by the rest of the app)
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  name: string;
  customerType: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function rowToCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    name: r.name,
    customerType: r.customer_type ?? null,
    primaryContactName: r.primary_contact_name,
    primaryContactEmail: r.primary_contact_email,
    phone: r.phone,
    notes: r.notes,
    isActive: r.is_active,
    createdBy: r.created_by,
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

export async function listCustomers(): Promise<Customer[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToCustomer(r as CustomerRow));
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCustomer(data as CustomerRow) : null;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export interface CreateCustomerInput {
  name: string;
  customerType?: string | null;
  primaryContactName?: string;
  primaryContactEmail?: string;
  phone?: string;
  notes?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: input.name,
      customer_type: input.customerType ?? null,
      primary_contact_name: input.primaryContactName ?? null,
      primary_contact_email: input.primaryContactEmail ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToCustomer(data as CustomerRow);
}

export interface UpdateCustomerInput {
  name?: string;
  customerType?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export async function updateCustomer(
  id: string,
  patch: UpdateCustomerInput,
): Promise<Customer> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('customers')
    .update({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.customerType !== undefined && { customer_type: patch.customerType }),
      ...(patch.primaryContactName !== undefined && { primary_contact_name: patch.primaryContactName }),
      ...(patch.primaryContactEmail !== undefined && { primary_contact_email: patch.primaryContactEmail }),
      ...(patch.phone !== undefined && { phone: patch.phone }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToCustomer(data as CustomerRow);
}

export async function setCustomerActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('customers')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}
