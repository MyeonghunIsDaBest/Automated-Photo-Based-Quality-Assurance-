import { useState } from 'react';
import { X, Plus, Copy, Trash2, ListPlus } from 'lucide-react';
import type { ConstructionPhase, TaskStatus } from '../../types';
import { Button } from '../ui/button';
import { createTaskShared } from '../../lib/api/taskMutations';

interface BulkAddTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  defaultStart: string;
  defaultEnd: string;
  // Optional callback after a successful bulk submit so parents can refresh,
  // close another modal, etc. The shared mutation already mirrors into the
  // feature store, so most callers won't need this.
  onCreated?: () => void;
}

interface DraftRow {
  key: string;          // local-only; React list key, never sent
  name: string;
  phase: ConstructionPhase;
  startDate: string;
  endDate: string;
  status: TaskStatus;
}

const PHASES: ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'electrical',
  'plumbing', 'drywall', 'finishing', 'roofing',
];

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete',    label: 'Complete' },
  { value: 'delayed',     label: 'Delayed' },
  { value: 'blocked',     label: 'Blocked' },
];

const newKey = () => `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function makeRow(defaultStart: string, defaultEnd: string): DraftRow {
  return {
    key: newKey(),
    name: '',
    phase: 'excavation',
    startDate: defaultStart,
    endDate: defaultEnd,
    status: 'not_started',
  };
}

export default function BulkAddTasksModal({
  isOpen, onClose, projectId, defaultStart, defaultEnd, onCreated,
}: BulkAddTasksModalProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => [
    makeRow(defaultStart, defaultEnd),
    makeRow(defaultStart, defaultEnd),
    makeRow(defaultStart, defaultEnd),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setRows([
      makeRow(defaultStart, defaultEnd),
      makeRow(defaultStart, defaultEnd),
      makeRow(defaultStart, defaultEnd),
    ]);
    setError(null);
  };

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, makeRow(defaultStart, defaultEnd)]);
  };

  const duplicateRow = (key: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx === -1) return prev;
      const copy: DraftRow = { ...prev[idx], key: newKey(), name: `${prev[idx].name} (copy)`.trim() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const handleSubmit = async () => {
    const populated = rows.filter((r) => r.name.trim().length > 0);
    if (populated.length === 0) {
      setError('Add at least one named task before saving.');
      return;
    }
    // Surface any obviously bad date order so the user can fix it before
    // half the rows hit Supabase.
    const badRow = populated.find((r) => new Date(r.endDate) < new Date(r.startDate));
    if (badRow) {
      setError(`"${badRow.name}" has its end date before its start date.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // Sequential to keep error messages tied to a specific row if Supabase
      // rejects mid-batch. The volume is small (5–20 rows), so latency is fine.
      for (const r of populated) {
        await createTaskShared({
          projectId,
          name: r.name.trim(),
          phase: r.phase,
          startDate: r.startDate,
          endDate: r.endDate,
          durationDays: Math.max(
            1,
            Math.ceil((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86_400_000),
          ),
          percentComplete: r.status === 'complete' ? 100 : 0,
          status: r.status,
          dependencies: [],
          notes: [],
        });
      }
      onCreated?.();
      reset();
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[bulk add] failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to save tasks. See console.');
    } finally {
      setSubmitting(false);
    }
  };

  const filledCount = rows.filter((r) => r.name.trim().length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex h-full max-h-[95vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl sm:h-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <ListPlus className="h-4 w-4 text-emerald-600" />
              Bulk add tasks
            </h2>
            <p className="text-xs text-slate-500">
              Fill out as many rows as you need — empty rows are ignored when you save.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Desktop column header */}
          <div className="hidden gap-2 px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500 md:grid md:grid-cols-[2.5fr_1.2fr_1.2fr_1.2fr_1.2fr_72px]">
            <span>Name</span>
            <span>Phase</span>
            <span>Start</span>
            <span>End</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div
                key={r.key}
                className="rounded-lg border border-slate-200 p-3 md:grid md:grid-cols-[2.5fr_1.2fr_1.2fr_1.2fr_1.2fr_72px] md:items-center md:gap-2 md:border-0 md:p-1"
              >
                <div className="md:col-span-1">
                  <label className="mb-1 block text-[11px] font-medium text-slate-600 md:hidden">
                    Task name
                  </label>
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => updateRow(r.key, { name: e.target.value })}
                    placeholder={`Task ${idx + 1}`}
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="mt-2 md:mt-0">
                  <label className="mb-1 block text-[11px] font-medium text-slate-600 md:hidden">
                    Phase
                  </label>
                  <select
                    value={r.phase}
                    onChange={(e) => updateRow(r.key, { phase: e.target.value as ConstructionPhase })}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm capitalize focus:border-emerald-500 focus:outline-none"
                  >
                    {PHASES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 md:mt-0 md:contents">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600 md:hidden">
                      Start
                    </label>
                    <input
                      type="date"
                      value={r.startDate}
                      onChange={(e) => updateRow(r.key, { startDate: e.target.value })}
                      className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600 md:hidden">
                      End
                    </label>
                    <input
                      type="date"
                      value={r.endDate}
                      min={r.startDate}
                      onChange={(e) => updateRow(r.key, { endDate: e.target.value })}
                      className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-2 md:mt-0">
                  <label className="mb-1 block text-[11px] font-medium text-slate-600 md:hidden">
                    Status
                  </label>
                  <select
                    value={r.status}
                    onChange={(e) => updateRow(r.key, { status: e.target.value as TaskStatus })}
                    className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex items-center justify-end gap-1 md:mt-0">
                  <button
                    type="button"
                    onClick={() => duplicateRow(r.key)}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 active:bg-slate-100"
                    title="Duplicate row"
                    aria-label="Duplicate row"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    disabled={rows.length === 1}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors enabled:hover:bg-red-50 enabled:hover:text-red-500 enabled:active:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title={rows.length === 1 ? 'At least one row required' : 'Remove row'}
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-emerald-500 hover:text-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another row
          </button>

          {error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {filledCount} task{filledCount === 1 ? '' : 's'} ready to save · empty rows are skipped
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || filledCount === 0}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {submitting ? 'Saving…' : `Save ${filledCount || ''} task${filledCount === 1 ? '' : 's'}`.trim()}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
