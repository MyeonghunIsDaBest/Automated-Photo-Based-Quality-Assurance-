import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, CheckSquare,
  Image as ImageIcon, Lock, Plus, Trash2, Upload as UploadIcon, X,
} from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { Task, Zone, ConstructionPhase, User } from '../../../types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useAppStore } from '../../../store';
import { useGanttSideStore, useChecklist } from '../store';
import { canUploadPhotos, canForceTaskProgress } from '../../../lib/permissions';
import { uploadPhoto, getPhotoUrl } from '../../../lib/api/photos';
import { supabaseConfigured } from '../../../lib/supabase';
import { useProjectConfig } from '../../../lib/hooks/useProjectConfig';
import { useTaskAiSignal } from '../../../lib/hooks/useTaskAiSignal';
import ProgressionBreakdown from '../../../components/progression/ProgressionBreakdown';
import MotionDrawer from '../../../components/ui/MotionDrawer';
import type { ProjectConfig } from '../../../types';

interface TaskDrawerProps {
  task: Task | null;          // null when creating
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => Promise<void> | void;
  onCreate: (input: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  zones: Zone[];
  projectId: string;
  currentUser: User | null;
  readOnly?: boolean;
  canDelete?: boolean;
}

type SubTab = 'details' | 'checklist' | 'photos';

const TABS: { id: SubTab; label: string; icon: typeof CheckSquare }[] = [
  { id: 'details',   label: 'Details',   icon: CheckSquare },
  { id: 'checklist', label: 'Checklist', icon: CheckCircle2 },
  { id: 'photos',    label: 'Photos',    icon: ImageIcon },
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
  zones, projectId, currentUser, readOnly = false, canDelete = true,
}: TaskDrawerProps) {
  const isCreate = task === null;
  const [draft, setDraft] = useState<Partial<Task>>({});
  const [activeTab, setActiveTab] = useState<SubTab>('details');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-project config drives the progression UI mode (manual slider vs.
  // signal-driven breakdown) and whether the manager force-floor is allowed.
  // Hook subscribes to the active projectId so a switch invalidates.
  const { config: projectConfig } = useProjectConfig(projectId);

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
        isPhaseAnchor: false,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const titleId = 'task-drawer-title';

  return (
    <MotionDrawer
      open={isOpen}
      onClose={onClose}
      sizeClass="sm:w-[480px] lg:w-[560px]"
      ariaLabel="Task"
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
        <div className="editorial-scrollbox flex-1 p-5">
          {(isCreate || activeTab === 'details') && (
            <DetailsPane
              task={task}
              draft={draft}
              setDraft={setDraft}
              commitField={commitField}
              zones={zones}
              readOnly={readOnly}
              isCreate={isCreate}
              projectConfig={projectConfig}
            />
          )}
          {!isCreate && activeTab === 'checklist' && task && (
            <ChecklistPane taskId={task.id} readOnly={readOnly} />
          )}
          {!isCreate && activeTab === 'photos' && task && (
            <PhotosPane task={task} projectId={projectId} currentUser={currentUser} />
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
    </MotionDrawer>
  );
}

// ─── Sub-tab panes ─────────────────────────────────────────────────────────

function DetailsPane({
  task, draft, setDraft, commitField, zones, readOnly, isCreate, projectConfig,
}: {
  task: Task | null;
  draft: Partial<Task>;
  setDraft: (fn: (d: Partial<Task>) => Partial<Task>) => void;
  commitField: <K extends keyof Task>(k: K, v: Task[K]) => void;
  zones: Zone[];
  readOnly: boolean;
  isCreate: boolean;
  projectConfig: ProjectConfig | null;
}) {
  const checklistItems = useChecklist(task?.id ?? '');
  const checklistDonePct = useMemo(() => {
    if (checklistItems.length === 0) return 0;
    return Math.round(
      (checklistItems.filter((i) => i.done).length / checklistItems.length) * 100,
    );
  }, [checklistItems]);

  // Real AI signal from ai_analyses (replaces the old percentComplete proxy).
  const aiSignal = useTaskAiSignal(task?.id ?? null);

  // Force-progress is owner-only — site managers / admins can still edit task
  // metadata but must let AI / photos / checklist drive percentComplete.
  const currentProfile = useAppStore((s) => s.currentProfile);
  const isOwner = canForceTaskProgress(currentProfile);

  // Mode-derived UI flags. When the config hasn't hydrated yet, fall back to
  // 'manual' so the existing slider stays visible — never less-functional than
  // pre-config behaviour.
  const progressionMode = projectConfig?.progressionMode ?? 'manual';
  const manualFloorAllowed = projectConfig?.manualFloorAllowed ?? true;
  // Slider is gated on owner-tier. Create flow always shows it (every task
  // needs a starting percentage); for existing tasks only the owner can pull
  // the override.
  const sliderAllowedByMode =
    isCreate ||
    progressionMode === 'manual' ||
    (progressionMode === 'human_assisted' && manualFloorAllowed);
  const showSlider = sliderAllowedByMode && (isCreate || isOwner);
  const showSliderLocked = sliderAllowedByMode && !showSlider;
  const showBreakdown = !!task && !!projectConfig && progressionMode !== 'manual';
  const sliderLabelPrefix =
    progressionMode === 'human_assisted' && !isCreate ? 'Override progress' : 'Progress';
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

      {showBreakdown && task && projectConfig && (
        <Field label="Signals">
          <ProgressionBreakdown
            signals={{
              checklistPct: checklistDonePct,
              photoCount: task.photoCount,
              aiAvgPct: aiSignal.signalPct,
            }}
            weights={{
              checklist: projectConfig.weightChecklist,
              photos:    projectConfig.weightPhotos,
              ai:        projectConfig.weightAi,
            }}
            targetPhotos={projectConfig.targetPhotosPerTask}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            AI signal: {aiSignal.sampleSize === 0
              ? 'no qualifying analyses yet'
              : `${aiSignal.signalPct}% across ${aiSignal.sampleSize} analyses`}
            {aiSignal.lastAnalysedAt && ` · last ${format(parseISO(aiSignal.lastAnalysedAt), 'MMM d, h:mm a')}`}
          </p>
          {progressionMode === 'full_auto' && (
            <p className="mt-1 text-[11px] text-slate-500">
              Full-auto mode — progress is derived from the signals above. Manual override is disabled for this project.
            </p>
          )}
        </Field>
      )}

      {showSlider && (
        <Field label={`${sliderLabelPrefix} — ${draft.percentComplete ?? 0}%`}>
          {!isCreate && isOwner && (
            <p className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
              <Lock className="h-3 w-3" />
              Override · bypasses AI signal
            </p>
          )}
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
      )}

      {showSliderLocked && task && (
        <Field label={`Progress — ${task.percentComplete}%`}>
          <div
            className="group relative"
            title="Progress is owner-only. It moves automatically from AI analyses, photo coverage, and checklist completion."
          >
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${task.percentComplete}%` }}
              />
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
              <Lock className="h-3 w-3" />
              Owner-only override. Progress is derived from AI confidence, photos, and checklist.
            </p>
          </div>
        </Field>
      )}

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

// PhotosPane — list of media attached to this task plus an upload control
// gated by `canUploadPhotos`. Accepts images and videos via the `photos` table
// (taskId is set so the file appears here on next refresh and the task's
// progress hooks downstream can pick it up). Documents (PDF/DOCX) belong on
// the Plans tab and are routed via Files; the helper text reflects that.
function PhotosPane({
  task, projectId, currentUser,
}: {
  task: Task;
  projectId: string;
  currentUser: User | null;
}) {
  const storePhotos = useAppStore((s) => s.photos);
  const taskPhotos = useMemo(
    () => storePhotos.filter((p) => p.taskId === task.id),
    [storePhotos, task.id],
  );

  const canUpload = canUploadPhotos(currentUser);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraTiles, setExtraTiles] = useState<{
    id: string; url: string | null; filename: string; uploadedAt: string;
  }[]>([]);

  const triggerPicker = () => inputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!supabaseConfigured()) {
      setError('Uploads need Supabase env keys to be set.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        // Reject docs early — they belong on the Plans tab. The dropzone hint
        // explains this; this guard is for drag-drop and direct picker bypass.
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          setError(`${file.name}: documents go in the Plans tab.`);
          continue;
        }
        const row = await uploadPhoto({ file, projectId, taskId: task.id });
        const signed = await getPhotoUrl(row.storage_path);
        setExtraTiles((prev) => [
          { id: row.id, url: signed, filename: row.filename, uploadedAt: row.uploaded_at },
          ...prev,
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const totalCount = taskPhotos.length + extraTiles.length;

  return (
    <div className="space-y-4">
      {canUpload ? (
        <div>
          <button
            type="button"
            onClick={triggerPicker}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-5 text-sm text-slate-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <UploadIcon className="h-4 w-4" />
            {busy ? 'Uploading…' : 'Upload photo or video'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/quicktime"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <p className="mt-1.5 text-[10px] text-slate-400">
            Images and videos attach to this task. For PDFs / docs, use the Plans tab.
          </p>
          {error && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Lock className="h-3.5 w-3.5 text-slate-400" />
          Your role can view photos but not upload to this task.
        </div>
      )}

      {totalCount === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
          No photos yet. Upload one against this task and the bar advances automatically.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {extraTiles.map((p) => (
            <a
              key={p.id}
              href={p.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square overflow-hidden rounded-md bg-slate-100"
            >
              {p.url ? (
                <img
                  src={p.url}
                  alt={p.filename}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageIcon className="h-6 w-6 text-slate-300" />
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="truncate text-[10px] font-medium text-white">
                  {format(parseISO(p.uploadedAt), 'MMM d')}
                </p>
              </div>
            </a>
          ))}
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
      )}
    </div>
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