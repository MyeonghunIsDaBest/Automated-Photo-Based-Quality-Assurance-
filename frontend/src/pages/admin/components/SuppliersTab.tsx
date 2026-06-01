import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  addSupplierBranch,
  updateSupplierBranch,
  deleteSupplierBranch,
  addSupplierContact,
  updateSupplierContact,
  deleteSupplierContact,
  type SupplierInput,
  type BranchInput,
  type ContactInput,
} from '../../../lib/api/suppliers';
import type { Supplier, SupplierAddress, SupplierBranch, SupplierContact } from '../../../types';
import { EditorialButton, EditorialModal } from '../../../components/editorial';

// Form-state augmentations. _clientId stays stable across renders so a
// contact card can name a branch card by reference even before either has
// hit the DB. Resolved to real ids in the save path. _showAddress controls
// the collapsible address block on the branch card.
interface FormBranch extends BranchInput {
  id?: string;
  _clientId: string;
  _showAddress: boolean;
}
interface FormContact extends ContactInput {
  id?: string;
  _branchClientId?: string;
}
interface FormState extends Omit<SupplierInput, 'branches' | 'contacts'> {
  branches: FormBranch[];
  contacts: FormContact[];
}

const EMPTY_ADDRESS: SupplierAddress = {};

const EMPTY_FORM: FormState = {
  name: '',
  abn: '',
  website: '',
  mainEmail: '',
  mainContactNumber: '',
  mainContactName: '',
  accountsEmail: '',
  accountsContactNumber: '',
  accountsContactName: '',
  mainAddress: { ...EMPTY_ADDRESS },
  postalAddress: { ...EMPTY_ADDRESS },
  notes: '',
  branches: [],
  contacts: [],
};

function newClientId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyBranch(): FormBranch {
  return {
    _clientId: newClientId(),
    _showAddress: false,
    branchName: '',
    email: '',
    contactNumber: '',
    contactName: '',
    accountsEmail: '',
    accountsContactNumber: '',
    accountsContactName: '',
    address: { ...EMPTY_ADDRESS },
    postalAddress: { ...EMPTY_ADDRESS },
  };
}

function emptyContact(): FormContact {
  return {
    name: '',
    email: '',
    mobile: '',
    role: '',
    notes: '',
    branchId: undefined,
    _branchClientId: undefined,
  };
}

// Hydrate the form from an existing supplier so Edit mode renders the same
// graph the user is about to mutate. Keys per-row _clientId by the real db
// id when present so the diff-based save path stays simple.
function formFromSupplier(s: Supplier): FormState {
  const branches: FormBranch[] = (s.branches ?? []).map((b) => ({
    id: b.id,
    _clientId: b.id, // reuse real id as clientId for existing rows
    _showAddress: false,
    branchName: b.branchName,
    email: b.email ?? '',
    contactNumber: b.contactNumber ?? '',
    contactName: b.contactName ?? '',
    accountsEmail: b.accountsEmail ?? '',
    accountsContactNumber: b.accountsContactNumber ?? '',
    accountsContactName: b.accountsContactName ?? '',
    address: b.address ?? {},
    postalAddress: b.postalAddress ?? {},
  }));
  const contacts: FormContact[] = (s.contacts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? '',
    mobile: c.mobile ?? '',
    role: c.role ?? '',
    notes: c.notes ?? '',
    branchId: c.branchId,
    _branchClientId: c.branchId, // existing branchId === clientId per the rule above
  }));
  return {
    name: s.name,
    abn: s.abn ?? '',
    website: s.website ?? '',
    mainEmail: s.mainEmail ?? '',
    mainContactNumber: s.mainContactNumber ?? '',
    mainContactName: s.mainContactName ?? '',
    accountsEmail: s.accountsEmail ?? '',
    accountsContactNumber: s.accountsContactNumber ?? '',
    accountsContactName: s.accountsContactName ?? '',
    mainAddress: s.mainAddress ?? {},
    postalAddress: s.postalAddress ?? {},
    notes: s.notes ?? '',
    branches,
    contacts,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function SuppliersTab() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSuppliers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleDelete = async (s: Supplier) => {
    if (!confirm(`Delete supplier "${s.name}"? Branches and contacts will also be removed.`)) return;
    try {
      await deleteSupplier(s.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.');
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const modalOpen = adding || !!editing;
  const closeModal = () => { setAdding(false); setEditing(null); };
  const onSaved = () => { closeModal(); void refresh(); };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Suppliers ({items.length})</h2>
          <p className="text-sm text-slate-500">
            Vendors and material suppliers. Each can have multiple contacts and branches.
          </p>
        </div>
        <EditorialButton
          variant="pill"
          trailingIcon="none"
          onClick={() => setAdding(true)}
          className="self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add Supplier
        </EditorialButton>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
            No suppliers yet.
          </div>
        ) : (
          items.map((s) => {
            const isOpen = expanded.has(s.id);
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <button
                    onClick={() => toggleExpanded(s.id)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" />
                      : <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{s.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {s.abn && <>ABN {s.abn} · </>}
                        {(s.contacts?.length ?? 0)} contact{(s.contacts?.length ?? 0) === 1 ? '' : 's'} ·
                        {' '}{(s.branches?.length ?? 0)} branch{(s.branches?.length ?? 0) === 1 ? '' : 'es'}
                      </div>
                    </div>
                  </button>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditing(s)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                      title="Edit"
                      aria-label={`Edit ${s.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                      aria-label={`Delete ${s.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4 text-sm">
                    <DetailGrid s={s} />
                    <ChildList title="Contacts" empty="No contacts">
                      {(s.contacts ?? []).map((c) => {
                        const branchName = c.branchId
                          ? s.branches?.find((b) => b.id === c.branchId)?.branchName
                          : undefined;
                        return (
                          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2">
                            <span className="font-medium text-slate-800">{c.name}</span>
                            <span className="text-slate-500">
                              {[c.role, c.email, c.mobile, branchName ? `Branch: ${branchName}` : null].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </li>
                        );
                      })}
                    </ChildList>
                    <ChildList title="Branches" empty="No branches">
                      {(s.branches ?? []).map((b) => (
                        <li key={b.id} className="space-y-1 rounded-md bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-slate-800">{b.branchName}</span>
                            <span className="text-slate-500">
                              {[b.contactName, b.email, b.contactNumber].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </div>
                          {(b.accountsContactName || b.accountsEmail || b.accountsContactNumber) && (
                            <div className="text-[11px] text-slate-500">
                              Accounts: {[b.accountsContactName, b.accountsEmail, b.accountsContactNumber].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {(formatAddress(b.address) || formatAddress(b.postalAddress)) && (
                            <div className="text-[11px] text-slate-500">
                              {formatAddress(b.address) && <>📍 {formatAddress(b.address)}</>}
                              {formatAddress(b.address) && formatAddress(b.postalAddress) && <> · </>}
                              {formatAddress(b.postalAddress) && <>✉ {formatAddress(b.postalAddress)}</>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ChildList>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {modalOpen && (
        <SupplierFormModal
          existing={editing}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

// ─── View helpers (read-only) ──────────────────────────────────────────────

function DetailGrid({ s }: { s: Supplier }) {
  return (
    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
      <Detail label="Website" value={s.website} />
      <Detail label="Main Email" value={s.mainEmail} />
      <Detail label="Main Contact" value={[s.mainContactName, s.mainContactNumber].filter(Boolean).join(' · ')} />
      <Detail label="Accounts Contact" value={[s.accountsContactName, s.accountsEmail, s.accountsContactNumber].filter(Boolean).join(' · ')} />
      <Detail label="Address" value={formatAddress(s.mainAddress)} />
      <Detail label="Postal" value={formatAddress(s.postalAddress)} />
    </div>
  );
}

function formatAddress(a?: SupplierAddress): string | undefined {
  if (!a) return undefined;
  const parts = [a.street, a.suburb, a.state, a.postcode, a.country].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-slate-700">{value || '—'}</div>
    </div>
  );
}

function ChildList({
  title, empty, children,
}: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs italic text-slate-400">{empty}</div>
      ) : (
        <ul className="space-y-1">{children}</ul>
      )}
    </div>
  );
}

// ─── Modal — Add or Edit ──────────────────────────────────────────────────

function SupplierFormModal({
  existing, onClose, onSaved,
}: {
  existing: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [form, setForm] = useState<FormState>(() =>
    existing ? formFromSupplier(existing) : { ...EMPTY_FORM, branches: [], contacts: [] },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Field setters ────────────────────────────────────────────────────────
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setAddrField = (
    kind: 'mainAddress' | 'postalAddress',
    key: keyof SupplierAddress,
    value: string,
  ) => setForm((f) => ({ ...f, [kind]: { ...(f[kind] ?? {}), [key]: value } }));

  // ── Branch helpers ───────────────────────────────────────────────────────
  const addBranch = () =>
    setForm((f) => ({ ...f, branches: [...f.branches, emptyBranch()] }));

  const updateBranchField = (idx: number, key: keyof FormBranch, value: unknown) =>
    setForm((f) => ({
      ...f,
      branches: f.branches.map((b, i) => (i === idx ? { ...b, [key]: value as never } : b)),
    }));

  const updateBranchAddrField = (
    idx: number,
    kind: 'address' | 'postalAddress',
    key: keyof SupplierAddress,
    value: string,
  ) => setForm((f) => ({
    ...f,
    branches: f.branches.map((b, i) =>
      i === idx ? { ...b, [kind]: { ...(b[kind] ?? {}), [key]: value } } : b,
    ),
  }));

  const removeBranch = (idx: number) =>
    setForm((f) => {
      const removed = f.branches[idx];
      const branches = f.branches.filter((_, i) => i !== idx);
      // Unhook any contacts that pointed at this branch.
      const contacts = f.contacts.map((c) =>
        c._branchClientId === removed._clientId ? { ...c, _branchClientId: undefined } : c,
      );
      return { ...f, branches, contacts };
    });

  // ── Contact helpers ──────────────────────────────────────────────────────
  const addContact = () =>
    setForm((f) => ({ ...f, contacts: [...f.contacts, emptyContact()] }));

  const updateContactField = (idx: number, key: keyof FormContact, value: unknown) =>
    setForm((f) => ({
      ...f,
      contacts: f.contacts.map((c, i) => (i === idx ? { ...c, [key]: value as never } : c)),
    }));

  const removeContact = (idx: number) =>
    setForm((f) => ({ ...f, contacts: f.contacts.filter((_, i) => i !== idx) }));

  // ── Save ─────────────────────────────────────────────────────────────────
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
      eyebrow={isEdit ? 'Section · Edit supplier' : 'Section · Suppliers'}
      title={isEdit ? `Edit ${existing!.name}` : 'Add supplier'}
      size="xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <EditorialButton type="button" variant="ghost" trailingIcon="none" onClick={onClose}>
            Cancel
          </EditorialButton>
          <EditorialButton
            type="submit"
            variant="pill"
            trailingIcon="none"
            form="supplier-form"
            disabled={saving}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save supplier'}
          </EditorialButton>
        </div>
      }
    >
      <form id="supplier-form" onSubmit={handleSave} className="space-y-5">
        <Section title="Main details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <F label="Supplier name" required>
              <input required value={form.name} onChange={(e) => setField('name', e.target.value)} className="editorial-input" />
            </F>
            <F label="ABN">
              <input value={form.abn} onChange={(e) => setField('abn', e.target.value)} className="editorial-input" />
            </F>
            <F label="Website">
              <input value={form.website} onChange={(e) => setField('website', e.target.value)} className="editorial-input" />
            </F>
            <F label="Notes">
              <input value={form.notes} onChange={(e) => setField('notes', e.target.value)} className="editorial-input" />
            </F>
            <F label="Main email">
              <input type="email" value={form.mainEmail} onChange={(e) => setField('mainEmail', e.target.value)} className="editorial-input" />
            </F>
            <F label="Main contact number">
              <input value={form.mainContactNumber} onChange={(e) => setField('mainContactNumber', e.target.value)} className="editorial-input" />
            </F>
            <F label="Main contact name">
              <input value={form.mainContactName} onChange={(e) => setField('mainContactName', e.target.value)} className="editorial-input" />
            </F>
            <F label="Accounts email">
              <input type="email" value={form.accountsEmail} onChange={(e) => setField('accountsEmail', e.target.value)} className="editorial-input" />
            </F>
            <F label="Accounts contact number">
              <input value={form.accountsContactNumber} onChange={(e) => setField('accountsContactNumber', e.target.value)} className="editorial-input" />
            </F>
            <F label="Accounts contact name">
              <input value={form.accountsContactName} onChange={(e) => setField('accountsContactName', e.target.value)} className="editorial-input" />
            </F>
          </div>
        </Section>

        <Section title="Main address">
          <AddressFields
            address={form.mainAddress ?? {}}
            onChange={(k, v) => setAddrField('mainAddress', k, v)}
          />
        </Section>

        <Section title="Postal address">
          <AddressFields
            address={form.postalAddress ?? {}}
            onChange={(k, v) => setAddrField('postalAddress', k, v)}
          />
        </Section>

        <Section
          title={`Branches (${form.branches.length})`}
          action={
            <button
              type="button"
              onClick={addBranch}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <Plus className="h-3 w-3" /> Add branch
            </button>
          }
        >
          <div className="space-y-2">
            {form.branches.map((b, idx) => (
              <BranchCard
                key={b._clientId}
                branch={b}
                onUpdate={(key, value) => updateBranchField(idx, key, value)}
                onUpdateAddr={(kind, key, value) => updateBranchAddrField(idx, kind, key, value)}
                onRemove={() => removeBranch(idx)}
                onToggleAddress={() => updateBranchField(idx, '_showAddress', !b._showAddress)}
              />
            ))}
          </div>
        </Section>

        <Section
          title={`Contacts (${form.contacts.length})`}
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
          <div className="space-y-2">
            {form.contacts.map((c, idx) => (
              <ContactCard
                key={`contact-${idx}`}
                contact={c}
                branches={form.branches}
                onUpdate={(key, value) => updateContactField(idx, key, value)}
                onRemove={() => removeContact(idx)}
              />
            ))}
          </div>
        </Section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
      </form>
    </EditorialModal>
  );
}

// ─── Branch card ──────────────────────────────────────────────────────────

function BranchCard({
  branch, onUpdate, onUpdateAddr, onRemove, onToggleAddress,
}: {
  branch: FormBranch;
  onUpdate: (key: keyof FormBranch, value: unknown) => void;
  onUpdateAddr: (kind: 'address' | 'postalAddress', key: keyof SupplierAddress, value: string) => void;
  onRemove: () => void;
  onToggleAddress: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input placeholder="Branch name" value={branch.branchName} onChange={(e) => onUpdate('branchName', e.target.value)} className="editorial-input" />
        <input placeholder="Branch contact name" value={branch.contactName ?? ''} onChange={(e) => onUpdate('contactName', e.target.value)} className="editorial-input" />
        <input placeholder="Branch email" type="email" value={branch.email ?? ''} onChange={(e) => onUpdate('email', e.target.value)} className="editorial-input" />
        <input placeholder="Branch contact number" value={branch.contactNumber ?? ''} onChange={(e) => onUpdate('contactNumber', e.target.value)} className="editorial-input" />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input placeholder="Accounts contact name" value={branch.accountsContactName ?? ''} onChange={(e) => onUpdate('accountsContactName', e.target.value)} className="editorial-input" />
        <input placeholder="Accounts email" type="email" value={branch.accountsEmail ?? ''} onChange={(e) => onUpdate('accountsEmail', e.target.value)} className="editorial-input" />
        <input placeholder="Accounts contact number" value={branch.accountsContactNumber ?? ''} onChange={(e) => onUpdate('accountsContactNumber', e.target.value)} className="editorial-input" />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleAddress}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
        >
          {branch._showAddress ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {branch._showAddress ? 'Hide address' : 'Show address'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      </div>

      {branch._showAddress && (
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Branch address</div>
            <AddressFields
              address={branch.address ?? {}}
              onChange={(k, v) => onUpdateAddr('address', k, v)}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Branch postal address</div>
            <AddressFields
              address={branch.postalAddress ?? {}}
              onChange={(k, v) => onUpdateAddr('postalAddress', k, v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contact card ─────────────────────────────────────────────────────────

function ContactCard({
  contact, branches, onUpdate, onRemove,
}: {
  contact: FormContact;
  branches: FormBranch[];
  onUpdate: (key: keyof FormContact, value: unknown) => void;
  onRemove: () => void;
}) {
  // Branch tickbox UX — single-select. "No branch" sentinel renders as a
  // tickable pill alongside each branch the user has added on this form.
  // A contact created before any branch exists shows the pill list with
  // just "No branch" pre-ticked.
  const tiles = useMemo(() => {
    const list: { clientId: string | undefined; label: string }[] = [
      { clientId: undefined, label: 'No branch' },
    ];
    for (const b of branches) {
      list.push({
        clientId: b._clientId,
        label: b.branchName.trim() || 'Untitled branch',
      });
    }
    return list;
  }, [branches]);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input placeholder="Contact name" value={contact.name} onChange={(e) => onUpdate('name', e.target.value)} className="editorial-input" />
        <input placeholder="Role" value={contact.role ?? ''} onChange={(e) => onUpdate('role', e.target.value)} className="editorial-input" />
        <input placeholder="Email" type="email" value={contact.email ?? ''} onChange={(e) => onUpdate('email', e.target.value)} className="editorial-input" />
        <input placeholder="Mobile" value={contact.mobile ?? ''} onChange={(e) => onUpdate('mobile', e.target.value)} className="editorial-input" />
      </div>
      <input
        placeholder="Notes"
        value={contact.notes ?? ''}
        onChange={(e) => onUpdate('notes', e.target.value)}
        className="editorial-input mt-2"
      />

      <div className="mt-3">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Branch
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tiles.map((t) => {
            const active = contact._branchClientId === t.clientId;
            return (
              <button
                key={t.clientId ?? '__none__'}
                type="button"
                onClick={() => onUpdate('_branchClientId', t.clientId)}
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
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" /> Remove
        </button>
      </div>
    </div>
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

function F({
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

function AddressFields({
  address, onChange,
}: { address: SupplierAddress; onChange: (k: keyof SupplierAddress, v: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input placeholder="Street" value={address.street ?? ''} onChange={(e) => onChange('street', e.target.value)} className="editorial-input sm:col-span-2" />
      <input placeholder="Suburb" value={address.suburb ?? ''} onChange={(e) => onChange('suburb', e.target.value)} className="editorial-input" />
      <input placeholder="State" value={address.state ?? ''} onChange={(e) => onChange('state', e.target.value)} className="editorial-input" />
      <input placeholder="Postcode" value={address.postcode ?? ''} onChange={(e) => onChange('postcode', e.target.value)} className="editorial-input" />
      <input placeholder="Country" value={address.country ?? ''} onChange={(e) => onChange('country', e.target.value)} className="editorial-input" />
    </div>
  );
}

// ─── Save paths ───────────────────────────────────────────────────────────

function formToRootInput(form: FormState): SupplierInput {
  return {
    name: form.name,
    abn: form.abn || undefined,
    website: form.website || undefined,
    mainEmail: form.mainEmail || undefined,
    mainContactNumber: form.mainContactNumber || undefined,
    mainContactName: form.mainContactName || undefined,
    accountsEmail: form.accountsEmail || undefined,
    accountsContactNumber: form.accountsContactNumber || undefined,
    accountsContactName: form.accountsContactName || undefined,
    mainAddress: form.mainAddress,
    postalAddress: form.postalAddress,
    notes: form.notes || undefined,
  };
}

function formBranchToInput(b: FormBranch): BranchInput {
  return {
    branchName: b.branchName,
    email: b.email || undefined,
    contactNumber: b.contactNumber || undefined,
    contactName: b.contactName || undefined,
    accountsEmail: b.accountsEmail || undefined,
    accountsContactNumber: b.accountsContactNumber || undefined,
    accountsContactName: b.accountsContactName || undefined,
    address: b.address,
    postalAddress: b.postalAddress,
  };
}

function formContactToInput(c: FormContact, branchIdByClient: Map<string, string>): ContactInput {
  return {
    name: c.name,
    email: c.email || undefined,
    mobile: c.mobile || undefined,
    role: c.role || undefined,
    notes: c.notes || undefined,
    branchId: c._branchClientId ? branchIdByClient.get(c._branchClientId) : undefined,
  };
}

// Two-pass: insert root + branches in one shot via createSupplier (which
// preserves order), then pivot on the returned branch ids to insert each
// contact with its branchId resolved. Saves a round-trip on the root path
// without tangling the simple createSupplier signature.
async function saveCreate(form: FormState): Promise<void> {
  const branchInputs = form.branches.map(formBranchToInput);
  const created = await createSupplier({
    ...formToRootInput(form),
    branches: branchInputs,
    // Drop contacts here — we'll add them in a second pass with resolved ids.
    contacts: [],
  });
  const branchIdByClient = new Map<string, string>();
  (created.branches ?? []).forEach((b, i) => {
    const clientId = form.branches[i]?._clientId;
    if (clientId) branchIdByClient.set(clientId, b.id);
  });
  for (const c of form.contacts) {
    await addSupplierContact(created.id, formContactToInput(c, branchIdByClient));
  }
}

// Diff against the snapshot the modal opened with, then call the granular
// helpers. Branches resolve first so contact rows can name them by id.
async function saveEdit(existing: Supplier, form: FormState): Promise<void> {
  // 1. Root patch — only fields that actually differ.
  const rootPatch = computeRootPatch(existing, form);
  if (Object.keys(rootPatch).length > 0) {
    await updateSupplier(existing.id, rootPatch);
  }

  // 2. Branches.
  const existingBranchById = new Map((existing.branches ?? []).map((b) => [b.id, b]));
  const branchIdByClient = new Map<string, string>();
  const formBranchIds = new Set<string>();

  for (const b of form.branches) {
    if (b.id) {
      formBranchIds.add(b.id);
      branchIdByClient.set(b._clientId, b.id);
      const ex = existingBranchById.get(b.id);
      if (ex && branchDiffers(ex, b)) {
        await updateSupplierBranch(b.id, formBranchToInput(b));
      }
    } else {
      const created = await addSupplierBranch(existing.id, formBranchToInput(b));
      branchIdByClient.set(b._clientId, created.id);
    }
  }
  for (const ex of existing.branches ?? []) {
    if (!formBranchIds.has(ex.id)) {
      await deleteSupplierBranch(ex.id);
    }
  }

  // 3. Contacts.
  const existingContactById = new Map((existing.contacts ?? []).map((c) => [c.id, c]));
  const formContactIds = new Set<string>();
  for (const c of form.contacts) {
    const payload = formContactToInput(c, branchIdByClient);
    if (c.id) {
      formContactIds.add(c.id);
      const ex = existingContactById.get(c.id);
      if (ex && contactDiffers(ex, c, payload.branchId)) {
        await updateSupplierContact(c.id, payload);
      }
    } else {
      await addSupplierContact(existing.id, payload);
    }
  }
  for (const ex of existing.contacts ?? []) {
    if (!formContactIds.has(ex.id)) {
      await deleteSupplierContact(ex.id);
    }
  }
}

function computeRootPatch(existing: Supplier, form: FormState): Partial<SupplierInput> {
  const candidate = formToRootInput(form);
  const patch: Partial<SupplierInput> = {};
  const keys: (keyof SupplierInput)[] = [
    'name', 'abn', 'website', 'mainEmail', 'mainContactNumber', 'mainContactName',
    'accountsEmail', 'accountsContactNumber', 'accountsContactName', 'notes',
  ];
  for (const k of keys) {
    if ((candidate[k] ?? null) !== ((existing[k as keyof Supplier] as string | undefined) ?? null)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[k] = candidate[k];
    }
  }
  if (!addressEqual(existing.mainAddress, form.mainAddress)) patch.mainAddress = form.mainAddress;
  if (!addressEqual(existing.postalAddress, form.postalAddress)) patch.postalAddress = form.postalAddress;
  return patch;
}

function addressEqual(a?: SupplierAddress, b?: SupplierAddress): boolean {
  const aa = a ?? {};
  const bb = b ?? {};
  return (
    (aa.street ?? '') === (bb.street ?? '') &&
    (aa.suburb ?? '') === (bb.suburb ?? '') &&
    (aa.state ?? '') === (bb.state ?? '') &&
    (aa.postcode ?? '') === (bb.postcode ?? '') &&
    (aa.country ?? '') === (bb.country ?? '')
  );
}

function branchDiffers(existing: SupplierBranch, form: FormBranch): boolean {
  return (
    existing.branchName !== form.branchName ||
    (existing.email ?? '') !== (form.email ?? '') ||
    (existing.contactNumber ?? '') !== (form.contactNumber ?? '') ||
    (existing.contactName ?? '') !== (form.contactName ?? '') ||
    (existing.accountsEmail ?? '') !== (form.accountsEmail ?? '') ||
    (existing.accountsContactNumber ?? '') !== (form.accountsContactNumber ?? '') ||
    (existing.accountsContactName ?? '') !== (form.accountsContactName ?? '') ||
    !addressEqual(existing.address, form.address) ||
    !addressEqual(existing.postalAddress, form.postalAddress)
  );
}

function contactDiffers(existing: SupplierContact, form: FormContact, resolvedBranchId: string | undefined): boolean {
  return (
    existing.name !== form.name ||
    (existing.email ?? '') !== (form.email ?? '') ||
    (existing.mobile ?? '') !== (form.mobile ?? '') ||
    (existing.role ?? '') !== (form.role ?? '') ||
    (existing.notes ?? '') !== (form.notes ?? '') ||
    (existing.branchId ?? undefined) !== resolvedBranchId
  );
}
