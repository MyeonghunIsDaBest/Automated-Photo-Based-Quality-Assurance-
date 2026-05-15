// PhaseEditModal — owner-only batch editor for the sub-tasks under one
// construction phase. Opens from the pencil icon on each phase row in
// `TasksTab`'s left pane.
//
// Owner can drag the slider on each sub-task to force-progress it directly
// (bypassing the AI signal). Non-owners see locked bars + a tooltip
// explaining that progress is derived from photos / checklist / AI.
// Mirrors the gating already in TaskDrawer.tsx so the rules stay consistent.

import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Task, TaskStatus } from '../../../types';
import { rolledUpPct } from '../../../types';
import { useAppStore } from '../../../store';
import { canForceTaskProgress } from '../../../lib/permissions';
import { useTaskAiSignal } from '../../../lib/hooks/useTaskAiSignal';

interface PhaseEditModalProps {
  anchor: Task;
  tasks: Task[];
  canEdit: boolean;
  projectId: string;
  onClose: () => void;
  onSaveTask: (task: Task) => Promise<void> | void;
  onCreateTask: (newTask: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  complete:    'bg-emerald-100 text-emerald-700',
  delayed:     'bg-red-100 text-red-700',
  blocked:     'bg-amber-100 text-amber-700',
};

export default function PhaseEditModal({
  anchor, tasks, canEdit, projectId,
  onClose, onSaveTask, onCreateTask, onDeleteTask,
}: PhaseEditModalProps) {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const isOwner = canForceTaskProgress(currentProfile);
  // Children must be re-derived on every render so the modal reflects new
  // tasks created via its own "+ Add sub-task" footer.
  const children = useMemo(
    () => tasks
      .filter((t) => t.parentTaskId === anchor.id)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [tasks, anchor.id],
  );

  const rolled = useMemo(() => rolledUpPct(anchor, tasks), [anchor, tasks]);
  const photoTotal = useMemo(
    () => children.reduce((sum, c) => sum + (c.photoCount ?? 0), 0),
    [children],
  );

  // ESC closes (when no input is focused inside).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="phase-modal-title"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Manage phase
              </p>
              <h2
                id="phase-modal-title"
                className="mt-0.5 text-lg font-semibold capitalize text-slate-900"
              >
                {anchor.phase}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Rolled-up stats strip */}
          <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <Stat label="Rolled-up" value={`${rolled}%`} />
            <Stat label="Sub-tasks" value={`${children.length}`} />
            <Stat label="Photos" value={`${photoTotal}`} />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-1.5 animate-bar-grow rounded-full bg-emerald-500 transition-[width] duration-700 ease-out"
              style={{ width: `${rolled}%` }}
            />
          </div>
        </header>

        {/* Body */}
        <div className="editorial-scrollbox flex-1 px-5 py-4">
          {children.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
              No sub-tasks under this phase yet. Add one below to start tracking.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {children.map((child) => (
                <SubTaskEditor
                  key={child.id}
                  task={child}
                  isOwner={isOwner}
                  canEdit={canEdit}
                  onSave={onSaveTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer — inline add + close */}
        <footer className="border-t border-slate-100 px-5 py-3">
          {canEdit ? (
            <InlineAdd anchor={anchor} projectId={projectId} onCreate={onCreateTask} />
          ) : (
            <p className="text-[11px] text-slate-400">
              Sub-task creation is owner-only.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
        {value}
      </p>
    </div>
  );
}

// ─── Sub-task editor row ───────────────────────────────────────────────────

function SubTaskEditor({
  task, isOwner, canEdit, onSave, onDelete,
}: {
  task: Task;
  isOwner: boolean;
  canEdit: boolean;
  onSave: (task: Task) => Promise<void> | void;
  onDelete: (taskId: string) => Promise<void> | void;
}) {
  const aiSignal = useTaskAiSignal(task.id);
  const [pct, setPct] = useState(task.percentComplete);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync local slider state when the underlying task changes (e.g. a save
  // round-trip lands or another modal-driven update echoes back).
  useEffect(() => {
    setPct(task.percentComplete);
  }, [task.percentComplete]);

  const commit = async (next: number) => {
    if (next === task.percentComplete) return;
    setSaving(true);
    const status: TaskStatus =
      next >= 100 ? 'complete' :
      next > 0    ? 'in_progress' :
                    'not_started';
    try {
      await onSave({ ...task, percentComplete: next, status });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 400);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {format(parseISO(task.startDate), 'MMM d')} → {format(parseISO(task.endDate), 'MMM d')}
            {task.photoCount > 0 && <span> · {task.photoCount} photo{task.photoCount === 1 ? '' : 's'}</span>}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {aiSignal.sampleSize > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700"
              title={`AI signal across ${aiSignal.sampleSize} analyses`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {aiSignal.signalPct}%
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_BADGE[task.status]}`}>
            {task.status.replace('_', ' ')}
          </span>
          {canEdit && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-600"
              aria-label={`Delete ${task.name}`}
              title="Delete sub-task"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          {confirmDelete && (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDelete(task.id);
                  setConfirmDelete(false);
                }}
                className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700"
              >
                <Trash2 className="h-3 w-3" />
                Confirm
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`mt-2.5 rounded-md px-1 py-0.5 transition-colors ${justSaved ? 'bg-emerald-50' : ''}`}>
        {isOwner ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 flex-shrink-0 text-right tabular-nums text-xs font-medium text-slate-700">
                {pct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
              onBlur={(e) => commit(Number(e.target.value))}
              disabled={saving}
              className="w-full accent-emerald-600"
              aria-label={`Override progress for ${task.name}`}
            />
            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-700">
              <Lock className="h-2.5 w-2.5" />
              Owner override · bypasses AI signal
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${task.percentComplete}%` }}
                />
              </div>
              <span className="w-10 flex-shrink-0 text-right tabular-nums text-xs font-medium text-slate-700">
                {task.percentComplete}%
              </span>
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500">
              <Lock className="h-2.5 w-2.5" />
              Owner-only override. Progress is derived from AI, photos, and checklist.
            </p>
          </>
        )}
      </div>
    </li>
  );
}

// ─── Inline add sub-task ───────────────────────────────────────────────────

function InlineAdd({
  anchor, projectId, onCreate,
}: {
  anchor: Task;
  projectId: string;
  onCreate: (input: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCreate({
        projectId,
        parentTaskId: anchor.id,
        name: trimmed,
        phase: anchor.phase,
        startDate: anchor.startDate,
        endDate: anchor.endDate,
        durationDays: anchor.durationDays,
        percentComplete: 0,
        status: 'not_started',
        dependencies: [],
        notes: [],
        isPhaseAnchor: false,
      });
      setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Plus className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Add a sub-task to ${anchor.phase}…`}
        disabled={busy}
        className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
      />
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
    </form>
  );
}
