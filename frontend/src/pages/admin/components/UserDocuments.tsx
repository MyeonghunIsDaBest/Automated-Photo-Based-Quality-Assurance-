import { useEffect, useState } from 'react';
import { Plus, Trash2, FileText, Download, UploadCloud } from 'lucide-react';
import {
  listUserDocuments,
  createUserDocument,
  deleteUserDocument,
  getDocumentSignedUrl,
} from '../../../lib/api/userDocuments';
import type { ExpiryAlert, Profile, UserDocument } from '../../../types';
import {
  EditorialButton,
  EditorialModal,
  ResponsiveDataTable,
  type ColumnDef,
} from '../../../components/editorial';

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

  const renderActions = (d: UserDocument) => (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void handleDownload(d); }}
        title="Download"
        aria-label="Download"
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <Download className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void handleDelete(d); }}
        title="Delete"
        aria-label="Delete"
        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );

  const columns: ColumnDef<UserDocument>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (d) => (
        <span className="inline-flex items-center gap-2 font-medium text-slate-900">
          <FileText className="h-4 w-4 text-slate-400" />
          {d.documentName}
        </span>
      ),
    },
    { key: 'reference', header: 'Reference', cell: (d) => <span className="text-slate-600">{d.referenceNo ?? '—'}</span> },
    { key: 'expiry',    header: 'Expiry',    cell: (d) => <span className="text-slate-600">{d.expiryDate ?? '—'}</span> },
    {
      key: 'alert',
      header: 'Alert',
      cell: (d) => (
        <span className="text-slate-600">
          {d.expiryAlert ? d.expiryAlert.replace('_', ' ') : '—'}
        </span>
      ),
    },
    { key: 'actions', header: '', align: 'right', cell: renderActions },
  ];

  return (
    <>
      <EditorialModal
        open
        onClose={onClose}
        eyebrow={`Documents · ${profile.email}`}
        title={[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'User documents'}
        size="xl"
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {docs.length} attached document{docs.length === 1 ? '' : 's'}.
          </p>
          <EditorialButton
            variant="pill"
            trailingIcon="none"
            onClick={() => setAdding(true)}
            className="self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add document
          </EditorialButton>
        </div>

        {error && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
          ) : (
            <ResponsiveDataTable<UserDocument>
              columns={columns}
              rows={docs}
              rowKey={(d) => d.id}
              empty="No documents attached yet."
              mobileCard={(d) => (
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-900">
                        <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="truncate">{d.documentName}</span>
                      </p>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        {d.referenceNo && <span>Ref: {d.referenceNo}</span>}
                        {d.expiryDate && <span>Expires: {d.expiryDate}</span>}
                        {d.expiryAlert && <span>Alert: {d.expiryAlert.replace('_', ' ')}</span>}
                      </div>
                    </div>
                    {renderActions(d)}
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </EditorialModal>

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
    </>
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
    <EditorialModal
      open
      onClose={onClose}
      eyebrow="Documents · Upload"
      title="Attach document"
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
            form="add-document-form"
            disabled={saving}
          >
            {saving ? 'Uploading…' : 'Upload'}
          </EditorialButton>
        </div>
      }
    >
      <form id="add-document-form" onSubmit={handleSave} className="space-y-3">
        <Field label="Document name" required>
          <input
            required
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            className="editorial-input"
          />
        </Field>

        {/* The file picker is rendered as a labeled button so it picks up the
            same touch target sizing as the rest of the form on mobile. */}
        <Field label="File" required>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-100">
            <UploadCloud className="h-5 w-5 flex-shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">
              {file ? file.name : 'Tap to choose a file (PDF, image, doc — 10 MB max)'}
            </span>
            <input
              required
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reference no.">
            <input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="editorial-input"
            />
          </Field>
          <Field label="Expiry date">
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="editorial-input"
            />
          </Field>
        </div>

        <Field label="Expiry alert">
          <select
            value={expiryAlert}
            onChange={(e) => setExpiryAlert((e.target.value || '') as ExpiryAlert | '')}
            className="editorial-input"
          >
            <option value="">No alert</option>
            {ALERT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="editorial-input"
          />
        </Field>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
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
