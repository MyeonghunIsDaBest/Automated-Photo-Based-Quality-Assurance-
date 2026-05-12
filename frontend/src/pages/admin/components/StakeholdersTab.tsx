import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Mail, Pencil, Phone, Plus, Search, Trash2, X,
} from 'lucide-react';
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

// ─── Filter / sort types ──────────────────────────────────────────────────

type FilterId = 'all' | 'linked' | 'unlinked' | 'has-email' | 'no-email';
type SortCol = 'company' | 'contact' | 'contacts' | 'projects';
interface SortState {
  col: SortCol;
  dir: 'asc' | 'desc';
}

function primaryContactName(s: Stakeholder): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ').trim();
}

function compareStakeholders(a: Stakeholder, b: Stakeholder, col: SortCol, dir: 'asc' | 'desc'): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (col) {
    case 'company':
      return sign * a.companyName.toLowerCase().localeCompare(b.companyName.toLowerCase());
    case 'contact':
      return sign * (primaryContactName(a) || '').toLowerCase()
        .localeCompare((primaryContactName(b) || '').toLowerCase());
    case 'contacts':
      return sign * ((a.contacts?.length ?? 0) - (b.contacts?.length ?? 0));
    case 'projects':
      return sign * ((a.projectIds?.length ?? 0) - (b.projectIds?.length ?? 0));
  }
}

// ─── Page component ───────────────────────────────────────────────────────

export default function StakeholdersTab() {
  const [items, setItems] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Stakeholder | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortState>({ col: 'company', dir: 'asc' });

  // Project list for the inline project chips. Same store the modal already
  // uses for the multi-select.
  const projects = useProjectsListStore((s) => s.projects);
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

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

  const toggleSort = (col: SortCol) => {
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' });
  };

  // Per-filter counts — drive the chip badges.
  const counts = useMemo(() => {
    let linked = 0, unlinked = 0, hasEmail = 0, noEmail = 0;
    for (const s of items) {
      if ((s.projectIds?.length ?? 0) > 0) linked++; else unlinked++;
      if (s.email && s.email.trim()) hasEmail++; else noEmail++;
    }
    return { all: items.length, linked, unlinked, 'has-email': hasEmail, 'no-email': noEmail };
  }, [items]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesSearch = (s: Stakeholder) => {
      if (!q) return true;
      return (
        s.companyName.toLowerCase().includes(q) ||
        primaryContactName(s).toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.role ?? '').toLowerCase().includes(q) ||
        (s.contacts ?? []).some((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q),
        )
      );
    };
    const matchesFilter = (s: Stakeholder) => {
      const linkedCount = s.projectIds?.length ?? 0;
      const hasEmail = !!(s.email && s.email.trim());
      switch (filter) {
        case 'linked':    return linkedCount > 0;
        case 'unlinked':  return linkedCount === 0;
        case 'has-email': return hasEmail;
        case 'no-email':  return !hasEmail;
        default:          return true;
      }
    };
    return items
      .filter(matchesSearch)
      .filter(matchesFilter)
      .sort((a, b) => compareStakeholders(a, b, sort.col, sort.dir));
  }, [items, search, filter, sort]);

  const clearFilters = () => { setFilter('all'); setSearch(''); };
  const filtersActive = filter !== 'all' || search.trim() !== '';

  // Inline project chips — show up to 3, then "+N more".
  const renderProjectChips = (s: Stakeholder) => {
    const ids = s.projectIds ?? [];
    if (ids.length === 0) {
      return <span className="text-xs italic text-slate-400">Not linked</span>;
    }
    const names = ids.map((id) => projectsById.get(id)?.name ?? '(removed)');
    const head = names.slice(0, 3);
    const extra = names.length - head.length;
    return (
      <div className="flex flex-wrap gap-1">
        {head.map((n, i) => (
          <span
            key={`${s.id}-${i}`}
            className="inline-flex max-w-[10rem] items-center truncate rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
            title={n}
          >
            {n}
          </span>
        ))}
        {extra > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] tabular-nums text-slate-600">
            +{extra}
          </span>
        )}
      </div>
    );
  };

  // Mailto / tel quick actions next to email + mobile.
  const renderEmail = (s: Stakeholder) => {
    if (!s.email) return <span className="text-slate-400">—</span>;
    return (
      <a
        href={`mailto:${s.email}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-700"
      >
        <Mail className="h-3 w-3 flex-shrink-0 text-slate-400" />
        <span className="truncate">{s.email}</span>
      </a>
    );
  };
  const renderMobile = (s: Stakeholder) => {
    if (!s.mobile) return <span className="text-slate-400">—</span>;
    return (
      <a
        href={`tel:${s.mobile}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-slate-600 hover:text-emerald-700"
      >
        <Phone className="h-3 w-3 flex-shrink-0 text-slate-400" />
        <span className="truncate tabular-nums">{s.mobile}</span>
      </a>
    );
  };

  const columns: ColumnDef<Stakeholder>[] = [
    {
      key: 'company',
      header: <SortBtn col="company" sort={sort} onToggle={toggleSort}>Company</SortBtn>,
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{s.companyName}</p>
          {s.role && <p className="truncate text-[11px] text-slate-500">{s.role}</p>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: <SortBtn col="contact" sort={sort} onToggle={toggleSort}>Primary contact</SortBtn>,
      cell: (s) => (
        <span className="text-slate-700">
          {primaryContactName(s) || <span className="italic text-slate-400">—</span>}
        </span>
      ),
    },
    { key: 'email',  header: 'Email',  cell: renderEmail },
    { key: 'mobile', header: 'Mobile', cell: renderMobile, desktopOnly: true },
    {
      key: 'contacts',
      header: <SortBtn col="contacts" sort={sort} onToggle={toggleSort}>Contacts</SortBtn>,
      cell: (s) => (
        <span className="tabular-nums text-xs text-slate-500">
          {s.contacts?.length ?? 0}
        </span>
      ),
      desktopOnly: true,
    },
    {
      key: 'projects',
      header: <SortBtn col="projects" sort={sort} onToggle={toggleSort}>Linked projects</SortBtn>,
      cell: renderProjectChips,
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

  const FILTER_CHIPS: { id: FilterId; label: string; count: number }[] = [
    { id: 'all',       label: 'All',          count: counts.all },
    { id: 'linked',    label: 'Linked',       count: counts.linked },
    { id: 'unlinked',  label: 'Unlinked',     count: counts.unlinked },
    { id: 'has-email', label: 'Has email',    count: counts['has-email'] },
    { id: 'no-email',  label: 'Missing email', count: counts['no-email'] },
  ];

  return (
    <div>
      {/* ─── Header row ─── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold text-slate-900">External contacts</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
            {items.length}
          </span>
        </div>
        <EditorialButton
          variant="pill"
          trailingIcon="none"
          onClick={() => setAdding(true)}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add stakeholder
        </EditorialButton>
      </div>

      <p className="mb-4 max-w-2xl text-sm text-slate-500">
        Clients, consultants, council reps. Each company can carry multiple contacts and
        link to one or more projects.
      </p>

      {/* ─── Toolbar ─── */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, contact, email, role…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-10 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Filter chips ─── */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FILTER_CHIPS.map((c) => {
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              {c.label}
              <span className={`text-[10px] tabular-nums ${active ? 'text-white/70' : 'text-slate-400'}`}>
                {c.count}
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-slate-400">
          <span className="tabular-nums text-slate-700">{filteredRows.length}</span>
          {' '}of{' '}
          <span className="tabular-nums">{items.length}</span> shown
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Table ─── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <ResponsiveDataTable<Stakeholder>
            columns={columns}
            rows={filteredRows}
            rowKey={(s) => s.id}
            empty={filtersActive ? (
              <div className="py-6 text-center">
                <p className="display text-base text-slate-900">No stakeholders match.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Try a different filter or clear the search.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 text-xs font-medium text-emerald-700 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : 'No stakeholders yet — add one to get started.'}
            mobileCard={(s) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{s.companyName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {primaryContactName(s) || '—'}
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
                  {s.email && (
                    <a href={`mailto:${s.email}`} onClick={(e) => e.stopPropagation()} className="hover:text-emerald-700">{s.email}</a>
                  )}
                  {s.mobile && (
                    <a href={`tel:${s.mobile}`} onClick={(e) => e.stopPropagation()} className="hover:text-emerald-700">{s.mobile}</a>
                  )}
                  <span>{(s.contacts?.length ?? 0)} contacts</span>
                </div>
                <div className="pt-1">{renderProjectChips(s)}</div>
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

// Inline sort button for ResponsiveDataTable column headers.
function SortBtn({
  col, sort, onToggle, children,
}: {
  col: SortCol;
  sort: SortState;
  onToggle: (c: SortCol) => void;
  children: React.ReactNode;
}) {
  const active = sort.col === col;
  return (
    <button
      type="button"
      onClick={onToggle.bind(null, col)}
      className="group inline-flex items-center gap-1 transition-colors hover:text-slate-900"
    >
      {children}
      {active ? (
        sort.dir === 'asc'
          ? <ArrowUp className="h-3 w-3 text-emerald-700" />
          : <ArrowDown className="h-3 w-3 text-emerald-700" />
      ) : (
        <ArrowUpDown className="h-3 w-3 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
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
