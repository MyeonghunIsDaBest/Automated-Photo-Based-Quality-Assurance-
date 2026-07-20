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
import MotionDrawer from '../../../components/ui/MotionDrawer';
import { cn } from '../../../lib/cn';
import { inputField } from '../components/ledger';

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

// Warm task tones — mirrors the TasksTab / SplitPaneGantt status hexes
// (in-progress amber, complete sage, delayed red, blocked slate, draft ink).
const STATUS_BADGE: Record<TaskStatus, string> = {
  not_started: 'bg-[#ECE8DE] text-[#1A1A1A]',
  in_progress: 'bg-[#F9EFD9] text-[#9A6B12]',
  complete:    'bg-[#E5F2EA] text-[#246F47]',
  delayed:     'bg-[#FBE5E5] text-[#C44545]',
  blocked:     'bg-[#EEF1F4] text-[#5B6B7B]',
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

  return (
    <MotionDrawer
      open
      onClose={onClose}
      variant="modal"
      sizeClass="max-w-2xl"
      ariaLabel="Manage phase"
    >
        {/* Header */}
        <header className="border-b border-[#EFEBE0] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                Manage phase
              </p>
              <h2 className="mt-0.5 text-lg font-semibold capitalize text-[#1A1A1A]">
                {anchor.phase}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid min-h-11 min-w-11 flex-shrink-0 place-items-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Rolled-up stats strip */}
          <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-[#FAF8F2] px-3 py-2">
            <Stat label="Rolled-up" value={`${rolled}%`} />
            <Stat label="Sub-tasks" value={`${children.length}`} />
            <Stat label="Photos" value={`${photoTotal}`} />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F0EDE4]">
            <div
              className="h-1.5 animate-bar-grow rounded-full bg-[#2F8F5C] transition-[width] duration-700 ease-out"
              style={{ width: `${rolled}%` }}
            />
          </div>
        </header>

        {/* Body */}
        <div className="editorial-scrollbox flex-1 px-5 py-4">
          {children.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-4 py-6 text-center text-sm text-[#A0A0A0]">
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
        <footer className="border-t border-[#EFEBE0] px-5 py-3">
          {canEdit ? (
            <InlineAdd anchor={anchor} projectId={projectId} onCreate={onCreateTask} />
          ) : (
            <p className="text-[11px] text-[#A0A0A0]">
              Sub-task creation is owner-only.
            </p>
          )}
        </footer>
    </MotionDrawer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-[#1A1A1A]">
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
    <li className="rounded-lg border border-[#E6E1D4] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#1A1A1A]">{task.name}</p>
          <p className="mt-0.5 text-[11px] text-[#6B6B6B]">
            {format(parseISO(task.startDate), 'MMM d')} → {format(parseISO(task.endDate), 'MMM d')}
            {task.photoCount > 0 && <span> · {task.photoCount} photo{task.photoCount === 1 ? '' : 's'}</span>}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {aiSignal.sampleSize > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-[#EFE7FB] px-1.5 py-0.5 text-[10px] font-medium text-[#6B3FA0]"
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
              className="inline-flex h-6 w-6 items-center justify-center rounded text-[#D8D2C4] hover:bg-[#FBE5E5] hover:text-[#C44545]"
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
                className="text-[10px] text-[#6B6B6B] hover:text-[#3A3A3A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDelete(task.id);
                  setConfirmDelete(false);
                }}
                className="inline-flex items-center gap-1 rounded bg-[#C44545] px-2 py-0.5 text-[10px] font-medium text-white hover:bg-[#B03D3D]"
              >
                <Trash2 className="h-3 w-3" />
                Confirm
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`mt-2.5 rounded-md px-1 py-0.5 transition-colors ${justSaved ? 'bg-[#E1F3EA]' : ''}`}>
        {isOwner ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0EDE4]">
                <div
                  className="h-1.5 rounded-full bg-[#2F8F5C] transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 flex-shrink-0 text-right tabular-nums text-xs font-medium text-[#3A3A3A]">
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
              className="w-full accent-[#2F8F5C]"
              aria-label={`Override progress for ${task.name}`}
            />
            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[#9A6B12]">
              <Lock className="h-2.5 w-2.5" />
              Owner override · bypasses AI signal
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0EDE4]">
                <div
                  className="h-1.5 rounded-full bg-[#2F8F5C] transition-[width] duration-500 ease-out"
                  style={{ width: `${task.percentComplete}%` }}
                />
              </div>
              <span className="w-10 flex-shrink-0 text-right tabular-nums text-xs font-medium text-[#3A3A3A]">
                {task.percentComplete}%
              </span>
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#6B6B6B]">
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
      <Plus className="h-3.5 w-3.5 flex-shrink-0 text-[#2F8F5C]" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Add a sub-task to ${anchor.phase}…`}
        disabled={busy}
        className={cn(inputField, 'min-w-0 flex-1 py-1.5')}
      />
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="inline-flex h-8 items-center rounded-md bg-[#2F8F5C] px-3 text-xs font-medium text-white hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
    </form>
  );
}
