import { useEffect, useState } from 'react';
import { X, Plus, Trash2, FileText, Download } from 'lucide-react';
import {
  listUserDocuments,
  createUserDocument,
  deleteUserDocument,
  getDocumentSignedUrl,
} from '../../../lib/api/userDocuments';
import type { ExpiryAlert, Profile, UserDocument } from '../../../types';

interface Props {
  profile: Profile;
  onClose: () => void;
}

const ALERT_OPTIONS: { value: ExpiryAlert; label: string }[] = [
  { value: '2_months', label: '2 months before' },
  { value: '1_month',  label: '1 month before' },
  { value: '3_weeks',  label: '3 weeks before' },
  { value: '2_weeks',  label: '2 weeks before' },
  { value: '1_week',   label: '1 week before' },
];

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function UserDocuments({ profile, onClose }: Props) {
  const [docs, setDocs] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setDocs(await listUserDocuments(profile.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [profile.id]);

  const handleDelete = async (doc: UserDocument) => {
    if (!confirm(`Delete "${doc.documentName}"?`)) return;
    try {
      await deleteUserDocument(doc);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete document.');
    }
  };

  const handleDownload = async (doc: UserDocument) => {
    try {
      const url = await getDocumentSignedUrl(doc, 60);
      window.open(url, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open document.');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Documents — {profile.firstName} {profile.lastName}
            </h2>
            <p className="text-xs text-slate-500">{profile.email}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Attached documents ({docs.length})
            </h3>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" /> Add document
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
            ) : docs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                No documents attached yet.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Reference</th>
                    <th className="px-4 py-2">Expiry</th>
                    <th className="px-4 py-2">Alert</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-2 font-medium text-slate-900">
                        <span className="inline-flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400" />
                          {d.documentName}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{d.referenceNo ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{d.expiryDate ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">
                        {d.expiryAlert ? d.expiryAlert.replace('_', ' ') : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDownload(d)}
                            title="Download"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(d)}
                            title="Delete"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {adding && (
          <AddDocumentForm
            userId={profile.id}
            onClose={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              void refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

function AddDocumentForm({
  userId,
  onClose,
  onSaved,
}: {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [documentName, setDocumentName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryAlert, setExpiryAlert] = useState<ExpiryAlert | ''>('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a file to upload.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File too large (10 MB max).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createUserDocument({
        userId,
        documentName,
        referenceNo: referenceNo || undefined,
        expiryDate: expiryDate || undefined,
        expiryAlert: expiryAlert || undefined,
        notes: notes || undefined,
        file,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-slate-900">Attach document</h3>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Document Name *</span>
          <input
            required
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">File *</span>
          <input
            required
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Reference No.</span>
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Expiry Date</span>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Expiry Alert</span>
          <select
            value={expiryAlert}
            onChange={(e) => setExpiryAlert((e.target.value || '') as ExpiryAlert | '')}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">No alert</option>
            {ALERT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </div>
  );
}
