// CRUD for `suppliers` + child tables (branches, contacts).

import { supabase, supabaseConfigured } from '../supabase';
import type {
  Supplier,
  SupplierAddress,
  SupplierBranch,
  SupplierContact,
} from '../../types';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

interface SupplierRow {
  id: string;
  name: string;
  abn: string | null;
  website: string | null;
  main_email: string | null;
  main_contact_number: string | null;
  main_contact_name: string | null;
  accounts_email: string | null;
  accounts_contact_number: string | null;
  accounts_contact_name: string | null;
  main_address: SupplierAddress | null;
  postal_address: SupplierAddress | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BranchRow {
  id: string;
  supplier_id: string;
  branch_name: string;
  email: string | null;
  contact_number: string | null;
  contact_name: string | null;
  accounts_email: string | null;
  accounts_contact_number: string | null;
  accounts_contact_name: string | null;
  address: SupplierAddress | null;
  postal_address: SupplierAddress | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  supplier_id: string;
  branch_id: string | null;
  name: string;
  email: string | null;
  mobile: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
}

function rowToSupplier(r: SupplierRow): Supplier {
  return {
    id: r.id,
    name: r.name,
    abn: r.abn ?? undefined,
    website: r.website ?? undefined,
    mainEmail: r.main_email ?? undefined,
    mainContactNumber: r.main_contact_number ?? undefined,
    mainContactName: r.main_contact_name ?? undefined,
    accountsEmail: r.accounts_email ?? undefined,
    accountsContactNumber: r.accounts_contact_number ?? undefined,
    accountsContactName: r.accounts_contact_name ?? undefined,
    mainAddress: r.main_address ?? undefined,
    postalAddress: r.postal_address ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToBranch(r: BranchRow): SupplierBranch {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    branchName: r.branch_name,
    email: r.email ?? undefined,
    contactNumber: r.contact_number ?? undefined,
    contactName: r.contact_name ?? undefined,
    accountsEmail: r.accounts_email ?? undefined,
    accountsContactNumber: r.accounts_contact_number ?? undefined,
    accountsContactName: r.accounts_contact_name ?? undefined,
    address: r.address ?? undefined,
    postalAddress: r.postal_address ?? undefined,
    createdAt: r.created_at,
  };
}

function rowToContact(r: ContactRow): SupplierContact {
  return {
    id: r.id,
    supplierId: r.supplier_id,
    branchId: r.branch_id ?? undefined,
    name: r.name,
    email: r.email ?? undefined,
    mobile: r.mobile ?? undefined,
    role: r.role ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

export interface SupplierInput {
  name: string;
  abn?: string;
  website?: string;
  mainEmail?: string;
  mainContactNumber?: string;
  mainContactName?: string;
  accountsEmail?: string;
  accountsContactNumber?: string;
  accountsContactName?: string;
  mainAddress?: SupplierAddress;
  postalAddress?: SupplierAddress;
  notes?: string;
  contacts?: Array<Omit<SupplierContact, 'id' | 'supplierId' | 'createdAt'>>;
  branches?: Array<Omit<SupplierBranch, 'id' | 'supplierId' | 'createdAt'>>;
}

function supplierInputToRow(input: SupplierInput): Record<string, unknown> {
  return {
    name: input.name,
    abn: input.abn ?? null,
    website: input.website ?? null,
    main_email: input.mainEmail ?? null,
    main_contact_number: input.mainContactNumber ?? null,
    main_contact_name: input.mainContactName ?? null,
    accounts_email: input.accountsEmail ?? null,
    accounts_contact_number: input.accountsContactNumber ?? null,
    accounts_contact_name: input.accountsContactName ?? null,
    main_address: input.mainAddress ?? null,
    postal_address: input.postalAddress ?? null,
    notes: input.notes ?? null,
  };
}

export async function listSuppliers(): Promise<Supplier[]> {
  if (!supabaseConfigured()) return [];
  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;

  const supplierIds = (suppliers ?? []).map((s) => (s as SupplierRow).id);
  if (supplierIds.length === 0) return [];

  const [{ data: branches, error: bErr }, { data: contacts, error: cErr }] = await Promise.all([
    supabase.from('supplier_branches').select('*').in('supplier_id', supplierIds),
    supabase.from('supplier_contacts').select('*').in('supplier_id', supplierIds),
  ]);
  if (bErr) throw bErr;
  if (cErr) throw cErr;

  return (suppliers ?? []).map((s) => {
    const supplier = rowToSupplier(s as SupplierRow);
    supplier.branches = (branches ?? [])
      .filter((b) => (b as BranchRow).supplier_id === supplier.id)
      .map((b) => rowToBranch(b as BranchRow));
    supplier.contacts = (contacts ?? [])
      .filter((c) => (c as ContactRow).supplier_id === supplier.id)
      .map((c) => rowToContact(c as ContactRow));
    return supplier;
  });
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  const { data: created, error } = await supabase
    .from('suppliers')
    .insert(supplierInputToRow(input))
    .select('*')
    .single();
  if (error) throw error;
  const supplier = rowToSupplier(created as SupplierRow);

  if (input.branches && input.branches.length > 0) {
    const { data: branchRows, error: bErr } = await supabase
      .from('supplier_branches')
      .insert(
        input.branches.map((b) => ({
          supplier_id: supplier.id,
          branch_name: b.branchName,
          email: b.email ?? null,
          contact_number: b.contactNumber ?? null,
          contact_name: b.contactName ?? null,
          accounts_email: b.accountsEmail ?? null,
          accounts_contact_number: b.accountsContactNumber ?? null,
          accounts_contact_name: b.accountsContactName ?? null,
          address: b.address ?? null,
          postal_address: b.postalAddress ?? null,
        })),
      )
      .select('*');
    if (bErr) throw bErr;
    supplier.branches = (branchRows ?? []).map((b) => rowToBranch(b as BranchRow));
  }

  if (input.contacts && input.contacts.length > 0) {
    const { data: contactRows, error: cErr } = await supabase
      .from('supplier_contacts')
      .insert(
        input.contacts.map((c) => ({
          supplier_id: supplier.id,
          branch_id: c.branchId ?? null,
          name: c.name,
          email: c.email ?? null,
          mobile: c.mobile ?? null,
          role: c.role ?? null,
          notes: c.notes ?? null,
        })),
      )
      .select('*');
    if (cErr) throw cErr;
    supplier.contacts = (contactRows ?? []).map((c) => rowToContact(c as ContactRow));
  }

  return supplier;
}

export async function updateSupplier(
  id: string,
  patch: Partial<SupplierInput>,
): Promise<Supplier> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const row: Record<string, unknown> = supplierInputToRow(patch as SupplierInput);
  // Strip undefineds (we don't want to overwrite with nulls when caller didn't pass).
  Object.keys(row).forEach((k) => {
    if ((patch as Record<string, unknown>)[toCamel(k)] === undefined) delete row[k];
  });
  const { data, error } = await supabase
    .from('suppliers')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToSupplier(data as SupplierRow);
}

function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export async function deleteSupplier(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;
}
