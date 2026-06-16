// SchedulesSection — recurring maintenance schedules UI for the internal
// CustomerDetail view. Props: customerId + properties list (for property
// name lookup and the "Add schedule" property select).

import { useEffect, useState } from 'react';
import { CalendarClock, CheckCheck, Pencil, Plus, PowerOff, Power } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Toaster } from '../../components/ui/Toaster';
import {
  cardShell,
  FRAUNCES,
  TONE,
  btnPrimary,
  btnGhost,
  StatusPill,
} from '../gantt/components/ledger';
import type { Property } from '../../lib/api/properties';
import {
  listSchedulesForCustomer,
  createSchedule,
  updateSchedule,
  setScheduleActive,
  markScheduleDone,
  type MaintenanceSchedule,
  type MaintenanceFrequency,
  type CreateScheduleInput,
} from '../../lib/api/maintenanceSchedules';

// ─── date helpers ────────────────────────────────────────────────────────────
// Parse 'YYYY-MM-DD' as LOCAL date components (no tz shift).

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── urgency helpers ─────────────────────────────────────────────────────────

type DueTone = 'red' | 'amber' | 'sage';

function getDueTone(nextDue: string): DueTone {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseLocalDate(nextDue);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'red';
  if (diffDays <= 30) return 'amber';
  return 'sage';
}

// ─── frequency labels ────────────────────────────────────────────────────────

const FREQ_LABELS: Record<MaintenanceFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  yearly: 'Yearly',
};

// ─── reminder label ──────────────────────────────────────────────────────────

function formatReminders(days: number[]): string {
  if (days.length === 0) return 'No reminders set';
  const sorted = [...days].sort((a, b) => b - a);
  const labels = sorted.map((d) => (d === 30 ? '1 month' : d === 14 ? '2 weeks' : `${d} days`));
  return `Reminds ${labels.join(' & ')} before`;
}

// ─── ScheduleFormModal ────────────────────────────────────────────────────────

const MODAL_SHELL = 'fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4';
const DIALOG_SHELL =
  'flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]';

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
      {children}
      {required && <span className="ml-1 text-[#C44545]">*</span>}
    </label>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
      {msg}
    </p>
  );
}

interface ScheduleFormModalProps {
  mode: 'create' | 'edit';
  schedule?: MaintenanceSchedule;
  properties: Property[];
  onClose: () => void;
  onSaved: (s: MaintenanceSchedule) => void;
}

function ScheduleFormModal({
  mode,
  schedule,
  properties,
  onClose,
  onSaved,
}: ScheduleFormModalProps) {
  const [propertyId, setPropertyId] = useState(schedule?.propertyId ?? (properties[0]?.id ?? ''));
  const [title, setTitle] = useState(schedule?.title ?? '');
  const [category, setCategory] = useState(schedule?.category ?? '');
  const [frequency, setFrequency] = useState<MaintenanceFrequency>(
    schedule?.frequency ?? 'yearly',
  );
  const [nextDue, setNextDue] = useState(schedule?.nextDue ?? '');
  // Reminder checkboxes + custom
  const existing = schedule?.remindDaysBefore ?? [30, 14];
  const [remind30, setRemind30] = useState(existing.includes(30));
  const [remind14, setRemind14] = useState(existing.includes(14));
  const customInitial = existing.filter((d) => d !== 30 && d !== 14).join(', ');
  const [customDays, setCustomDays] = useState(customInitial);
  const [notifyCustomer, setNotifyCustomer] = useState(schedule?.notifyCustomer ?? true);
  const [extraEmail, setExtraEmail] = useState(schedule?.extraNotifyEmail ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function buildRemindDays(): number[] {
    const set = new Set<number>();
    if (remind30) set.add(30);
    if (remind14) set.add(14);
    if (customDays.trim()) {
      customDays.split(',').forEach((s) => {
        const n = parseInt(s.trim(), 10);
        if (!isNaN(n) && n > 0) set.add(n);
      });
    }
    if (set.size === 0) {
      // Safety: never silently empty — fall back to default
      return [30, 14];
    }
    return Array.from(set).sort((a, b) => b - a);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!propertyId) return setError('Please select a property.');
    if (!title.trim()) return setError('Title is required.');
    if (!nextDue) return setError('Next due date is required.');
    if (
      extraEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extraEmail.trim())
    ) {
      return setError('Extra notify email is not a valid email address.');
    }
    setSaving(true);
    try {
      const remindDaysBefore = buildRemindDays();
      if (mode === 'create') {
        const input: CreateScheduleInput = {
          propertyId,
          title: title.trim(),
          category: category.trim() || undefined,
          frequency,
          nextDue,
          remindDaysBefore,
          notifyCustomer,
          extraNotifyEmail: extraEmail.trim() || undefined,
        };
        const created = await createSchedule(input);
        onSaved(created);
      } else {
        if (!schedule) return;
        // null (not undefined) for cleared fields — undefined is skipped by the
        // API patch and the user's clear would silently revert.
        const updated = await updateSchedule(schedule.id, {
          title: title.trim(),
          category: category.trim() === '' ? null : category.trim(),
          frequency,
          nextDue,
          remindDaysBefore,
          notifyCustomer,
          extraNotifyEmail: extraEmail.trim() === '' ? null : extraEmail.trim(),
        });
        onSaved(updated);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const remindCount = buildRemindDays().length;
  const customEmpty =
    !remind30 && !remind14 && customDays.trim() === '';

  return (
    <div className={MODAL_SHELL} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className={DIALOG_SHELL}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              Maintenance &middot; Schedules
            </p>
            <h2
              className="mt-1 text-xl font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              {mode === 'create' ? 'Add recurring schedule' : 'Edit schedule'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">

            {/* Property select (create only — locked on edit) */}
            {mode === 'create' ? (
              <div>
                <FieldLabel required>Property</FieldLabel>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  disabled={saving || properties.length === 0}
                  className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                >
                  {properties.length === 0 && (
                    <option value="">No properties available</option>
                  )}
                  {properties.filter((p) => p.isActive !== false).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <FieldLabel>Property</FieldLabel>
                <p className="text-[13px] text-[#3A3A3A]">
                  {properties.find((p) => p.id === propertyId)?.name ?? 'Unknown property'}
                </p>
              </div>
            )}

            {/* Title */}
            <div>
              <FieldLabel required>Title</FieldLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual test and tag"
                disabled={saving}
              />
            </div>

            {/* Category */}
            <div>
              <FieldLabel>Category</FieldLabel>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Test & Tag, Fire Safety…"
                disabled={saving}
              />
            </div>

            {/* Frequency + Next due (side by side) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel required>Frequency</FieldLabel>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as MaintenanceFrequency)}
                  disabled={saving}
                  className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="half_yearly">Half-yearly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <FieldLabel required>Next due date</FieldLabel>
                <Input
                  type="date"
                  value={nextDue}
                  onChange={(e) => setNextDue(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Reminder lead times */}
            <div>
              <FieldLabel>Reminder lead times</FieldLabel>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#3A3A3A]">
                  <input
                    type="checkbox"
                    checked={remind30}
                    onChange={(e) => setRemind30(e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-[#E6E1D4] accent-[#2F8F5C]"
                  />
                  1 month before (30 days)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#3A3A3A]">
                  <input
                    type="checkbox"
                    checked={remind14}
                    onChange={(e) => setRemind14(e.target.checked)}
                    disabled={saving}
                    className="h-4 w-4 rounded border-[#E6E1D4] accent-[#2F8F5C]"
                  />
                  2 weeks before (14 days)
                </label>
                <div>
                  <p className="mb-1 text-[11px] text-[#6B6B6B]">
                    Custom days (comma-separated, e.g. 7, 3)
                  </p>
                  <Input
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    placeholder="e.g. 7, 3"
                    disabled={saving}
                  />
                </div>
                {customEmpty && (
                  <p className="text-[11px] text-[#C8841E]">
                    No reminders selected — will default to 30 &amp; 14 days before.
                  </p>
                )}
                {!customEmpty && (
                  <p className="text-[11px] text-[#6B6B6B]">
                    {remindCount} reminder{remindCount !== 1 ? 's' : ''} will be sent.
                  </p>
                )}
              </div>
            </div>

            {/* Notify customer toggle */}
            <div>
              <FieldLabel>Customer notifications</FieldLabel>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#3A3A3A]">
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-[#E6E1D4] accent-[#2F8F5C]"
                />
                Notify customer when reminders are sent
              </label>
            </div>

            {/* Extra notify email */}
            <div>
              <FieldLabel>Extra notification email</FieldLabel>
              <Input
                type="email"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
                placeholder="extra@example.com"
                disabled={saving}
              />
              <p className="mt-1 text-[11px] text-[#6B6B6B]">
                Optional — CC this address on all reminder emails for this schedule.
              </p>
            </div>

            {error && <ErrorBanner msg={error} />}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (mode === 'create' ? 'Adding…' : 'Saving…') : (mode === 'create' ? 'Add schedule' : 'Save changes')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SchedulesSection ─────────────────────────────────────────────────────────

interface SchedulesSectionProps {
  customerId: string;
  properties: Property[];
}

export default function SchedulesSection({ customerId, properties }: SchedulesSectionProps) {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal state
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<MaintenanceSchedule | null>(null);

  // In-flight action ids (to show per-row spinners without blocking others)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const propMap = new Map(properties.map((p) => [p.id, p.name]));

  const load = () => {
    setLoading(true);
    setLoadError(null);
    listSchedulesForCustomer(customerId)
      .then((data) => setSchedules(data))
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load schedules.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [customerId]);

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleMarkDone = async (s: MaintenanceSchedule) => {
    setBusy(s.id, true);
    try {
      const updated = await markScheduleDone(s.id);
      setSchedules((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setToast({
        message: `Done — next due ${formatDate(updated.nextDue)}`,
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to mark done.',
        type: 'error',
      });
    } finally {
      setBusy(s.id, false);
    }
  };

  const handleSetActive = async (s: MaintenanceSchedule, active: boolean) => {
    setBusy(s.id, true);
    try {
      await setScheduleActive(s.id, active);
      setSchedules((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, isActive: active } : x)),
      );
      setToast({
        message: active ? 'Schedule reactivated.' : 'Schedule deactivated.',
        type: 'success',
      });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to update schedule.',
        type: 'error',
      });
    } finally {
      setBusy(s.id, false);
    }
  };

  // Group by property
  const grouped = new Map<string, MaintenanceSchedule[]>();
  for (const s of schedules) {
    const group = grouped.get(s.propertyId) ?? [];
    group.push(s);
    grouped.set(s.propertyId, group);
  }
  // Sort properties by name
  const sortedPropertyIds = Array.from(grouped.keys()).sort((a, b) => {
    const na = propMap.get(a) ?? a;
    const nb = propMap.get(b) ?? b;
    return na.localeCompare(nb);
  });

  return (
    <>
      <section className={`mb-4 overflow-hidden ${cardShell}`}>
        {/* Section header */}
        <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
          <div>
            <h2
              className="text-[16px] font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES }}
            >
              Recurring maintenance
            </h2>
            <p className="text-[12px] text-[#6B6B6B]">
              {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} across {grouped.size} propert{grouped.size !== 1 ? 'ies' : 'y'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className={btnPrimary}
            disabled={properties.length === 0}
          >
            <Plus className="h-3.5 w-3.5" />
            Add schedule
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center px-5 py-10">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#E6E1D4] border-t-[#2F8F5C]" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <p className="text-[13px] text-[#C44545]">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="rounded-md border border-[#E6E1D4] bg-white px-4 py-2 text-[13px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
            >
              Retry
            </button>
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <CalendarClock className="h-8 w-8 text-[#A0A0A0]" strokeWidth={1.5} />
            <p className="text-[13px] text-[#6B6B6B]">No recurring maintenance set up yet.</p>
            <p className="text-[12px] text-[#A0A0A0]">
              Add a schedule to track test &amp; tag, fire safety checks and other recurring work.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#EFEBE0]">
            {sortedPropertyIds.map((propId) => {
              const propSchedules = grouped.get(propId) ?? [];
              return (
                <div key={propId}>
                  {/* Property sub-header */}
                  <div className="bg-[#FAF8F2] px-5 py-2">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
                      {propMap.get(propId) ?? 'Unknown property'}
                    </p>
                  </div>
                  <ul className="divide-y divide-[#F5F2EB]">
                    {propSchedules.map((s) => {
                      const tone = getDueTone(s.nextDue);
                      const isBusy = busyIds.has(s.id);
                      const dueTone = TONE[tone];

                      return (
                        <li key={s.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                          {/* Left: info */}
                          <div className="min-w-0 flex-1">
                            {/* Title row */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[14px] font-medium text-[#1A1A1A]">
                                {s.title}
                              </span>
                              {s.category && (
                                <span className="rounded-full bg-[#EEF1F4] px-2 py-0.5 text-[11px] font-medium text-[#5B6B7B]">
                                  {s.category}
                                </span>
                              )}
                              <span className="rounded-full border border-[#E6E1D4] px-2 py-0.5 text-[11px] text-[#6B6B6B]">
                                {FREQ_LABELS[s.frequency]}
                              </span>
                              <StatusPill tone={s.isActive ? 'sage' : 'slate'}>
                                {s.isActive ? 'Active' : 'Inactive'}
                              </StatusPill>
                            </div>
                            {/* Due + reminders */}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                              <span
                                style={{ color: dueTone.fg, background: dueTone.bg }}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
                              >
                                <span
                                  className="inline-block h-1.5 w-1.5 rounded-full"
                                  style={{ background: dueTone.dot }}
                                />
                                Due {formatDate(s.nextDue)}
                                {tone === 'red' && ' (overdue)'}
                                {tone === 'amber' && ' (soon)'}
                              </span>
                              <span className="text-[#A0A0A0]">
                                {formatReminders(s.remindDaysBefore)}
                              </span>
                              {s.notifyCustomer && (
                                <span className="text-[#A0A0A0]">Notifies customer</span>
                              )}
                            </div>
                          </div>

                          {/* Right: actions */}
                          <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                            {s.isActive && (
                              <button
                                type="button"
                                onClick={() => handleMarkDone(s)}
                                disabled={isBusy}
                                title="Mark done"
                                className={`${btnGhost} text-[12px]`}
                              >
                                {isBusy ? (
                                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#E6E1D4] border-t-[#2F8F5C]" />
                                ) : (
                                  <CheckCheck className="h-3.5 w-3.5" />
                                )}
                                Mark done
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditTarget(s)}
                              disabled={isBusy}
                              title="Edit schedule"
                              className="rounded p-1.5 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A] disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetActive(s, !s.isActive)}
                              disabled={isBusy}
                              title={s.isActive ? 'Deactivate' : 'Reactivate'}
                              className="rounded p-1.5 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A] disabled:opacity-50"
                            >
                              {s.isActive ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add schedule modal */}
      {showAdd && (
        <ScheduleFormModal
          mode="create"
          properties={properties}
          onClose={() => setShowAdd(false)}
          onSaved={(s) => {
            setSchedules((prev) =>
              [...prev, s].sort((a, b) => a.nextDue.localeCompare(b.nextDue)),
            );
            setToast({ message: `Schedule "${s.title}" added.`, type: 'success' });
          }}
        />
      )}

      {/* Edit schedule modal */}
      {editTarget && (
        <ScheduleFormModal
          mode="edit"
          schedule={editTarget}
          properties={properties}
          onClose={() => setEditTarget(null)}
          onSaved={(s) => {
            setSchedules((prev) => prev.map((x) => (x.id === s.id ? s : x)));
            setToast({ message: 'Schedule updated.', type: 'success' });
            setEditTarget(null);
          }}
        />
      )}

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}
