import { useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ProjectStatus } from '../types';
import { createProject } from '../lib/createProject';
import { createProjectWithTasks } from '../../../lib/api/projects';
import { supabaseConfigured } from '../../../lib/supabase';
import { useProjectsListStore } from '../store';
import { FRAUNCES } from '../../gantt/components/ledger';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
];

// The 8 built-in construction phases. The creator picks which to include (the
// unchosen ones are dropped server-side) and can add custom phases on top.
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
  /** Construction-phase enum value while still a default; null once custom. */
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

// Supabase RPC errors arrive as a PostgrestError (a plain object with
// `.message`) — surface the real reason ("permission denied", "numeric field
// overflow"). A network-level failure (offline, a dropped connection, or an
// in-app browser blocking the request) instead throws a TypeError whose message
// is the cryptic "Load failed" (WebKit) / "Failed to fetch" (Chromium) — turn
// that into something the user can act on.
function createErrorMessage(err: unknown): string {
  const msg = (err as { message?: unknown })?.message;
  const text = typeof msg === 'string' ? msg : '';
  if (/load failed|failed to fetch|networkerror/i.test(text)) {
    return "Couldn't reach the server — check your connection and try again. If you opened this from a chat or email link, try opening it in your browser (Safari / Chrome) instead.";
  }
  return text.length > 0 ? text : 'Could not create project.';
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(inDays(180));
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [budget, setBudget] = useState('');
  // Phases — start with the 8 defaults; "Customize" unlocks rename/remove/add.
  // Renaming a default so its name differs converts it into a custom phase.
  const [phaseRows, setPhaseRows] = useState<PhaseRow[]>(makeDefaultPhaseRows);
  const [customizing, setCustomizing] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
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
  };

  // Editing a default's name (so it differs from its built-in label) converts
  // that row into a custom phase.
  const renameRow = (id: string, label: string) =>
    setPhaseRows((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        const becomesCustom = r.builtin !== null && label.trim() !== defaultLabelFor(r.builtin);
        return { ...r, label, builtin: becomesCustom ? null : r.builtin };
      }),
    );

  const removeRow = (id: string) =>
    setPhaseRows((rows) => rows.filter((r) => r.id !== id));

  const addCustomRow = () => {
    const label = customDraft.trim();
    if (!label) return;
    if (!phaseRows.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())) {
      setPhaseRows((rows) => [
        ...rows,
        { id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, builtin: null },
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
    if (new Date(startDate) > new Date(endDate)) return setError('End date must be after start date.');

    const budgetNum = Number(budget.replace(/[,_\s]/g, ''));
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      return setError('Budget must be a positive number.');
    }
    // The `projects.budget` column is `numeric(14, 2)` — 12 digits before the
    // decimal, max value 999,999,999,999.99. Catch overflow client-side with
    // a friendly message instead of letting Postgres throw a "numeric field
    // overflow" 400 that the modal couldn't surface cleanly anyway.
    const MAX_BUDGET = 999_999_999_999;
    if (budgetNum > MAX_BUDGET) {
      return setError('Budget is too large. Maximum is 999,999,999,999.');
    }

    // Resolve the phase list. Flush a custom phase typed but not yet added, then
    // split into built-ins to KEEP (phases) + custom names to add (customPhases).
    const pending = customDraft.trim();
    const rows: PhaseRow[] =
      pending && !phaseRows.some((r) => r.label.trim().toLowerCase() === pending.toLowerCase())
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
        if (!seenCustom.has(key)) { seenCustom.add(key); customPhases.push(label); }
      }
    }
    if (phases.length === 0 && customPhases.length === 0) {
      return setError('Add at least one phase.');
    }

    // Persist. The RPC seeds the chosen phase anchors (kept built-ins + any
    // custom phases); each starts empty — tasks are added later in the Gantt.
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
      // The project IS created at this point. Refreshing the list is
      // best-effort: a network blip here (common in in-app browsers — it
      // surfaces as "Load failed") must NOT be shown as a create failure, or
      // the user retries and creates a duplicate project.
      try {
        await useProjectsListStore.getState().loadProjects();
        useProjectsListStore.getState().setActiveProject(newId);
      } catch { /* project exists; the list catches up on the next load */ }
      setSubmitting(false);
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
    }

    reset();
    onCreated?.();
    onClose();
  };

  return (
    // Overlay scrolls itself (not just the inner box). On mobile — especially
    // in-app WebViews where `dvh` may be unsupported, or when the keyboard is
    // up — a fixed `items-center` modal can exceed the viewport with no way to
    // reach the lower fields/buttons. The `min-h-full` wrapper centers when it
    // fits and lets the overlay scroll when it doesn't.
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#1A1A1A]/50">
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className="flex max-h-[95dvh] w-full max-w-xl flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)] sm:max-h-[90dvh]">
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-[#E6E1D4] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>New project</h2>
            <p className="mt-0.5 text-xs text-[#6B6B6B]">
              Choose the phases for this job — each starts empty; add tasks from the list in the Gantt.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="editorial-scrollbox flex-1 space-y-4 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Project name
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bondi Junction Switchboard Upgrade" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Client
                </label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Westfield Bondi Junction" />
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
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Start date
                </label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  End date
                </label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="block h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                Budget (AUD)
              </label>
              <Input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="4250000"
                inputMode="numeric"
              />
            </div>

            {/* Phases — default list; "Customize" unlocks rename / remove / add. */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Phases for this job
                </label>
                <button
                  type="button"
                  onClick={() => setCustomizing((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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
                      <span key={r.id} className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-[#FAF8F2] px-2.5 py-1.5 text-[12.5px] font-medium text-[#1A1A1A]">
                        {r.label}
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${r.builtin ? 'bg-[#E5F2EA] text-[#246F47]' : 'bg-[#F0EDE4] text-[#6B6B6B]'}`}>
                          {r.builtin ? 'Default' : 'Custom'}
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#A0A0A0]">
                    {phaseRows.length} phase{phaseRows.length === 1 ? '' : 's'} — turn on Customize to rename, remove, or add.
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
                        />
                        <span className={`w-[54px] flex-shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide ${r.builtin ? 'bg-[#E5F2EA] text-[#246F47]' : 'bg-[#F0EDE4] text-[#6B6B6B]'}`}>
                          {r.builtin ? 'Default' : 'Custom'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#FBE5E5] hover:text-[#C44545]"
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
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomRow(); } }}
                      placeholder="Add a custom phase (e.g. Solar & battery)"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addCustomRow} disabled={!customDraft.trim()}>
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[#A0A0A0]">Rename a default to turn it into a custom phase.</p>
                    <button type="button" onClick={resetPhases} className="text-[11px] font-medium text-[#6B6B6B] underline-offset-2 hover:text-[#246F47] hover:underline">
                      Reset to defaults
                    </button>
                  </div>
                </>
              )}
            </div>

            <p className="rounded-md border border-[#A8D0B8] bg-[#E5F2EA] px-3 py-2 text-[11px] text-[#246F47]">
              Each phase starts empty — you add its tasks from the list inside the Gantt. Use Customize to rename a default into a custom phase, remove ones you don't need, or add your own.
            </p>

            {error && (
              <p className="rounded-md border border-[#FBE5E5] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{error}</p>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
