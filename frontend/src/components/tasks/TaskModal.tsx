import { useState, useEffect, useMemo } from 'react';
import { X, Trash2, Save, Lock, AlertCircle, ShieldCheck, MessageSquare, Send } from 'lucide-react';
import { Task, TaskStatus, ConstructionPhase, Comment, NoteType } from '../../types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { useAppStore } from '../../store';
import { canAddComments } from '../../lib/permissions';

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (taskId: string) => void;
  zones: { id: string; name: string; colorCode: string }[];
  allTasks: Task[];
  readOnly?: boolean;
  canDelete?: boolean;
}

const NOTE_TYPE_META: Record<NoteType, { label: string; icon: typeof AlertCircle; tone: string }> = {
  issue:           { label: 'Issue',          icon: AlertCircle,  tone: 'bg-red-50 text-red-700 border-red-200' },
  accuracy_check:  { label: 'Accuracy check', icon: ShieldCheck,  tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  general:         { label: 'Note',           icon: MessageSquare, tone: 'bg-slate-50 text-slate-600 border-slate-200' },
};

export default function TaskModal({
  task,
  isOpen,
  onClose,
  onSave,
  onDelete,
  zones,
  allTasks,
  readOnly = false,
  canDelete = true,
}: TaskModalProps) {
  const { currentUser, comments, addComment } = useAppStore();
  const [formData, setFormData] = useState<Partial<Task>>({
    name: '',
    phase: 'excavation',
    startDate: '',
    endDate: '',
    percentComplete: 0,
    status: 'not_started',
    zoneId: '',
    dependencies: [],
    notes: [],
  });

  const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'comments' | 'history'>('details');
  const [draftNote, setDraftNote] = useState('');
  const [draftNoteType, setDraftNoteType] = useState<NoteType>('general');

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        phase: task.phase,
        startDate: task.startDate,
        endDate: task.endDate,
        percentComplete: task.percentComplete,
        status: task.status,
        zoneId: task.zoneId || '',
        dependencies: task.dependencies,
        notes: task.notes,
      });
    }
  }, [task]);

  // Default the comments tab when opening read-only — the only thing the user can do.
  useEffect(() => {
    if (isOpen && readOnly) setActiveTab('comments');
  }, [isOpen, readOnly]);

  const taskComments = useMemo<Comment[]>(() => {
    if (!task) return [];
    return comments
      .filter((c) => c.taskId === task.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [comments, task]);

  if (!isOpen || !task) return null;

  const allowComment = canAddComments(currentUser);

  const handleSave = () => {
    if (readOnly) return;
    onSave({
      ...task,
      ...formData,
      durationDays: Math.ceil(
        (new Date(formData.endDate!).getTime() - new Date(formData.startDate!).getTime()) /
          (1000 * 60 * 60 * 24)
      ),
      lastUpdated: new Date().toISOString(),
      updateSource: 'manual' as const,
    });
  };

  const handleDelete = () => {
    if (readOnly) return;
    if (confirm(`Are you sure you want to delete "${task.name}"?`)) {
      onDelete(task.id);
      onClose();
    }
  };

  const handleAddDependency = (taskId: string) => {
    if (readOnly) return;
    if (!formData.dependencies?.includes(taskId) && taskId !== task.id) {
      setFormData({
        ...formData,
        dependencies: [...(formData.dependencies || []), taskId],
      });
    }
  };

  const handleRemoveDependency = (taskId: string) => {
    if (readOnly) return;
    setFormData({
      ...formData,
      dependencies: formData.dependencies?.filter((id) => id !== taskId) || [],
    });
  };

  const handleAddNote = () => {
    if (readOnly) return;
    const note = prompt('Enter note:');
    if (note) {
      setFormData({
        ...formData,
        notes: [...(formData.notes || []), note],
      });
    }
  };

  const handleRemoveNote = (index: number) => {
    if (readOnly) return;
    setFormData({
      ...formData,
      notes: formData.notes?.filter((_, i) => i !== index) || [],
    });
  };

  const handleSubmitComment = () => {
    const body = draftNote.trim();
    if (!body || !task) return;
    addComment(task.id, body, draftNoteType);
    setDraftNote('');
    setDraftNoteType('general');
  };

  const getStatusBadgeVariant = (status: TaskStatus) => {
    switch (status) {
      case 'not_started':
        return 'secondary';
      case 'in_progress':
        return 'blue';
      case 'complete':
        return 'default';
      case 'delayed':
        return 'destructive';
      case 'blocked':
        return 'secondary';
    }
  };

  const phases: ConstructionPhase[] = [
    'excavation',
    'foundation',
    'framing',
    'electrical',
    'plumbing',
    'drywall',
    'finishing',
    'roofing',
  ];

  const inputClasses = readOnly
    ? 'w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-600'
    : 'w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex h-full max-h-[95vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl sm:h-auto">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 truncate">{task.name}</h2>
              {readOnly && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Lock className="h-3 w-3" />
                  Read-only
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">ID: {task.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getStatusBadgeVariant(formData.status!)} className="text-xs">
              {formData.status?.replace('_', ' ')}
            </Badge>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 overflow-x-auto border-b border-slate-200 px-4">
          <div className="flex gap-4">
            {[
              { id: 'details', label: 'Details' },
              { id: 'photos', label: `Photos (${task.photoCount})` },
              { id: 'comments', label: `Notes (${taskComments.length})` },
              { id: 'history', label: 'History' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`border-b-2 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content (independent scroll inside the 95vh shell) */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {activeTab === 'details' && (
            <div className="space-y-3">
              {/* Basic Info */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Task Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={inputClasses}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Phase</label>
                  <select
                    value={formData.phase}
                    onChange={(e) =>
                      setFormData({ ...formData, phase: e.target.value as ConstructionPhase })
                    }
                    className={inputClasses}
                    disabled={readOnly}
                  >
                    {phases.map((phase) => (
                      <option key={phase} value={phase} className="capitalize">
                        {phase}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
                    className={inputClasses}
                    disabled={readOnly}
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                    <option value="delayed">Delayed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className={inputClasses}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className={inputClasses}
                    disabled={readOnly}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Zone / Area
                  </label>
                  <select
                    value={formData.zoneId}
                    onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
                    className={inputClasses}
                    disabled={readOnly}
                  >
                    <option value="">No Zone</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Progress: {formData.percentComplete}%
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formData.percentComplete}
                    onChange={(e) =>
                      setFormData({ ...formData, percentComplete: parseInt(e.target.value) })
                    }
                    className="flex-1"
                    disabled={readOnly}
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.percentComplete}
                    onChange={(e) =>
                      setFormData({ ...formData, percentComplete: parseInt(e.target.value) || 0 })
                    }
                    className="w-16 rounded-md border border-slate-200 px-2 py-1.5 text-center text-sm focus:border-emerald-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
                    disabled={readOnly}
                  />
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${formData.percentComplete}%` }}
                  />
                </div>
              </div>

              {/* Dependencies */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Dependencies
                </label>
                <div className="space-y-1.5">
                  {formData.dependencies?.map((depId) => {
                    const depTask = allTasks.find((t) => t.id === depId);
                    return (
                      <div
                        key={depId}
                        className="flex items-center justify-between rounded-md border border-slate-200 px-2.5 py-2"
                      >
                        <span className="text-xs text-slate-700 truncate max-w-[200px]">{depTask?.name || depId}</span>
                        {!readOnly && (
                          <button
                            onClick={() => handleRemoveDependency(depId)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!readOnly && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddDependency(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className={inputClasses}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Add dependency...
                      </option>
                      {allTasks
                        .filter((t) => t.id !== task.id && !formData.dependencies?.includes(t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Internal Notes (task.notes) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    Internal Notes
                  </label>
                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={handleAddNote}>
                      Add Note
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {formData.notes?.map((note, index) => (
                    <div
                      key={index}
                      className="flex items-start justify-between rounded-md bg-slate-50 px-2.5 py-2"
                    >
                      <span className="text-xs text-slate-700">{note}</span>
                      {!readOnly && (
                        <button
                          onClick={() => handleRemoveNote(index)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {(!formData.notes || formData.notes.length === 0) && (
                    <p className="text-xs text-slate-500">No internal notes</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'photos' && (
            <div className="text-center py-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-slate-900">Task Photos</h3>
              <p className="text-xs text-slate-500 mt-1">Photos uploaded for this task will appear here</p>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              {/* Existing notes */}
              <div className="space-y-2">
                {taskComments.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center">
                    <MessageSquare className="mx-auto h-5 w-5 text-slate-400" />
                    <p className="mt-2 text-xs text-slate-500">
                      No notes on this task yet. {allowComment && 'Be the first to leave one.'}
                    </p>
                  </div>
                )}
                {taskComments.map((c) => {
                  const meta = NOTE_TYPE_META[c.noteType ?? 'general'];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={c.id}
                      className={`rounded-md border px-3 py-2.5 ${meta.tone}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          <span className="text-[11px] font-semibold uppercase tracking-wide">
                            {meta.label}
                          </span>
                          {c.userRole && (
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {c.userRole}
                            </Badge>
                          )}
                          {c.status === 'resolved' && (
                            <Badge variant="default" className="text-[10px]">resolved</Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-800">{c.content}</p>
                      <p className="mt-1.5 text-[11px] text-slate-500">— {c.userName}</p>
                    </div>
                  );
                })}
              </div>

              {/* New note form */}
              {allowComment ? (
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-xs font-medium text-slate-700">Leave a note</p>
                  <div className="mb-2 flex gap-1.5">
                    {(Object.keys(NOTE_TYPE_META) as NoteType[]).map((t) => {
                      const meta = NOTE_TYPE_META[t];
                      const active = draftNoteType === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setDraftNoteType(t)}
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                            active ? meta.tone + ' ring-1 ring-offset-1 ring-emerald-400' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    rows={3}
                    placeholder={
                      draftNoteType === 'issue'
                        ? 'Describe the issue you noticed...'
                        : draftNoteType === 'accuracy_check'
                          ? 'What looks inaccurate or needs verification?'
                          : 'Leave a general note...'
                    }
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={handleSubmitComment} disabled={!draftNote.trim()}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Post note
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                  Your account doesn't have permission to leave notes on this project.
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              <div className="rounded-md border border-slate-200 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-900">Task Created</p>
                  <span className="text-xs text-slate-500">
                    {format(new Date(task.startDate), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
              <div className="rounded-md border border-slate-200 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-900">Last Updated</p>
                  <span className="text-xs text-slate-500">
                    {format(new Date(task.lastUpdated), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  {task.updateSource.replace('_', ' ')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
          {readOnly ? (
            <span className="text-xs text-slate-500">
              You have view-only access. Use the Notes tab to flag issues.
            </span>
          ) : canDelete ? (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={handleSave}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
