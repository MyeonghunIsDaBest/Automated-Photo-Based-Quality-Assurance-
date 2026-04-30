import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { ConstructionPhase } from '../../../types';
import { ProjectStatus } from '../types';
import { createProject, NewProjectMilestone } from '../lib/createProject';
import { createProjectWithTasks } from '../../../lib/api/projects';
import { supabaseConfigured } from '../../../lib/supabase';
import { useProjectsListStore } from '../store';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const PHASES: ConstructionPhase[] = [
  'excavation',
  'foundation',
  'framing',
  'electrical',
  'plumbing',
  'drywall',
  'finishing',
  'roofing',
];

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

interface MilestoneRow extends NewProjectMilestone {
  id: string;
}

const newRow = (defaults?: Partial<NewProjectMilestone>): MilestoneRow => ({
  id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: defaults?.name ?? '',
  phase: defaults?.phase ?? 'foundation',
  startDate: defaults?.startDate ?? today(),
  endDate: defaults?.endDate ?? inDays(14),
});

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(inDays(180));
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [budget, setBudget] = useState('');
  const [milestones, setMilestones] = useState<MilestoneRow[]>([newRow()]);
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
    setMilestones([newRow()]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError('Project name is required.');
    if (!clientName.trim()) return setError('Client name is required.');
    if (!startDate || !endDate) return setError('Start and end dates are required.');
    if (new Date(startDate) > new Date(endDate)) return setError('End date must be after start date.');

    const cleanMilestones = milestones
      .filter((m) => m.name.trim().length > 0)
      .map(({ id: _id, ...rest }) => rest);

    if (cleanMilestones.length === 0) {
      return setError('Add at least one milestone for the Gantt chart.');
    }
    for (const m of cleanMilestones) {
      if (new Date(m.startDate) > new Date(m.endDate)) {
        return setError(`Milestone "${m.name}" has invalid dates.`);
      }
    }

    const budgetNum = Number(budget.replace(/[,_\s]/g, ''));
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      return setError('Budget must be a positive number.');
    }

    // ── Persist ──────────────────────────────────────────────────────────
    // When Supabase is configured we go through the create_project_with_tasks
    // RPC so the project + milestones land atomically. Otherwise fall back
    // to the local-only mock path so the demo still works without env keys.
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
          milestones: cleanMilestones.map((m) => ({
            name: m.name,
            phase: m.phase,
            startDate: m.startDate,
            endDate: m.endDate,
          })),
        });
        // Pull the updated list from the DB and switch the active project to
        // the one we just created so the Gantt opens on it.
        await useProjectsListStore.getState().loadProjects();
        useProjectsListStore.getState().setActiveProject(newId);
      } catch (err) {
        setSubmitting(false);
        return setError(err instanceof Error ? err.message : 'Could not create project.');
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
        milestones: cleanMilestones,
      });
    }

    reset();
    onCreated?.();
    onClose();
  };

  const updateMilestone = (id: string, patch: Partial<NewProjectMilestone>) => {
    setMilestones((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New Project</h2>
            <p className="text-xs text-slate-500">
              Creating a project seeds the Gantt chart, audit trail, and notifications.
            </p>
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
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Project Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bondi Junction Switchboard Upgrade" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Client</label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Westfield Bondi Junction" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Short summary that appears in reports and audit logs"
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Start Date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">End Date</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
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
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Budget (USD)
                <span className="ml-2 font-normal text-slate-400">— used for the financial report</span>
              </label>
              <Input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="4250000"
                inputMode="numeric"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">Initial Milestones</p>
                  <p className="text-xs text-slate-500">Each row becomes a Gantt task and an audit entry.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMilestones((rows) => [...rows, newRow()])}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Milestone
                </Button>
              </div>

              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <div
                    key={m.id}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_auto]"
                  >
                    <Input
                      value={m.name}
                      onChange={(e) => updateMilestone(m.id, { name: e.target.value })}
                      placeholder={`Milestone ${i + 1} name`}
                    />
                    <select
                      value={m.phase}
                      onChange={(e) => updateMilestone(m.id, { phase: e.target.value as ConstructionPhase })}
                      className="block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm capitalize shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {PHASES.map((p) => (
                        <option key={p} value={p} className="capitalize">
                          {p}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="date"
                      value={m.startDate}
                      onChange={(e) => updateMilestone(m.id, { startDate: e.target.value })}
                    />
                    <Input
                      type="date"
                      value={m.endDate}
                      onChange={(e) => updateMilestone(m.id, { endDate: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setMilestones((rows) => rows.filter((r) => r.id !== m.id))}
                      disabled={milestones.length === 1}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Remove milestone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Project'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
