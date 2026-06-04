import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useAppStore } from '../../../store';
import { createIncidentReport } from '../../../lib/api/incidentReports';
import { IncidentReport, IncidentSeverity, IncidentType, SEVERITY_LABEL } from '../types';
import { FRAUNCES } from '../../gantt/components/ledger';

interface IncidentFormModalProps {
  open: boolean;
  projectId: string;
  initialType?: IncidentType;
  onClose: () => void;
  // Full-swap: the modal persists to Supabase and hands the saved row back so
  // the page can render it optimistically (realtime dedupes the echo by id).
  onCreated?: (incident: IncidentReport) => void;
}

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Map incident severity to the warm tone palette. */
function severityActiveClasses(s: IncidentSeverity): string {
  if (s === 'critical') return 'border-[#C44545] bg-[#FBE5E5] text-[#C44545]';
  if (s === 'high')     return 'border-[#B5602A] bg-[#F6E7DA] text-[#B5602A]';
  if (s === 'medium')   return 'border-[#C8841E] bg-[#F9EFD9] text-[#C8841E]';
  /* low */             return 'border-[#5B6B7B] bg-[#EEF1F4] text-[#5B6B7B]';
}

export function IncidentFormModal({
  open, projectId, initialType, onClose, onCreated,
}: IncidentFormModalProps) {
  const currentUser = useAppStore((s) => s.currentUser);

  const [type, setType] = useState<IncidentType>(initialType ?? 'injury');
  const [occurredAt, setOccurredAt] = useState(nowLocal());
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('low');
  const [personInvolved, setPersonInvolved] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [treatmentGiven, setTreatmentGiven] = useState('');
  const [contributingFactors, setContributingFactors] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const isInjury = type === 'injury';

  const reset = () => {
    setType(initialType ?? 'injury');
    setOccurredAt(nowLocal());
    setLocation('');
    setDescription('');
    setSeverity('low');
    setPersonInvolved('');
    setBodyPart('');
    setTreatmentGiven('');
    setContributingFactors('');
    setRecommendedAction('');
    setWitnesses('');
    setPhotos([]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!location.trim()) return setError('Location is required.');
    if (!description.trim()) return setError('Description is required.');
    if (isInjury && !personInvolved.trim()) {
      return setError('Person involved is required for an injury report.');
    }

    setSaving(true);
    try {
      const saved = await createIncidentReport(projectId, {
        type,
        occurredAt: new Date(occurredAt).toISOString(),
        location: location.trim(),
        description: description.trim(),
        severity,
        personInvolved: personInvolved.trim() || undefined,
        bodyPart: bodyPart.trim() || undefined,
        treatmentGiven: treatmentGiven.trim() || undefined,
        contributingFactors: contributingFactors.trim() || undefined,
        recommendedAction: recommendedAction.trim() || undefined,
        witnesses: witnesses.trim() || undefined,
        photoNames: photos.length ? photos.map((p) => p.name) : undefined,
        reportedBy: currentUser?.fullName ?? 'Unknown',
        reportedAt: new Date().toISOString(),
        status: 'open',
      });
      onCreated?.(saved);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit the report.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4">
      <div
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              Incident report
            </p>
            <h2
              className="mt-1 text-xl font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              {isInjury ? 'Log an injury' : 'Log a near miss'}
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

            {/* Report type toggle */}
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Report type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('injury')}
                  className={`rounded-[10px] border px-3 py-2.5 text-left transition-all ${
                    type === 'injury'
                      ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-sm'
                      : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4]'
                  }`}
                >
                  <p className="text-sm font-medium">Injury</p>
                  <p className={`mt-0.5 text-[11px] ${type === 'injury' ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'}`}>
                    Someone was hurt or required treatment.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setType('near_miss')}
                  className={`rounded-[10px] border px-3 py-2.5 text-left transition-all ${
                    type === 'near_miss'
                      ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-sm'
                      : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4]'
                  }`}
                >
                  <p className="text-sm font-medium">Near Miss</p>
                  <p className={`mt-0.5 text-[11px] ${type === 'near_miss' ? 'text-[#A0A0A0]' : 'text-[#6B6B6B]'}`}>
                    Could have caused harm — no injury occurred.
                  </p>
                </button>
              </div>
            </div>

            {/* When / Location */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">When did it happen?</label>
                <Input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Location / Zone</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Switchboard room — Level 2"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                {isInjury ? 'What happened?' : 'What almost happened?'}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-base shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                placeholder={
                  isInjury
                    ? 'Describe the incident — what was being done, what went wrong.'
                    : 'Describe the situation and the harm that could have occurred.'
                }
              />
            </div>

            {/* Severity — warm semantic tones */}
            <div>
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                {isInjury ? 'Severity' : 'Potential severity'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['low', 'medium', 'high', 'critical'] as IncidentSeverity[]).map((s) => {
                  const isActive = s === severity;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      className={`rounded-[10px] border px-3 py-2 text-sm font-medium transition-all ${
                        isActive
                          ? severityActiveClasses(s)
                          : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4]'
                      }`}
                    >
                      {SEVERITY_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Injury-specific fields */}
            {isInjury && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">Person involved</label>
                  <Input
                    value={personInvolved}
                    onChange={(e) => setPersonInvolved(e.target.value)}
                    placeholder="Name and role"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                    Body part affected <span className="font-normal text-[#A0A0A0]">(optional)</span>
                  </label>
                  <Input
                    value={bodyPart}
                    onChange={(e) => setBodyPart(e.target.value)}
                    placeholder="e.g. Left hand, lower back"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                    Treatment given <span className="font-normal text-[#A0A0A0]">(optional)</span>
                  </label>
                  <Input
                    value={treatmentGiven}
                    onChange={(e) => setTreatmentGiven(e.target.value)}
                    placeholder="e.g. First-aid kit on site, referred to GP"
                  />
                </div>
              </div>
            )}

            {/* Near-miss fields */}
            {!isInjury && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                    Contributing factors <span className="font-normal text-[#A0A0A0]">(optional)</span>
                  </label>
                  <Input
                    value={contributingFactors}
                    onChange={(e) => setContributingFactors(e.target.value)}
                    placeholder="e.g. Wet floor, poor lighting"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                    Recommended action <span className="font-normal text-[#A0A0A0]">(optional)</span>
                  </label>
                  <Input
                    value={recommendedAction}
                    onChange={(e) => setRecommendedAction(e.target.value)}
                    placeholder="e.g. Add wet-floor signage, brief crew"
                  />
                </div>
              </div>
            )}

            {/* Witnesses + Photos */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Witnesses <span className="font-normal text-[#A0A0A0]">(optional)</span>
                </label>
                <Input
                  value={witnesses}
                  onChange={(e) => setWitnesses(e.target.value)}
                  placeholder="Names, comma-separated"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Photos <span className="font-normal text-[#A0A0A0]">(optional)</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Camera-first capture path. iOS / Android open the rear
                      camera directly when the input has both `image/*` and
                      `capture="environment"`. */}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#2F8F5C] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#246F47]">
                    <span>Take photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={(e) => {
                        const captured = Array.from(e.target.files ?? []);
                        setPhotos((prev) => [...prev, ...captured]);
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                  {/* Gallery picker — same input minus the capture attr. */}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#E6E1D4] bg-white px-3 py-2 text-xs font-medium text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]">
                    <span>Pick from gallery</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const picked = Array.from(e.target.files ?? []);
                        setPhotos((prev) => [...prev, ...picked]);
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
                {photos.length > 0 && (
                  <p className="mt-1 text-xs text-[#6B6B6B]">{photos.length} photo(s) attached</p>
                )}
              </div>
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
              {saving ? 'Submitting…' : 'Submit report'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
