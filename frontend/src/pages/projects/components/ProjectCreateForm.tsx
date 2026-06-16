// ProjectCreateForm — extracted form body from NewProjectModal.
//
// Standalone path: NewProjectModal wraps this and provides its own footer +
// the navigate() call via onCreated.
// Embedded path: NewWorkModal mounts this inside a tab; footer is shared
// via the modal footer's form= attribute. onCreated does NOT navigate —
// the caller decides what happens next.
//
// Props:
//   id          — HTML id for the <form> element (so footer's form= wires up)
//   onCreated   — called with the new project id after successful creation
//   hideFooter  — when true, no footer is rendered (NewWorkModal path)

import { useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ProjectStatus } from '../types';
import { createProject } from '../lib/createProject';
import { createProjectWithTasks } from '../../../lib/api/projects';
import { supabaseConfigured } from '../../../lib/supabase';
import { useProjectsListStore } from '../store';

// ─── shared constants (duplicated from NewProjectModal to avoid a dep cycle) ──

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
];

const DEFAULT_PHASES: { value: string; label: string }[] = [
  { value: 'excavation', label: 'Excavation' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'framing',    label: 'Framing' },
  { value: 'roofing',    label: 'Roofing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing',   label: 'Plumbing' },
  { value: 'drywall',    label: 'Drywall' },
  { value: 'finishing',  label: 'Finishing' },
];

interface PhaseRow {
  id: string;
  label: string;
  builtin: string | null;
}

const makeDefaultPhaseRows = (): PhaseRow[] =>
  DEFAULT_PHASES.map((p) => ({ id: p.value, label: p.label, builtin: p.value }));

const defaultLabelFor = (builtin: string): string =>
  DEFAULT_PHASES.find((p) => p.value === builtin)?.label ?? builtin;

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function createErrorMessage(err: unknown): string {
  const msg = (err as { message?: unknown })?.message;
  const text = typeof msg === 'string' ? msg : '';
  if (/load failed|failed to fetch|networkerror/i.test(text)) {
    return "Couldn't reach the server — check your connection and try again. If you opened this from a chat or email link, try opening it in your browser (Safari / Chrome) instead.";
  }
  return text.length > 0 ? text : 'Could not create project.';
}

const SELECT_CLASS =
  'block h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]';

// ─── component ────────────────────────────────────────────────────────────────

export interface ProjectCreateFormProps {
  /** HTML id for the <form> — must match the footer's form= attribute. */
  id?: string;
  /** Called with the new project id after a successful create. */
  onCreated: (projectId: string) => void;
  /**
   * When true, the component renders NO footer (NewWorkModal embeds this and
   * provides a shared footer via form=). When absent / false, the component
   * renders its own cream footer (standalone NewProjectModal path).
   */
  hideFooter?: boolean;
  /** Called when the user clicks Cancel (standalone path only). */
  onCancel?: () => void;
}

export function ProjectCreateForm({
  id = 'new-project-form',
  onCreated,
  hideFooter = false,
  onCancel,
}: ProjectCreateFormProps) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(inDays(180));
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [budget, setBudget] = useState('');
  const [phaseRows, setPhaseRows] = useState<PhaseRow[]>(makeDefaultPhaseRows);
  const [customizing, setCustomizing] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setClientName('');
    setDescription('');
    setStartDate(today());
    setEndDate(inDays(180));
    setStatus('active');
    setBudget('');
    setPhaseRows(makeDefaultPhaseRows());
    setCustomizing(false);
    setCustomDraft('');
    setError(null);
  }

  const renameRow = (rowId: string, label: string) =>
    setPhaseRows((rows) =>
      rows.map((r) => {
        if (r.id !== rowId) return r;
        const becomesCustom =
          r.builtin !== null && label.trim() !== defaultLabelFor(r.builtin);
        return { ...r, label, builtin: becomesCustom ? null : r.builtin };
      }),
    );

  const removeRow = (rowId: string) =>
    setPhaseRows((rows) => rows.filter((r) => r.id !== rowId));

  const addCustomRow = () => {
    const label = customDraft.trim();
    if (!label) return;
    if (!phaseRows.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())) {
      setPhaseRows((rows) => [
        ...rows,
        {
          id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          label,
          builtin: null,
        },
      ]);
    }
    setCustomDraft('');
  };

  const resetPhases = () => setPhaseRows(makeDefaultPhaseRows());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Project name is required.');
    if (!clientName.trim()) return setError('Client name is required.');
    if (!startDate || !endDate) return setError('Start and end dates are required.');
    if (new Date(startDate) > new Date(endDate))
      return setError('End date must be after start date.');

    const budgetNum = Number(budget.replace(/[,_\s]/g, ''));
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      return setError('Budget must be a positive number.');
    }
    const MAX_BUDGET = 999_999_999_999;
    if (budgetNum > MAX_BUDGET) {
      return setError('Budget is too large. Maximum is 999,999,999,999.');
    }

    const pending = customDraft.trim();
    const rows: PhaseRow[] =
      pending &&
      !phaseRows.some(
        (r) => r.label.trim().toLowerCase() === pending.toLowerCase(),
      )
        ? [...phaseRows, { id: `c_${Date.now()}`, label: pending, builtin: null }]
        : phaseRows;

    const phases: string[] = [];
    const customPhases: string[] = [];
    const seenCustom = new Set<string>();
    for (const r of rows) {
      const label = r.label.trim();
      if (!label) continue;
      if (r.builtin) {
        phases.push(r.builtin);
      } else {
        const key = label.toLowerCase();
        if (!seenCustom.has(key)) {
          seenCustom.add(key);
          customPhases.push(label);
        }
      }
    }
    if (phases.length === 0 && customPhases.length === 0) {
      return setError('Add at least one phase.');
    }

    if (supabaseConfigured()) {
      setSubmitting(true);
      let newId: string;
      try {
        newId = await createProjectWithTasks({
          name: name.trim(),
          client: clientName.trim(),
          description: description.trim(),
          startDate,
          endDate,
          status: status === 'archived' ? 'completed' : status,
          budget: budgetNum,
          phases,
          customPhases,
          milestones: [],
        });
      } catch (err) {
        setSubmitting(false);
        return setError(createErrorMessage(err));
      }
      try {
        await useProjectsListStore.getState().loadProjects();
        useProjectsListStore.getState().setActiveProject(newId);
      } catch {
        // project exists; list catches up on next load
      }
      setSubmitting(false);
      reset();
      onCreated(newId);
    } else {
      createProject({
        name: name.trim(),
        clientName: clientName.trim(),
        description: description.trim(),
        startDate,
        endDate,
        status,
        budget: budgetNum,
      });
      reset();
      onCreated('mock');
    }
  };

  return (
    <>
      <form
        id={id}
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="editorial-scrollbox flex-1 overflow-y-auto space-y-5 px-6 py-5">

          {/* ── PROJECT ─────────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#A0A0A0]">
              Project
            </p>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                    Project name <span className="text-[#C44545]">*</span>
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Bondi Junction Switchboard Upgrade"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                    Client <span className="text-[#C44545]">*</span>
                  </label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Westfield Bondi Junction"
                    disabled={submitting}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Short summary for reports and audit logs."
                  disabled={submitting}
                  className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          <hr className="border-[#E6E1D4]" />

          {/* ── SCHEDULE ─────────────────────────────────────────────────── */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#A0A0A0]">
              Schedule
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Start date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  End date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  disabled={submitting}
                  className={SELECT_CLASS}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                Budget (AUD) <span className="text-[#C44545]">*</span>
              </label>
              <Input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="4250000"
                inputMode="numeric"
                disabled={submitting}
              />
            </div>
          </div>

          <hr className="border-[#E6E1D4]" />

          {/* ── PHASES ───────────────────────────────────────────────────── */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#A0A0A0]">
                Phases
              </p>
              <button
                type="button"
                onClick={() => setCustomizing((v) => !v)}
                disabled={submitting}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                  customizing
                    ? 'border-[#2F8F5C] bg-[#E5F2EA] text-[#246F47]'
                    : 'border-[#E6E1D4] bg-white text-[#6B6B6B] hover:bg-[#FAF8F2]'
                }`}
              >
                <Pencil className="h-3 w-3" />
                {customizing ? 'Done' : 'Customize'}
              </button>
            </div>

            {!customizing ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {phaseRows.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2.5 py-1 text-[12px] font-medium text-[#1A1A1A]"
                    >
                      {r.label}
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          r.builtin
                            ? 'bg-[#E5F2EA] text-[#246F47]'
                            : 'bg-[#F0EDE4] text-[#6B6B6B]'
                        }`}
                      >
                        {r.builtin ? 'Default' : 'Custom'}
                      </span>
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[#A0A0A0]">
                  {phaseRows.length} phase{phaseRows.length === 1 ? '' : 's'} — turn on
                  Customize to rename, remove, or add.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  {phaseRows.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Input
                        value={r.label}
                        onChange={(e) => renameRow(r.id, e.target.value)}
                        placeholder="Phase name"
                        disabled={submitting}
                      />
                      <span
                        className={`w-[54px] shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide ${
                          r.builtin
                            ? 'bg-[#E5F2EA] text-[#246F47]'
                            : 'bg-[#F0EDE4] text-[#6B6B6B]'
                        }`}
                      >
                        {r.builtin ? 'Default' : 'Custom'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        disabled={submitting}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:opacity-50"
                        aria-label={`Remove ${r.label || 'phase'}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <Input
                    value={customDraft}
                    onChange={(e) => setCustomDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomRow();
                      }
                    }}
                    placeholder="Add a custom phase (e.g. Solar & battery)"
                    disabled={submitting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomRow}
                    disabled={!customDraft.trim() || submitting}
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-[#A0A0A0]">
                    Rename a default to turn it into a custom phase.
                  </p>
                  <button
                    type="button"
                    onClick={resetPhases}
                    disabled={submitting}
                    className="text-[11px] font-medium text-[#6B6B6B] underline-offset-2 hover:text-[#246F47] hover:underline disabled:opacity-50"
                  >
                    Reset to defaults
                  </button>
                </div>
              </>
            )}

            <p className="mt-3 rounded-md border border-[#A8D0B8] bg-[#E5F2EA] px-3 py-2 text-[11px] text-[#246F47]">
              Each phase starts empty — you add its tasks from the list inside the Gantt. Use
              Customize to rename a default into a custom phase, remove ones you don't need, or
              add your own.
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-[#FBE5E5] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
              {error}
            </p>
          )}
        </div>

        {/* Standalone footer — rendered only when hideFooter is false */}
        {!hideFooter && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create project'}
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
