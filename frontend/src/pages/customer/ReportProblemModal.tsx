// ReportProblemModal — customer-facing maintenance request form.
//
// RLS-safe: only calls createRequest (source='portal') + uploadRequestPhoto.
// No update/delete calls anywhere.
// Photo uploads are best-effort: a per-photo failure does NOT lose the request.
// Object URLs are revoked on cleanup and the file input resets after submit.

import { useEffect, useRef, useState } from 'react';
import { X, Camera, ImagePlus, AlertTriangle } from 'lucide-react';
import { createRequest, uploadRequestPhoto, type MaintenanceRequest } from '../../lib/api/maintenanceRequests';
import type { Property } from '../../lib/api/properties';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { FRAUNCES } from '../gantt/components/ledger';

// ─── Urgency options ─────────────────────────────────────────────────────────

interface UrgencyOption {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
  sub: string;
  activeClasses: string;
}

const URGENCY_OPTIONS: UrgencyOption[] = [
  {
    value: 5,
    label: 'Emergency',
    sub: 'Drop everything — it needs attention right now.',
    activeClasses: 'border-[#C44545] bg-[#FBE5E5] text-[#C44545]',
  },
  {
    value: 4,
    label: 'Urgent',
    sub: 'Needs attention this week.',
    activeClasses: 'border-[#B5602A] bg-[#F6E7DA] text-[#B5602A]',
  },
  {
    value: 3,
    label: 'Standard',
    sub: 'Schedule it in when convenient.',
    activeClasses: 'border-[#C8841E] bg-[#F9EFD9] text-[#C8841E]',
  },
  {
    value: 2,
    label: 'Low',
    sub: 'Whenever you\'re nearby — no rush.',
    activeClasses: 'border-[#5B6B7B] bg-[#EEF1F4] text-[#5B6B7B]',
  },
  {
    value: 1,
    label: 'Fill-in job',
    sub: 'Pick it up when you have spare time.',
    activeClasses: 'border-[#A0A0A0] bg-[#F5F5F5] text-[#6B6B6B]',
  },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReportProblemModalProps {
  properties: Property[];
  onClose: () => void;
  /** Called on successful submission with a toast message to display. */
  onCreated: (message: string) => void;
}

// ─── Photo preview ───────────────────────────────────────────────────────────

interface PhotoPreview {
  file: File;
  objectUrl: string;
}

export default function ReportProblemModal({
  properties,
  onClose,
  onCreated,
}: ReportProblemModalProps) {
  const singleProperty = properties.length === 1 ? properties[0] : null;

  const [propertyId, setPropertyId] = useState<string>(
    singleProperty?.id ?? (properties[0]?.id ?? ''),
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [previews, setPreviews] = useState<PhotoPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Refs for resetting file inputs after submit.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Keep a ref in sync with the latest previews so the unmount cleanup
  // always revokes the current set of object URLs (not the stale first-render []).
  const previewsRef = useRef<PhotoPreview[]>(previews);
  previewsRef.current = previews;

  // Revoke object URLs on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      previewsRef.current.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    };
  }, []);

  function addFiles(files: File[]) {
    const newPreviews = files.map((f) => ({ file: f, objectUrl: URL.createObjectURL(f) }));
    setPreviews((prev) => [...prev, ...newPreviews]);
  }

  function removePhoto(index: number) {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index].objectUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!propertyId) return setError('Please select a property.');
    if (!title.trim()) return setError('Please enter a brief title for the problem.');

    setSaving(true);
    let created: MaintenanceRequest | null = null;

    try {
      created = await createRequest({
        propertyId,
        title: title.trim(),
        description: description.trim() || undefined,
        urgency,
        source: 'portal',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the request — please try again.');
      setSaving(false);
      return;
    }

    // Upload photos best-effort: failures do NOT cancel the submitted request.
    let photoFailures = 0;
    for (const preview of previews) {
      try {
        await uploadRequestPhoto(created.id, preview.file);
      } catch {
        photoFailures++;
      }
    }

    // Revoke all object URLs now that we're done.
    previews.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    // Reset file inputs so the browser clears the "chosen" state.
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';

    const photoNote =
      photoFailures > 0
        ? ` (${photoFailures} photo${photoFailures === 1 ? '' : 's'} couldn't be uploaded — we'll still follow up.)`
        : '';

    onCreated(`Reported — we've been notified.${photoNote}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/50 sm:items-center sm:p-4">
      <div
        className="flex max-h-[95dvh] w-full flex-col overflow-hidden rounded-t-[20px] border border-[#E6E1D4] bg-white shadow-[0_-4px_32px_rgba(20,20,20,0.14)] sm:max-w-lg sm:rounded-[16px]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E6E1D4] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B6B6B]">
              Report a problem
            </p>
            <h2
              className="mt-0.5 text-[22px] font-medium leading-tight text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              What's the issue?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">

            {/* Property picker (skip if only 1 active property) */}
            {singleProperty ? (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                  Property
                </label>
                <p className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-3 text-[15px] font-medium text-[#1A1A1A]">
                  {singleProperty.name}
                  {singleProperty.suburb ? (
                    <span className="ml-1.5 font-normal text-[#6B6B6B]">· {singleProperty.suburb}</span>
                  ) : null}
                </p>
              </div>
            ) : properties.length > 0 ? (
              <div>
                <label
                  htmlFor="portal-property"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
                >
                  Which property? <span className="text-[#C44545]">*</span>
                </label>
                <select
                  id="portal-property"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="block w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-3 text-[15px] text-[#1A1A1A] shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                >
                  <option value="">Select a property…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.suburb ? ` — ${p.suburb}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-[10px] border border-[#F0D5A0] bg-[#F9EFD9] px-4 py-3">
                <p className="text-[13px] text-[#C8841E]">
                  No properties are linked to your account yet. Contact Casone Electrical to get set up.
                </p>
              </div>
            )}

            {/* Title */}
            <div>
              <label
                htmlFor="portal-title"
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
              >
                What's the problem? <span className="text-[#C44545]">*</span>
              </label>
              <Input
                id="portal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Lights not working in main office"
                className="text-[15px] py-3"
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="portal-description"
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]"
              >
                More details <span className="font-normal text-[#A0A0A0]">(optional)</span>
              </label>
              <textarea
                id="portal-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-3 text-[15px] shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                placeholder="What happened? When did it start? Any other context…"
              />
            </div>

            {/* Urgency — five large tappable rows */}
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                How urgent is it?
              </label>
              <div className="space-y-2">
                {URGENCY_OPTIONS.map((opt) => {
                  const isActive = urgency === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setUrgency(opt.value)}
                      className={`flex w-full items-start gap-3 rounded-[12px] border px-4 py-3.5 text-left transition-all active:scale-[0.99] ${
                        isActive
                          ? opt.activeClasses
                          : 'border-[#E6E1D4] bg-white text-[#1A1A1A] hover:border-[#D8D2C4] hover:bg-[#FAF8F2]'
                      }`}
                      aria-pressed={isActive}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          isActive ? 'border-current' : 'border-[#D8D2C4]'
                        }`}
                      >
                        {isActive && (
                          <span className="h-2 w-2 rounded-full bg-current" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold leading-snug">
                          {opt.label}
                        </span>
                        <span
                          className={`block text-[13px] leading-snug ${
                            isActive ? 'opacity-80' : 'text-[#6B6B6B]'
                          }`}
                        >
                          {opt.sub}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Photos */}
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                Photos <span className="font-normal text-[#A0A0A0]">(optional)</span>
              </label>

              {/* Photo action buttons */}
              <div className="flex flex-wrap gap-2">
                {/* Camera — opens device camera directly on mobile */}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#2F8F5C] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#246F47] active:bg-[#1E5C3A]">
                  <Camera className="h-4 w-4" />
                  Take photo
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) addFiles(files);
                      e.target.value = '';
                    }}
                    className="sr-only"
                  />
                </label>

                {/* Gallery picker */}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#E6E1D4] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] active:bg-[#F0EDE4]">
                  <ImagePlus className="h-4 w-4" />
                  Pick from gallery
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) addFiles(files);
                      e.target.value = '';
                    }}
                    className="sr-only"
                  />
                </label>
              </div>

              {/* Thumbnail previews */}
              {previews.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {previews.map((preview, idx) => (
                    <div key={preview.objectUrl} className="group relative">
                      <img
                        src={preview.objectUrl}
                        alt={`Photo ${idx + 1}`}
                        className="h-20 w-20 rounded-[10px] border border-[#E6E1D4] object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#C44545] text-white shadow-sm transition-opacity"
                        aria-label={`Remove photo ${idx + 1}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-[10px] border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#C44545]" />
                <p className="text-[13px] text-[#C44545]">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || properties.length === 0}
              className="min-w-[140px]"
            >
              {saving ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
