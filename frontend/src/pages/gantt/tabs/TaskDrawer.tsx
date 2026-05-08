import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity as ActivityIcon, AlertCircle, Calendar, CheckCircle2,
  CheckSquare, ChevronRight, Image as ImageIcon, Link2, MessageSquare,
  Plus, Send, ShieldCheck, ShoppingCart, Trash2, X,
} from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { Task, Zone, NoteType, ConstructionPhase } from '../../../types';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Avatar, AvatarFallback } from '../../../components/ui/avatar';
import { useFeatureStore } from '../../../store/features';
import { useAppStore } from '../../../store';
import {
  useGanttSideStore,
  useChecklist,
  useOrdersForProject,
  orderTotal,
} from '../store';
import { useProjectActivity, ACTIVITY_VERBS } from '../lib/useProjectActivity';
import { canAddComments } from '../../../lib/permissions';

interface TaskDrawerProps {
  task: Task | null;          // null when creating
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => Promise<void> | void;
  onCreate: (input: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  zones: Zone[];
  allTasks: Task[];
  projectId: string;
  readOnly?: boolean;
  canDelete?: boolean;
}

type SubTab = 'details' | 'checklist' | 'dependencies' | 'photos' | 'comments' | 'orders' | 'activity';

const TABS: { id: SubTab; label: string; icon: typeof CheckSquare }[] = [
  { id: 'details',      label: 'Details',      icon: CheckSquare },
  { id: 'checklist',    label: 'Checklist',    icon: CheckCircle2 },
  { id: 'dependencies', label: 'Dependencies', icon: Link2 },
  { id: 'photos',       label: 'Photos',       icon: ImageIcon },
  { id: 'comments',     label: 'Comments',     icon: MessageSquare },
  { id: 'orders',       label: 'Orders',       icon: ShoppingCart },
  { id: 'activity',     label: 'Activity',     icon: ActivityIcon },
];

const PHASES: ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'drywall', 'finishing',
];

const DEFAULT_PHASE: ConstructionPhase = 'excavation';
const DAY_MS = 86_400_000;

// Drawer is a side-sheet on desktop / bottom-sheet on mobile. Auto-saves on
// blur in edit mode (no manual save button) — matches the modern PM-app feel.
// Create mode keeps a single Save button so the user knows when the row is
// committed.
export default function TaskDrawer({
  task, isOpen, onClose, onSave, onCreate, onDelete,
  zones, allTasks, projectId, readOnly = false, canDelete = true,
}: TaskDrawerProps) {
  const isCreate = task === null;
  const [draft, setDraft] = useState<Partial<Task>>({});
  const [activeTab, setActiveTab] = useState<SubTab>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track the latest committed task in a ref so rapid back-to-back
  // commits don't race on stale React state.
  const latestTaskRef = useRef<Task | null>(task);
  useEffect(() => { latestTaskRef.current = task; }, [task]);

  // Restore focus to whatever opened the drawer.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reset state when the drawer opens or the task identity changes.
  useEffect(() => {
    if (!isOpen) return;
    if (task) {
      setDraft({
        name: task.name,
        phase: task.phase,
        startDate: task.startDate,
        endDate: task.endDate,
        percentComplete: task.percentComplete,
        status: task.status,
        zoneId: task.zoneId ?? '',
        assigneeId: task.assigneeId ?? '',
        dependencies: task.dependencies,
        notes: task.notes,
      });
    } else {
      // Create defaults — sensible blank canvas.
      const today = new Date().toISOString().slice(0, 10);
      const twoWeeks = new Date(Date.now() + 14 * DAY_MS).toISOString().slice(0, 10);
      setDraft({
        name: '',
        phase: DEFAULT_PHASE,
        startDate: today,
        endDate: twoWeeks,
        percentComplete: 0,
        status: 'not_started',
        zoneId: '',
        dependencies: [],
        notes: [],
      });
    }
    setActiveTab('details');
    setConfirmDelete(false);
  }, [isOpen, task?.id]);

  // Body scroll lock + focus restore.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen]);

  // Escape to close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Auto-save in edit mode. In create mode, the user clicks Save explicitly.
  // Uses latestTaskRef so concurrent commits don't drop earlier field changes.
  const commitField = useCallback(async <K extends keyof Task>(key: K, value: Task[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (isCreate) return;
    const current = latestTaskRef.current;
    if (!current || current[key] === value) return;
    // Optimistically update the ref so a follow-up commitField call
    // before props re-flow still sees this change.
    const next = { ...current, [key]: value };
    latestTaskRef.current = next;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }, [isCreate, onSave]);

  const handleCreate = async () => {
    if (!draft.name?.trim()) return;
    if (!draft.startDate || !draft.endDate) return;
    setSaving(true);
    try {
      const durationDays = Math.max(
        1,
        differenceInCalendarDays(parseISO(draft.endDate), parseISO(draft.startDate)) + 1,
      );
      await onCreate({
        projectId,
        name: draft.name.trim(),
        phase: draft.phase ?? DEFAULT_PHASE,
        startDate: draft.startDate,
        endDate: draft.endDate,
        durationDays,
        percentComplete: 0,
        status: 'not_started',
        zoneId: draft.zoneId || undefined,
        assigneeId: draft.assigneeId || undefined,
        dependencies: draft.dependencies ?? [],
        notes: [],
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const titleId = 'task-drawer-title';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel — bottom sheet on mobile, right sheet on desktop. */}
      <aside
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[480px] sm:rounded-l-2xl sm:rounded-tr-none lg:w-[560px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
        </div>

        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
              {isCreate ? 'New task' : 'Task'}
            </p>
            {isCreate ? (
              <input
                id={titleId}
                value={draft.name ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Task name…"
                className="mt-1 w-full border-0 bg-transparent text-lg font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none"
                autoFocus
              />
            ) : (
              <input
                id={titleId}
                value={draft.name ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                onBlur={() => {
                  const trimmed = (draft.name ?? '').trim() || (task?.name ?? '');
                  if (trimmed !== task?.name) commitField('name', trimmed);
                  // Reflect any normalization in the input.
                  setDraft((d) => ({ ...d, name: trimmed }));
                }}
                disabled={readOnly}
                className="mt-1 w-full border-0 bg-transparent text-lg font-semibold text-slate-900 focus:outline-none disabled:text-slate-700"
              />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Sub-tab strip */}
        {!isCreate && (
          <nav className="flex-shrink-0 border-b border-slate-100 px-2 py-2" aria-label="Task sections">
            <div className="-mx-2 overflow-x-auto px-2">
              <div className="inline-flex items-center gap-1" role="tablist">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(t.id)}
                      className={`flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {(isCreate || activeTab === 'details') && (
            <DetailsPane
              task={task}
              draft={draft}
              setDraft={setDraft}
              commitField={commitField}
              zones={zones}
              readOnly={readOnly}
              isCreate={isCreate}
            />
          )}
          {!isCreate && activeTab === 'checklist' && task && (
            <ChecklistPane taskId={task.id} readOnly={readOnly} />
          )}
          {!isCreate && activeTab === 'dependencies' && task && (
            <DependenciesPane
              task={task}
              draft={draft}
              setDraft={setDraft}
              commitField={commitField}
              allTasks={allTasks}
              readOnly={readOnly}
            />
          )}
          {!isCreate && activeTab === 'photos' && task && (
            <PhotosPane task={task} />
          )}
          {!isCreate && activeTab === 'comments' && task && (
            <CommentsPane task={task} />
          )}
          {!isCreate && activeTab === 'orders' && task && (
            <OrdersPane task={task} projectId={projectId} />
          )}
          {!isCreate && activeTab === 'activity' && task && (
            <ActivityPane task={task} projectId={projectId} />
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          {isCreate ? (
            <>
              <span className="text-xs text-slate-400">Saving creates the Gantt bar.</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving || !draft.name?.trim()}>
                  {saving ? 'Saving…' : 'Create task'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-400" aria-live="polite">
                {saving ? 'Saving…' : 'Auto-saves on blur'}
              </span>
              {!readOnly && canDelete && task && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600">Delete this task?</span>
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                    <button
                      type="button"
                      onClick={async () => { await onDelete(task.id); onClose(); }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 active:bg-red-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Confirm
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete task
                  </button>
                )
              )}
            </>
          )}
        </footer>
      </aside>
    </>
  );
}

// ─── Sub-tab panes ─────────────────────────────────────────────────────────

function DetailsPane({
  task, draft, setDraft, commitField, zones, readOnly, isCreate,
}: {
  task: Task | null;
  draft: Partial<Task>;
  setDraft: (fn: (d: Partial<Task>) => Partial<Task>) => void;
  commitField: <K extends keyof Task>(k: K, v: Task[K]) => void;
  zones: Zone[];
  readOnly: boolean;
  isCreate: boolean;
}) {
  const dateError = useMemo(() => {
    if (!draft.startDate || !draft.endDate) return null;
    return draft.endDate < draft.startDate ? 'End date is before start date.' : null;
  }, [draft.startDate, draft.endDate]);

  const commitPercent = (raw: string) => {
    const n = Math.max(0, Math.min(100, Number(raw) || 0));
    setDraft((d) => ({ ...d, percentComplete: n }));
    if (!isCreate) commitField('percentComplete', n);
  };

  return (
    <div className="space-y-5">
      <Field label="Phase">
        <select
          value={draft.phase ?? DEFAULT_PHASE}
          onChange={(e) => commitField('phase', e.target.value as ConstructionPhase)}
          disabled={readOnly}
          className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm capitalize shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
        >
          {PHASES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <Input
            type="date"
            value={draft.startDate ?? ''}
            max={draft.endDate || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
            onBlur={(e) => !isCreate && e.target.value && commitField('startDate', e.target.value)}
            disabled={readOnly}
          />
        </Field>
        <Field label="End">
          <Input
            type="date"
            value={draft.endDate ?? ''}
            min={draft.startDate || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
            onBlur={(e) => !isCreate && e.target.value && commitField('endDate', e.target.value)}
            disabled={readOnly}
          />
        </Field>
      </div>
      {dateError && (
        <p className="-mt-3 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          {dateError}
        </p>
      )}

      <Field label="Zone">
        <select
          value={draft.zoneId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            // commitField type expects Task['zoneId']; an empty string means "clear".
            commitField('zoneId', (v || undefined) as Task['zoneId']);
          }}
          disabled={readOnly}
          className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
        >
          <option value="">Project-wide</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Status">
        <select
          value={draft.status ?? 'not_started'}
          onChange={(e) => commitField('status', e.target.value as Task['status'])}
          disabled={readOnly}
          className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm capitalize shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
        >
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
          <option value="delayed">Delayed</option>
          <option value="complete">Complete</option>
        </select>
      </Field>

      <Field label={`Progress — ${draft.percentComplete ?? 0}%`}>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft.percentComplete ?? 0}
          onChange={(e) => setDraft((d) => ({ ...d, percentComplete: Number(e.target.value) }))}
          // Pointer covers mouse + touch + stylus. KeyUp covers keyboard nav.
          // Blur is the catch-all if focus moves away mid-drag.
          onPointerUp={(e) => !isCreate && commitPercent((e.target as HTMLInputElement).value)}
          onKeyUp={(e) => !isCreate && commitPercent((e.target as HTMLInputElement).value)}
          onBlur={(e) => !isCreate && commitPercent(e.target.value)}
          disabled={readOnly}
          className="w-full accent-emerald-600"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={draft.percentComplete ?? 0}
        />
      </Field>

      {!isCreate && task && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          <div>
            <p className="font-medium uppercase tracking-wider text-slate-400">Photos</p>
            <p className="mt-0.5 tabular-nums text-slate-700">{task.photoCount}</p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wider text-slate-400">Updated</p>
            <p className="mt-0.5 text-slate-700">
              {task.lastUpdated ? format(parseISO(task.lastUpdated), 'MMM d, h:mm a') : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistPane({ taskId, readOnly }: { taskId: string; readOnly: boolean }) {
  const items = useChecklist(taskId);
  const add    = useGanttSideStore((s) => s.addChecklistItem);
  const toggle = useGanttSideStore((s) => s.toggleChecklistItem);
  const remove = useGanttSideStore((s) => s.removeChecklistItem);
  const [text, setText] = useState('');

  const done = items.filter((i) => i.done).length;
  const pct = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    add(taskId, text.trim());
    setText('');
  };

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-medium text-slate-500">
              {done} of {items.length} done
            </p>
            <span className="tabular-nums text-xs text-slate-500">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {!readOnly && (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a sub-step…"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!text.trim()} aria-label="Add sub-step">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
          No sub-steps yet. Break this task down for cleaner tracking.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggle(taskId, item.id)}
                disabled={readOnly}
                className="h-4 w-4 cursor-pointer accent-emerald-600"
                aria-label={item.text}
              />
              <span className={`flex-1 text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {item.text}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(taskId, item.id)}
                  className="invisible inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 group-hover:visible focus:visible"
                  aria-label={`Remove ${item.text}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DependenciesPane({
  task, draft, setDraft, commitField, allTasks, readOnly,
}: {
  task: Task;
  draft: Partial<Task>;
  setDraft: (fn: (d: Partial<Task>) => Partial<Task>) => void;
  commitField: <K extends keyof Task>(k: K, v: Task[K]) => void;
  allTasks: Task[];
  readOnly: boolean;
}) {
  const blockedBy = (draft.dependencies ?? [])
    .map((id) => allTasks.find((t) => t.id === id))
    .filter((t): t is Task => Boolean(t));
  const blocks = allTasks.filter((t) => t.dependencies.includes(task.id));
  const candidates = allTasks.filter(
    (t) => t.id !== task.id && !(draft.dependencies ?? []).includes(t.id),
  );

  const handleAdd = (id: string) => {
    if (!id) return;
    const next = [...(draft.dependencies ?? []), id];
    setDraft((d) => ({ ...d, dependencies: next }));
    commitField('dependencies', next);
  };
  const handleRemove = (id: string) => {
    const next = (draft.dependencies ?? []).filter((d) => d !== id);
    setDraft((d) => ({ ...d, dependencies: next }));
    commitField('dependencies', next);
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Blocked by ({blockedBy.length})
        </h3>
        {blockedBy.length === 0 ? (
          <p className="text-sm text-slate-400">No blockers — this task can start anytime.</p>
        ) : (
          <ul className="space-y-1">
            {blockedBy.map((dep) => (
              <li key={dep.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <span className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                  dep.status === 'complete' ? 'bg-emerald-500' :
                  dep.status === 'in_progress' ? 'bg-blue-500' : 'bg-slate-400'
                }`} />
                <span className="min-w-0 flex-1 truncate text-slate-800">{dep.name}</span>
                <span className="tabular-nums text-xs text-slate-500">{dep.percentComplete}%</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemove(dep.id)}
                    className="text-slate-400 hover:text-red-500"
                    aria-label={`Remove dependency ${dep.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && candidates.length > 0 && (
          <select
            onChange={(e) => { handleAdd(e.target.value); e.target.value = ''; }}
            defaultValue=""
            aria-label="Add a dependency"
            className="mt-2 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="">+ Add a dependency…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Blocks ({blocks.length})
        </h3>
        {blocks.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing waits on this task.</p>
        ) : (
          <ul className="space-y-1">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-800">{b.name}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PhotosPane({ task }: { task: Task }) {
  const photos = useAppStore((s) => s.photos);
  const taskPhotos = useMemo(
    () => photos.filter((p) => p.taskId === task.id),
    [photos, task.id],
  );

  if (taskPhotos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
        No photos yet. Upload one against this task and the bar advances automatically.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {taskPhotos.map((p) => (
        <a
          key={p.id}
          href={p.storageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative aspect-square overflow-hidden rounded-md bg-slate-100"
        >
          <img
            src={p.thumbnailUrl ?? p.storageUrl}
            alt={p.filename}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
            <p className="truncate text-[10px] font-medium text-white">
              {format(parseISO(p.uploadedAt), 'MMM d')}
            </p>
          </div>
        </a>
      ))}
    </div>
  );
}

const NOTE_TYPE_META: Record<NoteType, { label: string; tone: string; icon: typeof AlertCircle }> = {
  issue:          { label: 'Issue',          tone: 'border-red-200 bg-red-50 text-red-700',       icon: AlertCircle },
  accuracy_check: { label: 'Accuracy check', tone: 'border-amber-200 bg-amber-50 text-amber-700', icon: ShieldCheck },
  general:        { label: 'Note',           tone: 'border-slate-200 bg-slate-50 text-slate-600', icon: MessageSquare },
};

function CommentsPane({ task }: { task: Task }) {
  const comments = useFeatureStore((s) => s.comments);
  const addComment = useAppStore((s) => s.addComment);
  const currentUser = useAppStore((s) => s.currentUser);
  const taskComments = useMemo(
    () => comments.filter((c) => c.taskId === task.id),
    [comments, task.id],
  );
  const [draft, setDraft] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');

  const canPost = currentUser ? canAddComments(currentUser) : false;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = draft.trim();
    if (!content) return;
    addComment(task.id, content, noteType);
    setDraft('');
    setNoteType('general');
  };

  // Cmd/Ctrl + Enter submits — common chat pattern.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <ul className="space-y-3">
        {taskComments.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
            No comments yet.
          </p>
        )}
        {taskComments.map((c) => {
          const meta = NOTE_TYPE_META[c.noteType ?? 'general'];
          const Icon = meta.icon;
          const initials = c.userName
            ? c.userName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
            : '??';
          return (
            <li key={c.id} className="flex gap-3">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium text-slate-900">{c.userName}</span>
                  <span className="text-[10px] text-slate-400">
                    {format(parseISO(c.createdAt), 'MMM d, h:mm a')}
                  </span>
                </div>
                <div className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.tone}`}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.content}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {canPost && (
        <form onSubmit={handleSubmit} className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-3">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            aria-label="Note type"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs"
          >
            <option value="general">Note</option>
            <option value="issue">Issue</option>
            <option value="accuracy_check">Accuracy check</option>
          </select>
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder="Leave a note… (⌘/Ctrl+Enter to send)"
              className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Post note"
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-slate-900 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function OrdersPane({ task, projectId }: { task: Task; projectId: string }) {
  const allOrders = useOrdersForProject(projectId);
  const linked = useMemo(() => allOrders.filter((o) => o.taskId === task.id), [allOrders, task.id]);

  if (linked.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
        <ShoppingCart className="mx-auto mb-2 h-5 w-5 text-slate-400" />
        <p className="text-sm font-medium text-slate-600">No orders linked yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Place an order in the Orders tab and tie it to this task — line items appear here with delivery status.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {linked.map((o) => (
        <li key={o.id} className="rounded-md border border-slate-200 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-slate-700">{o.poNumber}</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {o.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-slate-900">{o.supplierName}</p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>{o.lineItems.length} line{o.lineItems.length === 1 ? '' : 's'}</span>
            <span className="tabular-nums">${orderTotal(o).toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityPane({ task, projectId }: { task: Task; projectId: string }) {
  const events = useProjectActivity(projectId, { limit: 30 });
  const taskEvents = useMemo(
    () => events.filter((e) => e.targetEntityId === task.id),
    [events, task.id],
  );

  if (taskEvents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
        No activity recorded for this task yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {taskEvents.map((e) => (
        <li key={e.id} className="flex items-start gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-50">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800">
              <span className="font-medium">{e.actorName}</span>{' '}
              <span className="text-slate-500">{ACTIVITY_VERBS[e.kind]}</span>{' '}
              {e.targetLabel}
            </p>
            <p className="text-[10px] text-slate-400">
              {format(parseISO(e.timestamp), 'MMM d, h:mm a')}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Tiny field wrapper ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}