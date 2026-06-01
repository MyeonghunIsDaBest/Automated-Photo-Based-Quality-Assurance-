import { useEffect, useMemo, useState } from 'react';
import { Circle, Plus, X } from 'lucide-react';
import type { Task, User, Zone } from '../../../types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

export interface NewPunchInput {
  text: string;
  assigneeId?: string;
  zoneId?: string;
  taskId?: string;
  dueDate?: string;
}

interface NewPunchItemSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  zones: Zone[];
  currentUser: User | null;
  // Persists the new item (PunchView owns the list + adds createdBy).
  onCreate: (data: NewPunchInput) => void;
}

const inDays = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const DUE_PRESETS: { days: number; label: string }[] = [
  { days: 0, label: 'Today' },
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
];

// Trade-flavoured starter snippets — tapping a chip prefills the textarea
// with a realistic punch-list defect. Ordered from most-common (defect) to
// least (housekeeping).
const QUICK_SNIPPETS: { label: string; text: string }[] = [
  { label: 'Re-terminate ground',  text: 'Re-terminate ground wire at L14 panel — lug appears loose.' },
  { label: 'Replace damaged conduit', text: 'Replace damaged EMT conduit run between J-box A12 and ceiling rough-in.' },
  { label: 'Cap unused outlet',     text: 'Cap unused receptacle on east wall — energised and untrimmed.' },
  { label: 'Cover plate missing',   text: 'Missing cover plate on junction box near corridor stair B.' },
  { label: 'Excavation backfill',   text: 'Backfill open trench at service entry; compaction not signed off.' },
  { label: 'Label panel',           text: 'Update panel schedule labels at DB-2 to match as-built drawings.' },
  { label: 'Touch-up paint',        text: 'Touch-up paint where stub-up cores were trimmed at L13 north.' },
];

export default function NewPunchItemSheet({
  isOpen, onClose, tasks, zones, currentUser, onCreate,
}: NewPunchItemSheetProps) {
  const [text, setText] = useState('');
  const [taskId, setTaskId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setText('');
    setTaskId('');
    setZoneId('');
    setDueDate('');
    setAssigneeId(currentUser?.id ?? '');
  }, [isOpen, currentUser?.id]);

  const canSubmit = text.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onCreate({
      text: text.trim(),
      assigneeId: assigneeId.trim() || undefined,
      zoneId: zoneId || undefined,
      taskId: taskId || undefined,
      dueDate: dueDate || undefined,
    });
    onClose();
  };

  // Allow Cmd/Ctrl+Enter to submit from the textarea — the same shortcut the
  // Messages composer uses.
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Pre-suggest a zone when a task is picked (use the task's zone).
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  useEffect(() => {
    if (!taskId || zoneId) return;
    const t = taskById.get(taskId);
    if (t?.zoneId) setZoneId(t.zoneId);
  }, [taskId, taskById, zoneId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Quick capture
            </p>
            <h3
              className="mt-1 text-lg font-semibold text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              Add a punch item
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="editorial-scrollbox flex-1 px-5 py-4">
          <div className="space-y-5">
            {/* The thing */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                What needs handling?
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                rows={3}
                placeholder="e.g. Re-terminate ground wire at L14 panel — lug appears loose."
                autoFocus
                className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Cmd/Ctrl + Enter to capture
              </p>
              {/* Trade snippets — tap to prefill the textarea */}
              {!text.trim() && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {QUICK_SNIPPETS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setText(s.text)}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      title={s.text}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Linked context — task picks a zone for free */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Linked task (optional)
                </label>
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">— None —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {taskId && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Circle className="h-2 w-2 text-slate-400" fill="currentColor" />
                    {taskById.get(taskId)?.name}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Zone (optional)
                </label>
                <select
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Project-wide</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due-date presets */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Due (optional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DUE_PRESETS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setDueDate(inDays(p.days))}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      dueDate === inDays(p.days)
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    dueDate === ''
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  No due date
                </button>
              </div>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-2 h-9"
              />
            </div>

            {/* Assignee */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Assignee (optional)
              </label>
              <Input
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                placeholder="user_id (defaults to you)"
              />
              {currentUser && assigneeId === currentUser.id && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Assigned to you
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add to punch list
          </Button>
        </footer>
      </div>
    </div>
  );
}