import { useState, useEffect } from 'react';
import { X, Trash2, Save } from 'lucide-react';
import { Task, TaskStatus, ConstructionPhase } from '../../types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (taskId: string) => void;
  zones: { id: string; name: string; colorCode: string }[];
  allTasks: Task[];
}

export default function TaskModal({
  task,
  isOpen,
  onClose,
  onSave,
  onDelete,
  zones,
  allTasks,
}: TaskModalProps) {
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

  if (!isOpen || !task) return null;

  const handleSave = () => {
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
    if (confirm(`Are you sure you want to delete "${task.name}"?`)) {
      onDelete(task.id);
      onClose();
    }
  };

  const handleAddDependency = (taskId: string) => {
    if (!formData.dependencies?.includes(taskId) && taskId !== task.id) {
      setFormData({
        ...formData,
        dependencies: [...(formData.dependencies || []), taskId],
      });
    }
  };

  const handleRemoveDependency = (taskId: string) => {
    setFormData({
      ...formData,
      dependencies: formData.dependencies?.filter((id) => id !== taskId) || [],
    });
  };

  const handleAddNote = () => {
    const note = prompt('Enter note:');
    if (note) {
      setFormData({
        ...formData,
        notes: [...(formData.notes || []), note],
      });
    }
  };

  const handleRemoveNote = (index: number) => {
    setFormData({
      ...formData,
      notes: formData.notes?.filter((_, i) => i !== index) || [],
    });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex-1 overflow-hidden">
            <h2 className="text-base font-semibold text-slate-900 truncate">{task.name}</h2>
            <p className="text-xs text-slate-500">ID: {task.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getStatusBadgeVariant(formData.status!)} className="text-xs">
              {formData.status?.replace('_', ' ')}
            </Badge>
            <button
              onClick={onClose}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 px-4">
          <div className="flex gap-4">
            {[
              { id: 'details', label: 'Details' },
              { id: 'photos', label: `Photos (${task.photoCount})` },
              { id: 'comments', label: 'Comments' },
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

        {/* Content */}
        <div className="max-h-[calc(100vh-280px)] overflow-auto px-4 py-4">
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
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">Phase</label>
                  <select
                    value={formData.phase}
                    onChange={(e) =>
                      setFormData({ ...formData, phase: e.target.value as ConstructionPhase })
                    }
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Zone / Area
                  </label>
                  <select
                    value={formData.zoneId}
                    onChange={(e) => setFormData({ ...formData, zoneId: e.target.value })}
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.percentComplete}
                    onChange={(e) =>
                      setFormData({ ...formData, percentComplete: parseInt(e.target.value) || 0 })
                    }
                    className="w-16 rounded-md border border-slate-200 px-2 py-1.5 text-center text-sm focus:border-emerald-500 focus:outline-none"
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
                        <button
                          onClick={() => handleRemoveDependency(depId)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddDependency(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    Notes
                  </label>
                  <Button variant="outline" size="sm" onClick={handleAddNote}>
                    Add Note
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {formData.notes?.map((note, index) => (
                    <div
                      key={index}
                      className="flex items-start justify-between rounded-md bg-slate-50 px-2.5 py-2"
                    >
                      <span className="text-xs text-slate-700">{note}</span>
                      <button
                        onClick={() => handleRemoveNote(index)}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {(!formData.notes || formData.notes.length === 0) && (
                    <p className="text-xs text-slate-500">No notes added</p>
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
            <div className="text-center py-8">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-slate-900">Comments</h3>
              <p className="text-xs text-slate-500 mt-1">Team discussions will appear here</p>
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
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
