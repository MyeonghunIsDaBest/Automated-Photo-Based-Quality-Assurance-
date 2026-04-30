// CRUD for `stakeholders`. Read = any authed; write = admin-only (enforced by RLS).

import { supabase, supabaseConfigured } from '../supabase';
import type { Stakeholder } from '../../types';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

interface StakeholderRow {
  id: string;
  company_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  mobile: string | null;
  role: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToStakeholder(r: StakeholderRow): Stakeholder {
  return {
    id: r.id,
    companyName: r.company_name,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email ?? undefined,
    mobile: r.mobile ?? undefined,
    role: r.role ?? undefined,
    notes: r.notes ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface StakeholderInput {
  companyName: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  role?: string;
  notes?: string;
}

export async function listStakeholders(): Promise<Stakeholder[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('stakeholders')
    .select('*')
    .order('company_name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToStakeholder(r as StakeholderRow));
}

export async function createStakeholder(input: StakeholderInput): Promise<Stakeholder> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('stakeholders')
    .insert({
      company_name: input.companyName,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email ?? null,
      mobile: input.mobile ?? null,
      role: input.role ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToStakeholder(data as StakeholderRow);
}

export async function updateStakeholder(
  id: string,
  patch: Partial<StakeholderInput>,
): Promise<Stakeholder> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const row: Record<string, unknown> = {};
  if (patch.companyName !== undefined) row.company_name = patch.companyName;
  if (patch.firstName !== undefined) row.first_name = patch.firstName;
  if (patch.lastName !== undefined) row.last_name = patch.lastName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.mobile !== undefined) row.mobile = patch.mobile;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.notes !== undefined) row.notes = patch.notes;
  const { data, error } = await supabase
    .from('stakeholders')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToStakeholder(data as StakeholderRow);
}

export async function deleteStakeholder(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('stakeholders').delete().eq('id', id);
  if (error) throw error;
}
