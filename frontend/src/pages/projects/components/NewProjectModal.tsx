import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ProjectStatus } from '../types';
import { createProject } from '../lib/createProject';
import { createProjectWithTasks } from '../../../lib/api/projects';
import { supabaseConfigured } from '../../../lib/supabase';
import { useProjectsListStore } from '../store';
import { totalDefaultMilestones } from '../../../lib/construction/phaseMilestones';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
];

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(inDays(180));
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [budget, setBudget] = useState('');
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
    setError(null);
  };

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

    // Persist — the create path auto-seeds 8 phase anchors + 57 default
    // milestones (see `createProject.ts` / `create_project_with_tasks` RPC),
    // so the wizard only needs the project shell.
    if (supabaseConfigured()) {
      setSubmitting(true);
      try {
        const newId = await createProjectWithTasks({
          name: name.trim(),
          client: clientName.trim(),
          description: description.trim(),
          startDate,
          endDate,
          status: status === 'archived' ? 'completed' : status,
          budget: budgetNum,
          milestones: [],
        });
        await useProjectsListStore.getState().loadProjects();
        useProjectsListStore.getState().setActiveProject(newId);
      } catch (err) {
        setSubmitting(false);
        // Supabase RPC errors come through as `PostgrestError` — a plain
        // object with a `.message` field, NOT an Error instance. Check for
        // the message field directly so the user sees the real reason
        // ("numeric field overflow", "permission denied", etc.) instead of
        // the generic fallback.
        const msg =
          (err as { message?: unknown })?.message;
        return setError(
          typeof msg === 'string' && msg.length > 0
            ? msg
            : 'Could not create project.',
        );
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 sm:p-4">
      <div className="flex max-h-[95dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:max-h-[90dvh]">
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">New project</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              8 construction phases · {totalDefaultMilestones()} default milestones — pre-seeded at 0%.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="editorial-scrollbox flex-1 space-y-4 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Project name
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bondi Junction Switchboard Upgrade" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Client
                </label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Westfield Bondi Junction" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Short summary for reports and audit logs."
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Start date
                </label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  End date
                </label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Budget (USD)
              </label>
              <Input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="4250000"
                inputMode="numeric"
              />
            </div>

            <p className="rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-800">
              On creation, every project gets its 8 construction phases (Excavation → Finishing) pre-populated with the canonical milestone library. You can edit, delete, or add sub-tasks from the Gantt afterwards.
            </p>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-5 py-3">
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
  );
}
