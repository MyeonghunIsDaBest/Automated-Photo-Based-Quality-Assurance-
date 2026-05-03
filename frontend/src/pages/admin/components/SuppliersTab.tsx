import { useEffect, useState } from 'react';
import { Plus, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react';
import {
  listSuppliers,
  createSupplier,
  deleteSupplier,
  type SupplierInput,
} from '../../../lib/api/suppliers';
import type { Supplier, SupplierAddress } from '../../../types';

const EMPTY_ADDRESS: SupplierAddress = {};

const EMPTY_FORM: SupplierInput = {
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
  contacts: [],
  branches: [],
};

export default function SuppliersTab() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Suppliers ({items.length})</h2>
          <p className="text-sm text-slate-500">
            Vendors and material suppliers. Each can have multiple contacts and branches.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => toggleExpanded(s.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                    <div>
                      <div className="font-medium text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-500">
                        {s.abn && <>ABN {s.abn} · </>}
                        {(s.contacts?.length ?? 0)} contact{(s.contacts?.length ?? 0) === 1 ? '' : 's'} ·
                        {' '}{(s.branches?.length ?? 0)} branch{(s.branches?.length ?? 0) === 1 ? '' : 'es'}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {isOpen && (
                  <div className="space-y-4 border-t border-slate-100 bg-slate-50 px-4 py-4 text-sm">
                    <DetailGrid s={s} />
                    <ChildList title="Contacts" empty="No contacts">
                      {(s.contacts ?? []).map((c) => (
                        <li key={c.id} className="flex justify-between rounded-md bg-white px-3 py-2">
                          <span className="font-medium text-slate-800">{c.name}</span>
                          <span className="text-slate-500">
                            {[c.role, c.email, c.mobile].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </li>
                      ))}
                    </ChildList>
                    <ChildList title="Branches" empty="No branches">
                      {(s.branches ?? []).map((b) => (
                        <li key={b.id} className="flex justify-between rounded-md bg-white px-3 py-2">
                          <span className="font-medium text-slate-800">{b.branchName}</span>
                          <span className="text-slate-500">
                            {[b.contactName, b.email, b.contactNumber].filter(Boolean).join(' · ') || '—'}
                          </span>
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

      {adding && (
        <AddSupplierModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void refresh(); }} />
      )}
    </div>
  );
}

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
  return [a.street, a.suburb, a.state, a.postcode, a.country].filter(Boolean).join(', ');
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

function AddSupplierModal({
  onClose, onSaved,
}: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<SupplierInput>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: keyof SupplierInput, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value as never }));

  const setAddrField = (kind: 'mainAddress' | 'postalAddress', key: keyof SupplierAddress, value: string) =>
    setForm((f) => ({ ...f, [kind]: { ...(f[kind] ?? {}), [key]: value } }));

  const addContact = () =>
    setForm((f) => ({ ...f, contacts: [...(f.contacts ?? []), { name: '', email: '', mobile: '', role: '', notes: '', branchId: undefined }] }));
  const updateContact = (idx: number, key: string, value: string) =>
    setForm((f) => ({ ...f, contacts: (f.contacts ?? []).map((c, i) => i === idx ? { ...c, [key]: value } : c) }));
  const removeContact = (idx: number) =>
    setForm((f) => ({ ...f, contacts: (f.contacts ?? []).filter((_, i) => i !== idx) }));

  const addBranch = () =>
    setForm((f) => ({ ...f, branches: [...(f.branches ?? []), { branchName: '', email: '', contactNumber: '', contactName: '', accountsEmail: '', accountsContactNumber: '', accountsContactName: '', address: {}, postalAddress: {} }] }));
  const updateBranch = (idx: number, key: string, value: string) =>
    setForm((f) => ({ ...f, branches: (f.branches ?? []).map((b, i) => i === idx ? { ...b, [key]: value } : b) }));
  const removeBranch = (idx: number) =>
    setForm((f) => ({ ...f, branches: (f.branches ?? []).filter((_, i) => i !== idx) }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createSupplier(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form onSubmit={handleSave} className="max-h-[90vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Add Supplier</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <Section title="Main details">
          <div className="grid grid-cols-2 gap-3">
            <F label="Supplier Name" required>
              <input required value={form.name} onChange={(e) => setField('name', e.target.value)} className="input" />
            </F>
            <F label="ABN">
              <input value={form.abn} onChange={(e) => setField('abn', e.target.value)} className="input" />
            </F>
            <F label="Website">
              <input value={form.website} onChange={(e) => setField('website', e.target.value)} className="input" />
            </F>
            <F label="Notes">
              <input value={form.notes} onChange={(e) => setField('notes', e.target.value)} className="input" />
            </F>
            <F label="Main Email"><input type="email" value={form.mainEmail} onChange={(e) => setField('mainEmail', e.target.value)} className="input" /></F>
            <F label="Main Contact Number"><input value={form.mainContactNumber} onChange={(e) => setField('mainContactNumber', e.target.value)} className="input" /></F>
            <F label="Main Contact Name"><input value={form.mainContactName} onChange={(e) => setField('mainContactName', e.target.value)} className="input" /></F>
            <F label="Accounts Email"><input type="email" value={form.accountsEmail} onChange={(e) => setField('accountsEmail', e.target.value)} className="input" /></F>
            <F label="Accounts Contact Number"><input value={form.accountsContactNumber} onChange={(e) => setField('accountsContactNumber', e.target.value)} className="input" /></F>
            <F label="Accounts Contact Name"><input value={form.accountsContactName} onChange={(e) => setField('accountsContactName', e.target.value)} className="input" /></F>
          </div>
        </Section>

        <Section title="Main Address">
          <AddressFields
            address={form.mainAddress ?? {}}
            onChange={(k, v) => setAddrField('mainAddress', k, v)}
          />
        </Section>

        <Section title="Postal Address">
          <AddressFields
            address={form.postalAddress ?? {}}
            onChange={(k, v) => setAddrField('postalAddress', k, v)}
          />
        </Section>

        <Section title={`Contacts (${form.contacts?.length ?? 0})`} action={
          <button type="button" onClick={addContact} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
            + Add contact
          </button>
        }>
          <div className="space-y-2">
            {(form.contacts ?? []).map((c, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Name" value={c.name} onChange={(e) => updateContact(idx, 'name', e.target.value)} className="input" />
                  <input placeholder="Role" value={c.role ?? ''} onChange={(e) => updateContact(idx, 'role', e.target.value)} className="input" />
                  <input placeholder="Email" type="email" value={c.email ?? ''} onChange={(e) => updateContact(idx, 'email', e.target.value)} className="input" />
                  <input placeholder="Mobile" value={c.mobile ?? ''} onChange={(e) => updateContact(idx, 'mobile', e.target.value)} className="input" />
                </div>
                <div className="mt-2 text-right">
                  <button type="button" onClick={() => removeContact(idx)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={`Branches (${form.branches?.length ?? 0})`} action={
          <button type="button" onClick={addBranch} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
            + Add branch
          </button>
        }>
          <div className="space-y-2">
            {(form.branches ?? []).map((b, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Branch Name" value={b.branchName} onChange={(e) => updateBranch(idx, 'branchName', e.target.value)} className="input" />
                  <input placeholder="Contact Name" value={b.contactName ?? ''} onChange={(e) => updateBranch(idx, 'contactName', e.target.value)} className="input" />
                  <input placeholder="Email" type="email" value={b.email ?? ''} onChange={(e) => updateBranch(idx, 'email', e.target.value)} className="input" />
                  <input placeholder="Contact Number" value={b.contactNumber ?? ''} onChange={(e) => updateBranch(idx, 'contactNumber', e.target.value)} className="input" />
                </div>
                <div className="mt-2 text-right">
                  <button type="button" onClick={() => removeBranch(idx)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Supplier'}
          </button>
        </div>

        <style>{`
          .input { display:block; width:100%; border-radius:0.5rem; border:1px solid rgb(203 213 225); padding:0.5rem 0.75rem; font-size:0.875rem; outline:none; }
          .input:focus { border-color: rgb(15 23 42); }
        `}</style>
      </form>
    </div>
  );
}

function Section({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
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
    <div className="grid grid-cols-2 gap-2">
      <input placeholder="Street" value={address.street ?? ''} onChange={(e) => onChange('street', e.target.value)} className="input col-span-2" />
      <input placeholder="Suburb" value={address.suburb ?? ''} onChange={(e) => onChange('suburb', e.target.value)} className="input" />
      <input placeholder="State" value={address.state ?? ''} onChange={(e) => onChange('state', e.target.value)} className="input" />
      <input placeholder="Postcode" value={address.postcode ?? ''} onChange={(e) => onChange('postcode', e.target.value)} className="input" />
      <input placeholder="Country" value={address.country ?? ''} onChange={(e) => onChange('country', e.target.value)} className="input" />
    </div>
  );
}
