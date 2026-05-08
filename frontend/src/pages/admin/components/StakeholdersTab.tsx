import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  listStakeholders,
  createStakeholder,
  updateStakeholder,
  deleteStakeholder,
  addStakeholderContact,
  updateStakeholderContact,
  deleteStakeholderContact,
  setStakeholderProjects,
  type StakeholderInput,
  type StakeholderContactInput,
} from '../../../lib/api/stakeholders';
import type { Stakeholder, StakeholderContact } from '../../../types';
import {
  EditorialButton,
  EditorialModal,
  ResponsiveDataTable,
  type ColumnDef,
} from '../../../components/editorial';
import { useProjectsListStore } from '../../projects/store';

// ─── Page component ───────────────────────────────────────────────────────

export default function StakeholdersTab() {
  const [items, setItems] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Stakeholder | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listStakeholders());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stakeholders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleDelete = async (s: Stakeholder) => {
    if (!confirm(`Delete stakeholder "${s.companyName}"? Contacts and project links will also be removed.`)) return;
    try {
      await deleteStakeholder(s.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.');
    }
  };

  const columns: ColumnDef<Stakeholder>[] = [
    {
      key: 'company',
      header: 'Company',
      cell: (s) => <span className="font-medium text-slate-900">{s.companyName}</span>,
    },
    {
      key: 'contact',
      header: 'Primary contact',
      cell: (s) => (
        <span className="text-slate-600">
          {[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}
        </span>
      ),
    },
    { key: 'email',  header: 'Email',  cell: (s) => <span className="text-slate-600">{s.email ?? '—'}</span> },
    { key: 'mobile', header: 'Mobile', cell: (s) => <span className="text-slate-600">{s.mobile ?? '—'}</span> },
    { key: 'role',   header: 'Role',   cell: (s) => <span className="text-slate-600">{s.role ?? '—'}</span> },
    {
      key: 'extras',
      header: 'Linked',
      cell: (s) => (
        <span className="text-xs text-slate-500">
          {(s.contacts?.length ?? 0)} contact{(s.contacts?.length ?? 0) === 1 ? '' : 's'}
          {' · '}
          {(s.projectIds?.length ?? 0)} project{(s.projectIds?.length ?? 0) === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditing(s); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100"
            title="Edit"
            aria-label={`Edit ${s.companyName}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleDelete(s); }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
            title="Delete"
            aria-label={`Delete ${s.companyName}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const modalOpen = adding || !!editing;
  const closeModal = () => { setAdding(false); setEditing(null); };
  const onSaved = () => { closeModal(); void refresh(); };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">
            Stakeholders ({items.length})
          </h2>
          <p className="text-sm text-slate-500">
            External contacts (clients, consultants, council reps). Each company can carry
            multiple contacts and link to one or more projects.
          </p>
        </div>
        <EditorialButton
          variant="pill"
          trailingIcon="none"
          onClick={() => setAdding(true)}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add Stakeholder
        </EditorialButton>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <ResponsiveDataTable<Stakeholder>
            columns={columns}
            rows={items}
            rowKey={(s) => s.id}
            empty="No stakeholders yet."
            mobileCard={(s) => (
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{s.companyName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[s.firstName, s.lastName].filter(Boolean).join(' ') || '—'}
                      {s.role ? ` · ${s.role}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditing(s); }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleDelete(s); }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  {s.email && <span>{s.email}</span>}
                  {s.mobile && <span>{s.mobile}</span>}
                  <span>{(s.contacts?.length ?? 0)} contacts</span>
                  <span>{(s.projectIds?.length ?? 0)} projects</span>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {modalOpen && (
        <StakeholderFormModal
          existing={editing}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────

interface FormContact extends StakeholderContactInput {
  id?: string;
}

interface FormState {
  base: StakeholderInput;
  contacts: FormContact[];
  projectIds: string[];
}

function emptyContact(): FormContact {
  return { name: '', email: '', mobile: '', role: '', notes: '' };
}

function formFromExisting(s: Stakeholder): FormState {
  return {
    base: {
      companyName: s.companyName,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email ?? '',
      mobile: s.mobile ?? '',
      role: s.role ?? '',
      notes: s.notes ?? '',
    },
    contacts: (s.contacts ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? '',
      mobile: c.mobile ?? '',
      role: c.role ?? '',
      notes: c.notes ?? '',
    })),
    projectIds: [...(s.projectIds ?? [])],
  };
}

function emptyForm(): FormState {
  return {
    base: { companyName: '', firstName: '', lastName: '', email: '', mobile: '', role: '', notes: '' },
    contacts: [],
    projectIds: [],
  };
}

function StakeholderFormModal({
  existing, onClose, onSaved,
}: {
  existing: Stakeholder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [form, setForm] = useState<FormState>(() =>
    existing ? formFromExisting(existing) : emptyForm(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projects = useProjectsListStore((s) => s.projects);

  const setBaseField = (key: keyof StakeholderInput, value: string) =>
    setForm((f) => ({ ...f, base: { ...f.base, [key]: value } }));

  const addContact = () =>
    setForm((f) => ({ ...f, contacts: [...f.contacts, emptyContact()] }));
  const updateContact = (idx: number, key: keyof FormContact, value: string) =>
    setForm((f) => ({
      ...f,
      contacts: f.contacts.map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
    }));
  const removeContact = (idx: number) =>
    setForm((f) => ({ ...f, contacts: f.contacts.filter((_, i) => i !== idx) }));

  const toggleProject = (projectId: string) =>
    setForm((f) => ({
      ...f,
      projectIds: f.projectIds.includes(projectId)
        ? f.projectIds.filter((id) => id !== projectId)
        : [...f.projectIds, projectId],
    }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await saveEdit(existing, form);
      } else {
        await saveCreate(form);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorialModal
      open
      onClose={onClose}
      eyebrow={isEdit ? 'Section · Edit stakeholder' : 'Section · Stakeholders'}
      title={isEdit ? `Edit ${existing!.companyName}` : 'Add stakeholder'}
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <EditorialButton type="button" variant="ghost" trailingIcon="none" onClick={onClose}>
            Cancel
          </EditorialButton>
          <EditorialButton
            type="submit"
            variant="pill"
            trailingIcon="none"
            form="stakeholder-form"
            disabled={saving}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save stakeholder'}
          </EditorialButton>
        </div>
      }
    >
      <form id="stakeholder-form" onSubmit={handleSave} className="space-y-5">
        <Section title="Company & primary contact">
          <Field label="Company name" required>
            <input required value={form.base.companyName} onChange={(e) => setBaseField('companyName', e.target.value)} className="editorial-input" />
          </Field>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name" required>
              <input required value={form.base.firstName} onChange={(e) => setBaseField('firstName', e.target.value)} className="editorial-input" />
            </Field>
            <Field label="Last name" required>
              <input required value={form.base.lastName} onChange={(e) => setBaseField('lastName', e.target.value)} className="editorial-input" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.base.email ?? ''} onChange={(e) => setBaseField('email', e.target.value)} className="editorial-input" />
            </Field>
            <Field label="Mobile">
              <input type="tel" value={form.base.mobile ?? ''} onChange={(e) => setBaseField('mobile', e.target.value)} className="editorial-input" />
            </Field>
            <Field label="Role">
              <input value={form.base.role ?? ''} onChange={(e) => setBaseField('role', e.target.value)} className="editorial-input" />
            </Field>
            <Field label="Notes">
              <input value={form.base.notes ?? ''} onChange={(e) => setBaseField('notes', e.target.value)} className="editorial-input" />
            </Field>
          </div>
        </Section>

        <Section
          title={`Additional contacts (${form.contacts.length})`}
          action={
            <button
              type="button"
              onClick={addContact}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <Plus className="h-3 w-3" /> Add contact
            </button>
          }
        >
          {form.contacts.length === 0 ? (
            <p className="text-xs italic text-slate-400">No additional contacts. The primary contact above is enough.</p>
          ) : (
            <div className="space-y-2">
              {form.contacts.map((c, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input placeholder="Name" value={c.name} onChange={(e) => updateContact(idx, 'name', e.target.value)} className="editorial-input" />
                    <input placeholder="Role" value={c.role ?? ''} onChange={(e) => updateContact(idx, 'role', e.target.value)} className="editorial-input" />
                    <input placeholder="Email" type="email" value={c.email ?? ''} onChange={(e) => updateContact(idx, 'email', e.target.value)} className="editorial-input" />
                    <input placeholder="Mobile" value={c.mobile ?? ''} onChange={(e) => updateContact(idx, 'mobile', e.target.value)} className="editorial-input" />
                  </div>
                  <input
                    placeholder="Notes"
                    value={c.notes ?? ''}
                    onChange={(e) => updateContact(idx, 'notes', e.target.value)}
                    className="editorial-input mt-2"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeContact(idx)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title={`Linked projects (${form.projectIds.length})`}
          action={
            projects.length === 0 ? null : (
              <span className="text-[11px] text-slate-400">
                {form.projectIds.length} of {projects.length} selected
              </span>
            )
          }
        >
          {projects.length === 0 ? (
            <p className="text-xs italic text-slate-400">
              No projects yet. Create a project first, then come back here to link this stakeholder.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => {
                const active = form.projectIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProject(p.id)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-emerald-500 bg-emerald-100 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                        active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {active && (
                        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M3 8l3 3 7-7" />
                        </svg>
                      )}
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
      </form>
    </EditorialModal>
  );
}

// ─── Save paths ───────────────────────────────────────────────────────────

async function saveCreate(form: FormState): Promise<void> {
  const created = await createStakeholder(form.base);
  for (const c of form.contacts) {
    await addStakeholderContact(created.id, contactPayload(c));
  }
  if (form.projectIds.length > 0) {
    await setStakeholderProjects(created.id, form.projectIds);
  }
}

async function saveEdit(existing: Stakeholder, form: FormState): Promise<void> {
  // Root patch — only fields that differ.
  const patch = computeBasePatch(existing, form.base);
  if (Object.keys(patch).length > 0) {
    await updateStakeholder(existing.id, patch);
  }

  // Contacts diff.
  const existingById = new Map((existing.contacts ?? []).map((c) => [c.id, c]));
  const formIds = new Set<string>();
  for (const c of form.contacts) {
    if (c.id) {
      formIds.add(c.id);
      const ex = existingById.get(c.id);
      if (ex && contactDiffers(ex, c)) {
        await updateStakeholderContact(c.id, contactPayload(c));
      }
    } else {
      await addStakeholderContact(existing.id, contactPayload(c));
    }
  }
  for (const ex of existing.contacts ?? []) {
    if (!formIds.has(ex.id)) {
      await deleteStakeholderContact(ex.id);
    }
  }

  // Project links — set replaces in one call (diffs internally).
  const existingProjects = new Set(existing.projectIds ?? []);
  const formProjects = new Set(form.projectIds);
  const same =
    existingProjects.size === formProjects.size &&
    [...existingProjects].every((id) => formProjects.has(id));
  if (!same) {
    await setStakeholderProjects(existing.id, form.projectIds);
  }
}

function contactPayload(c: FormContact): StakeholderContactInput {
  return {
    name: c.name,
    email: c.email || undefined,
    mobile: c.mobile || undefined,
    role: c.role || undefined,
    notes: c.notes || undefined,
  };
}

function computeBasePatch(existing: Stakeholder, base: StakeholderInput): Partial<StakeholderInput> {
  const patch: Partial<StakeholderInput> = {};
  const keys: (keyof StakeholderInput)[] = [
    'companyName', 'firstName', 'lastName', 'email', 'mobile', 'role', 'notes',
  ];
  for (const k of keys) {
    const next = (base[k] ?? '') as string;
    const prev = ((existing[k as keyof Stakeholder] as string | undefined) ?? '') as string;
    if (next !== prev) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[k] = next === '' ? undefined : next;
    }
  }
  return patch;
}

function contactDiffers(existing: StakeholderContact, form: FormContact): boolean {
  return (
    existing.name !== form.name ||
    (existing.email ?? '') !== (form.email ?? '') ||
    (existing.mobile ?? '') !== (form.mobile ?? '') ||
    (existing.role ?? '') !== (form.role ?? '') ||
    (existing.notes ?? '') !== (form.notes ?? '')
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────

function Section({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
