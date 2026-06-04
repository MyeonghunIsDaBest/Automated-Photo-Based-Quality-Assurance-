import { useState } from 'react';
import { Upload as UploadIcon, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useAppStore } from '../../../store';
import { createSafetyDocument } from '../../../lib/api/safetyDocuments';
import { CATEGORY_BLURB, CATEGORY_LABEL, SafetyDocCategory, SafetyDocument } from '../types';
import { FRAUNCES } from '../../gantt/components/ledger';

interface SafetyDocumentModalProps {
  open: boolean;
  projectId: string;
  initialCategory?: SafetyDocCategory;
  onClose: () => void;
  // Full-swap: the modal persists to Supabase and hands the saved row back so
  // the page can render it optimistically (realtime dedupes the echo by id).
  onCreated?: (doc: SafetyDocument) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function SafetyDocumentModal({
  open, projectId, initialCategory, onClose, onCreated,
}: SafetyDocumentModalProps) {
  const currentUser = useAppStore((s) => s.currentUser);

  const [category, setCategory] = useState<SafetyDocCategory>(initialCategory ?? 'ohse');
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError('Title is required.');
    if (!file) return setError('Please attach a file.');
    if (expiryDate && new Date(expiryDate) < new Date(effectiveDate)) {
      return setError('Expiry must be after the effective date.');
    }

    setSaving(true);
    try {
      const saved = await createSafetyDocument(projectId, {
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
      onCreated?.(saved);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the document.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4">
      <div
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              Safety document
            </p>
            <h2
              className="mt-1 text-xl font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              Upload a {CATEGORY_LABEL[category]} document
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="editorial-scrollbox flex-1 space-y-5 px-6 py-5">

            {/* Category toggle */}
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {(['ohse', 'swms', 'msds'] as SafetyDocCategory[]).map((cat) => {
                  const isActive = cat === category;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`rounded-[10px] border px-3 py-2.5 text-left transition-all ${
                        isActive
                          ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-sm'
                          : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4]'
                      }`}
                    >
                      <p className="text-sm font-medium">{CATEGORY_LABEL[cat]}</p>
                      <p className={`mt-0.5 text-[11px] ${isActive ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'}`}>
                        {cat === 'ohse' && 'Policy / induction'}
                        {cat === 'swms' && 'Per high-risk task'}
                        {cat === 'msds' && 'Chemical / material'}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-[#6B6B6B]">{CATEGORY_BLURB[category]}</p>
            </div>

            {/* Title + Reference */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Title</label>
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
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Reference / Doc ID <span className="font-normal text-[#A0A0A0]">(optional)</span>
                </label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. SWMS-014"
                />
              </div>
            </div>

            {/* Effective + Expiry dates */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Effective Date</label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Expiry Date <span className="font-normal text-[#A0A0A0]">(optional)</span>
                </label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            {/* File drop zone */}
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Document file</label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-[#E6E1D4] bg-[#FAF8F2] px-6 py-8 text-center transition-all hover:border-[#D8D2C4] hover:bg-[#F0EDE4]">
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <UploadIcon className="h-6 w-6 text-[#A0A0A0]" />
                <p className="mt-2 text-sm font-medium text-[#1A1A1A]">
                  {file ? file.name : 'Click to choose a file'}
                </p>
                <p className="mt-0.5 text-xs text-[#6B6B6B]">
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB`
                    : 'PDF, DOC, or image up to 10 MB'}
                </p>
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                Notes <span className="font-normal text-[#A0A0A0]">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-base shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                placeholder="Any context the team should see at a glance"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Uploading…' : 'Upload document'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
