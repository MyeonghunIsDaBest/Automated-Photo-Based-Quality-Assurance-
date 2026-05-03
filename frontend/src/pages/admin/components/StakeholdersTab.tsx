import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  listStakeholders,
  createStakeholder,
  deleteStakeholder,
  type StakeholderInput,
} from '../../../lib/api/stakeholders';
import type { Stakeholder } from '../../../types';

export default function StakeholdersTab() {
  const [items, setItems] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
    if (!confirm(`Delete stakeholder "${s.companyName}"?`)) return;
    try {
      await deleteStakeholder(s.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.');
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Stakeholders ({items.length})
          </h2>
          <p className="text-sm text-slate-500">
            External contacts (clients, consultants, council reps).
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> Add Stakeholder
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="-mx-4 overflow-x-auto sm:mx-0">
       <div className="inline-block min-w-full px-4 align-middle sm:px-0">
      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No stakeholders yet.</td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{s.companyName}</td>
                  <td className="px-4 py-3 text-slate-600">{s.firstName} {s.lastName}</td>
                  <td className="px-4 py-3 text-slate-600">{s.email ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.mobile ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.role ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(s)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
       </div>
      </div>

      {adding && (
        <AddStakeholderModal
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); void refresh(); }}
        />
      )}
    </div>
  );
}

function AddStakeholderModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<StakeholderInput>({
    companyName: '',
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    role: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createStakeholder(form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof StakeholderInput, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form onSubmit={handleSave} className="w-full max-w-xl space-y-3 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Add Stakeholder</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <Field label="Company Name" required>
          <input required value={form.companyName} onChange={(e) => setField('companyName', e.target.value)} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" required>
            <input required value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} className="input" />
          </Field>
          <Field label="Last Name" required>
            <input required value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} className="input" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className="input" />
          </Field>
          <Field label="Mobile">
            <input type="tel" value={form.mobile} onChange={(e) => setField('mobile', e.target.value)} className="input" />
          </Field>
        </div>
        <Field label="Role">
          <input value={form.role} onChange={(e) => setField('role', e.target.value)} className="input" />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} className="input" />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
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
