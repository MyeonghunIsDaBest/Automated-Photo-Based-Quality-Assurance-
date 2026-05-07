import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useAppStore } from '../../../store';
import { useSafetyStore } from '../store';
import { IncidentSeverity, IncidentType, SEVERITY_LABEL } from '../types';

interface IncidentFormModalProps {
  open: boolean;
  initialType?: IncidentType;
  onClose: () => void;
}

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function IncidentFormModal({ open, initialType, onClose }: IncidentFormModalProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const addIncident = useSafetyStore((s) => s.addIncident);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!location.trim()) return setError('Location is required.');
    if (!description.trim()) return setError('Description is required.');
    if (isInjury && !personInvolved.trim()) {
      return setError('Person involved is required for an injury report.');
    }

    addIncident({
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

    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Incident report
            </p>
            <h2
              className="mt-1 text-xl font-medium text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
            >
              {isInjury ? 'Log an injury' : 'Log a near miss'}
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
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-700">Report type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('injury')}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    type === 'injury'
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-medium">Injury</p>
                  <p className={`mt-0.5 text-[11px] ${type === 'injury' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Someone was hurt or required treatment.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setType('near_miss')}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                    type === 'near_miss'
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-medium">Near Miss</p>
                  <p className={`mt-0.5 text-[11px] ${type === 'near_miss' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Could have caused harm — no injury occurred.
                  </p>
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">When did it happen?</label>
                <Input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Location / Zone</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Switchboard room — Level 2"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                {isInjury ? 'What happened?' : 'What almost happened?'}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder={
                  isInjury
                    ? 'Describe the incident — what was being done, what went wrong.'
                    : 'Describe the situation and the harm that could have occurred.'
                }
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-700">
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
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {SEVERITY_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            {isInjury && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Person involved</label>
                  <Input
                    value={personInvolved}
                    onChange={(e) => setPersonInvolved(e.target.value)}
                    placeholder="Name and role"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Body part affected <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <Input
                    value={bodyPart}
                    onChange={(e) => setBodyPart(e.target.value)}
                    placeholder="e.g. Left hand, lower back"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Treatment given <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <Input
                    value={treatmentGiven}
                    onChange={(e) => setTreatmentGiven(e.target.value)}
                    placeholder="e.g. First-aid kit on site, referred to GP"
                  />
                </div>
              </div>
            )}

            {!isInjury && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Contributing factors <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <Input
                    value={contributingFactors}
                    onChange={(e) => setContributingFactors(e.target.value)}
                    placeholder="e.g. Wet floor, poor lighting"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Recommended action <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <Input
                    value={recommendedAction}
                    onChange={(e) => setRecommendedAction(e.target.value)}
                    placeholder="e.g. Add wet-floor signage, brief crew"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Witnesses <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <Input
                  value={witnesses}
                  onChange={(e) => setWitnesses(e.target.value)}
                  placeholder="Names, comma-separated"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Photos <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Camera-first capture path. iOS / Android open the rear
                      camera directly when the input has both `image/*` and
                      `capture="environment"`. */}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700">
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
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50">
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
                  <p className="mt-1 text-xs text-slate-500">{photos.length} photo(s) attached</p>
                )}
              </div>
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
            <Button type="submit">Submit report</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
