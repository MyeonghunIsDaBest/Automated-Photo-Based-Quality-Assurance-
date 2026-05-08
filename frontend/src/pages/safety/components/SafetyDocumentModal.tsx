import { useState } from 'react';
import { Upload as UploadIcon, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useAppStore } from '../../../store';
import { useSafetyStore } from '../store';
import { CATEGORY_BLURB, CATEGORY_LABEL, SafetyDocCategory } from '../types';

interface SafetyDocumentModalProps {
  open: boolean;
  initialCategory?: SafetyDocCategory;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function SafetyDocumentModal({ open, initialCategory, onClose }: SafetyDocumentModalProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const addDocument = useSafetyStore((s) => s.addDocument);

  const [category, setCategory] = useState<SafetyDocCategory>(initialCategory ?? 'ohse');
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setCategory(initialCategory ?? 'ohse');
    setTitle('');
    setReference('');
    setEffectiveDate(today());
    setExpiryDate('');
    setFile(null);
    setNotes('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError('Title is required.');
    if (!file) return setError('Please attach a file.');
    if (expiryDate && new Date(expiryDate) < new Date(effectiveDate)) {
      return setError('Expiry must be after the effective date.');
    }

    addDocument({
      category,
      title: title.trim(),
      reference: reference.trim() || undefined,
      effectiveDate,
      expiryDate: expiryDate || undefined,
      fileName: file.name,
      fileSizeKb: Math.round(file.size / 1024),
      uploadedBy: currentUser?.fullName ?? 'Unknown',
      uploadedAt: new Date().toISOString(),
      notes: notes.trim() || undefined,
    });

    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Safety document
            </p>
            <h2
              className="mt-1 text-xl font-medium text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
            >
              Upload a {CATEGORY_LABEL[category]} document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="editorial-scrollbox flex-1 space-y-5 px-6 py-5">
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-700">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {(['ohse', 'swms', 'msds'] as SafetyDocCategory[]).map((cat) => {
                  const isActive = cat === category;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <p className="text-sm font-medium">{CATEGORY_LABEL[cat]}</p>
                      <p className={`mt-0.5 text-[11px] ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                        {cat === 'ohse' && 'Policy / induction'}
                        {cat === 'swms' && 'Per high-risk task'}
                        {cat === 'msds' && 'Chemical / material'}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">{CATEGORY_BLURB[category]}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    category === 'swms'
                      ? 'e.g. Working at heights — switchboard install'
                      : category === 'msds'
                      ? 'e.g. Acetone — safety data sheet'
                      : 'e.g. Site induction handbook v3'
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Reference / Doc ID <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. SWMS-014"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Effective Date</label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Expiry Date <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-700">Document file</label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center transition-all hover:border-slate-300 hover:bg-slate-100">
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <UploadIcon className="h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {file ? file.name : 'Click to choose a file'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB`
                    : 'PDF, DOC, or image up to 10 MB'}
                </p>
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Any context the team should see at a glance"
              />
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Upload document</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
