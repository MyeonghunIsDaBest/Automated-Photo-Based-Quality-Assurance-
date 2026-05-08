import { useEffect, useState } from 'react';
import {
  Calendar, Circle, Layers, Trash2, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Task, Zone } from '../../../types';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { useGanttSideStore } from '../store';
import type { PunchItem } from '../types';

interface PunchItemDrawerProps {
  item: PunchItem | null;
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  tasks: Task[];
  zones: Zone[];
  readOnly?: boolean;
  canDelete?: boolean;
}

export default function PunchItemDrawer({
  item, isOpen, onClose, projectId, tasks, zones,
  readOnly = false, canDelete = true,
}: PunchItemDrawerProps) {
  const updateItem = useGanttSideStore((s) => s.updatePunchItem);
  const toggleItem = useGanttSideStore((s) => s.togglePunchItem);
  const removeItem = useGanttSideStore((s) => s.removePunchItem);

  const [draft, setDraft] = useState<Partial<PunchItem>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen || !item) return;
    setDraft({
      text: item.text,
      assigneeId: item.assigneeId,
      zoneId: item.zoneId,
      taskId: item.taskId,
      dueDate: item.dueDate,
    });
    setConfirmDelete(false);
  }, [isOpen, item?.id]);

  if (!isOpen || !item) return null;

  const isDone = item.status === 'done';
  const linkedTask = tasks.find((t) => t.id === item.taskId);
  const linkedZone = zones.find((z) => z.id === item.zoneId);

  const commitField = <K extends keyof PunchItem>(key: K, value: PunchItem[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (item[key] === value) return;
    updateItem(projectId, item.id, { [key]: value } as Partial<PunchItem>);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[460px] sm:rounded-l-2xl sm:rounded-tr-none lg:w-[520px]"
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Punch item
            </p>
            <textarea
              value={draft.text ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              onBlur={() => commitField('text', (draft.text ?? '').trim() || item.text)}
              disabled={readOnly}
              rows={2}
              className={`mt-1 w-full resize-none border-0 bg-transparent text-base font-semibold focus:outline-none ${
                isDone ? 'text-slate-400 line-through' : 'text-slate-900'
              }`}
            />
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider ${
                isDone
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {isDone ? 'Closed' : 'Open'}
            </Badge>
          </div>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Toggle status big-button */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => toggleItem(projectId, item.id)}
              className={`mb-5 flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${
                isDone
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              {isDone ? 'Reopen item' : 'Mark as done'}
            </button>
          )}

          {/* Linked context */}
          <section className="mb-5">
            <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Linked
            </h3>
            <div className="space-y-2">
              <Field label="Task">
                <select
                  value={draft.taskId ?? ''}
                  onChange={(e) => commitField('taskId', e.target.value || undefined)}
                  disabled={readOnly}
                  className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
                >
                  <option value="">— None —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                {linkedTask && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Circle className="h-2 w-2 text-slate-400" fill="currentColor" />
                    Currently linked to <strong className="ml-0.5 text-slate-700">{linkedTask.name}</strong>
                  </p>
                )}
              </Field>

              <Field label="Zone">
                <select
                  value={draft.zoneId ?? ''}
                  onChange={(e) => commitField('zoneId', e.target.value || undefined)}
                  disabled={readOnly}
                  className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
                >
                  <option value="">Project-wide</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
                {linkedZone && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Layers className="h-3 w-3" />
                    {linkedZone.name}
                  </p>
                )}
              </Field>
            </div>
          </section>

          {/* Schedule + assignee */}
          <section className="mb-5">
            <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Schedule
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Due date">
                <Input
                  type="date"
                  value={draft.dueDate ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value || undefined }))}
                  onBlur={(e) => commitField('dueDate', e.target.value || undefined)}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Assignee">
                <Input
                  value={draft.assigneeId ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, assigneeId: e.target.value || undefined }))}
                  onBlur={(e) => commitField('assigneeId', e.target.value || undefined)}
                  disabled={readOnly}
                  placeholder="user_id"
                />
              </Field>
            </div>
          </section>

          {/* Trail */}
          <section>
            <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Trail
            </h3>
            <ul className="space-y-2 text-[11px] text-slate-500">
              <li className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-slate-400" />
                Created {format(parseISO(item.createdAt), 'MMM d, yyyy h:mm a')}
                {' '}by{' '}
                <span className="text-slate-700">{item.createdBy}</span>
              </li>
              {isDone && item.closedAt && (
                <li className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-emerald-500" />
                  Closed {format(parseISO(item.closedAt), 'MMM d, yyyy h:mm a')}
                </li>
              )}
            </ul>
          </section>
        </div>

        {/* Footer */}
        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <span className="text-[11px] text-slate-400">
            {readOnly ? 'Read-only' : 'Auto-saves on blur'}
          </span>
          {!readOnly && canDelete && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete?</span>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <button
                  type="button"
                  onClick={() => { removeItem(projectId, item.id); onClose(); }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
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
                Delete
              </button>
            )
          )}
        </footer>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}