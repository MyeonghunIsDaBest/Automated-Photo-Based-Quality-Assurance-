import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  listStakeholders,
  createStakeholder,
  deleteStakeholder,
  type StakeholderInput,
} from '../../../lib/api/stakeholders';
import type { Stakeholder } from '../../../types';
import {
  EditorialButton,
  EditorialModal,
  ResponsiveDataTable,
  type ColumnDef,
} from '../../../components/editorial';

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

  const columns: ColumnDef<Stakeholder>[] = [
    {
      key: 'company',
      header: 'Company',
      cell: (s) => <span className="font-medium text-slate-900">{s.companyName}</span>,
    },
    {
      key: 'contact',
      header: 'Contact',
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
      key: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void handleDelete(s); }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
          title="Delete"
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">
            Stakeholders ({items.length})
          </h2>
          <p className="text-sm text-slate-500">
            External contacts (clients, consultants, council reps).
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
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(s); }}
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  {s.email && <span>{s.email}</span>}
                  {s.mobile && <span>{s.mobile}</span>}
                </div>
              </div>
            )}
          />
        )}
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
    <EditorialModal
      open
      onClose={onClose}
      eyebrow="Section · Stakeholders"
      title="Add stakeholder"
      size="md"
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
            {saving ? 'Saving…' : 'Save'}
          </EditorialButton>
        </div>
      }
    >
      <form id="stakeholder-form" onSubmit={handleSave} className="space-y-3">
        <Field label="Company name" required>
          <input required value={form.companyName} onChange={(e) => setField('companyName', e.target.value)} className="editorial-input" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" required>
            <input required value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} className="editorial-input" />
          </Field>
          <Field label="Last name" required>
            <input required value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} className="editorial-input" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} className="editorial-input" />
          </Field>
          <Field label="Mobile">
            <input type="tel" value={form.mobile} onChange={(e) => setField('mobile', e.target.value)} className="editorial-input" />
          </Field>
        </div>
        <Field label="Role">
          <input value={form.role} onChange={(e) => setField('role', e.target.value)} className="editorial-input" />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} className="editorial-input" />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
      </form>
    </EditorialModal>
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
