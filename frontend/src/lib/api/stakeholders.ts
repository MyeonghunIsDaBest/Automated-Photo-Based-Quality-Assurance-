// CRUD for `stakeholders` + the Phase D-2 child tables (`stakeholder_contacts`,
// `stakeholder_projects`). Read = any authed; write = admin-only (enforced
// by RLS on the parent row; child tables piggyback on authenticated for now).

import { supabase, supabaseConfigured } from '../supabase';
import type { Stakeholder, StakeholderContact } from '../../types';

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

interface StakeholderContactRow {
  id: string;
  stakeholder_id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
}

interface StakeholderProjectRow {
  stakeholder_id: string;
  project_id: string;
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

function rowToStakeholderContact(r: StakeholderContactRow): StakeholderContact {
  return {
    id: r.id,
    stakeholderId: r.stakeholder_id,
    name: r.name,
    email: r.email ?? undefined,
    mobile: r.mobile ?? undefined,
    role: r.role ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
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

export type StakeholderContactInput = Omit<
  StakeholderContact,
  'id' | 'stakeholderId' | 'createdAt'
>;

function contactInputToRow(input: Partial<StakeholderContactInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined)   row.name   = input.name;
  if (input.email !== undefined)  row.email  = input.email ?? null;
  if (input.mobile !== undefined) row.mobile = input.mobile ?? null;
  if (input.role !== undefined)   row.role   = input.role ?? null;
  if (input.notes !== undefined)  row.notes  = input.notes ?? null;
  return row;
}

// One-shot list. Pulls the parent rows + every child row for those parents in
// two follow-up queries, then stitches them on the client. Volume is small
// (admin directory; tens of rows at most), so this stays cheap.
export async function listStakeholders(): Promise<Stakeholder[]> {
  if (!supabaseConfigured()) return [];
  const { data: parents, error } = await supabase
    .from('stakeholders')
    .select('*')
    .order('company_name', { ascending: true });
  if (error) throw error;

  const ids = (parents ?? []).map((r) => (r as StakeholderRow).id);
  if (ids.length === 0) return [];

  const [{ data: contactRows, error: cErr }, { data: linkRows, error: lErr }] = await Promise.all([
    supabase.from('stakeholder_contacts').select('*').in('stakeholder_id', ids),
    supabase.from('stakeholder_projects').select('stakeholder_id, project_id').in('stakeholder_id', ids),
  ]);
  if (cErr) throw cErr;
  if (lErr) throw lErr;

  return (parents ?? []).map((r) => {
    const parent = rowToStakeholder(r as StakeholderRow);
    parent.contacts = (contactRows ?? [])
      .filter((c) => (c as StakeholderContactRow).stakeholder_id === parent.id)
      .map((c) => rowToStakeholderContact(c as StakeholderContactRow));
    parent.projectIds = (linkRows ?? [])
      .filter((l) => (l as StakeholderProjectRow).stakeholder_id === parent.id)
      .map((l) => (l as StakeholderProjectRow).project_id);
    return parent;
  });
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

// ─── Contacts: granular CRUD ──────────────────────────────────────────────

export async function addStakeholderContact(
  stakeholderId: string,
  input: StakeholderContactInput,
): Promise<StakeholderContact> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const row: Record<string, unknown> = { stakeholder_id: stakeholderId, ...contactInputToRow(input) };
  if (!('name' in row)) row.name = input.name ?? '';
  const { data, error } = await supabase
    .from('stakeholder_contacts')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;
  return rowToStakeholderContact(data as StakeholderContactRow);
}

export async function updateStakeholderContact(
  id: string,
  patch: Partial<StakeholderContactInput>,
): Promise<StakeholderContact> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('stakeholder_contacts')
    .update(contactInputToRow(patch))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToStakeholderContact(data as StakeholderContactRow);
}

export async function deleteStakeholderContact(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('stakeholder_contacts').delete().eq('id', id);
  if (error) throw error;
}

// ─── Project links ────────────────────────────────────────────────────────
// `setStakeholderProjects` replaces the entire link set in one call — diff
// against the existing rows so we only insert/delete what actually changed,
// keeping the audit log readable. Caller passes the desired complete set.

export async function setStakeholderProjects(
  stakeholderId: string,
  projectIds: string[],
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const desired = new Set(projectIds);

  const { data: existing, error: readErr } = await supabase
    .from('stakeholder_projects')
    .select('project_id')
    .eq('stakeholder_id', stakeholderId);
  if (readErr) throw readErr;
  const current = new Set((existing ?? []).map((r) => (r as { project_id: string }).project_id));

  const toAdd = [...desired].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !desired.has(id));

  if (toAdd.length > 0) {
    const { error: addErr } = await supabase
      .from('stakeholder_projects')
      .insert(toAdd.map((project_id) => ({ stakeholder_id: stakeholderId, project_id })));
    if (addErr) throw addErr;
  }
  if (toRemove.length > 0) {
    const { error: rmErr } = await supabase
      .from('stakeholder_projects')
      .delete()
      .eq('stakeholder_id', stakeholderId)
      .in('project_id', toRemove);
    if (rmErr) throw rmErr;
  }
}
