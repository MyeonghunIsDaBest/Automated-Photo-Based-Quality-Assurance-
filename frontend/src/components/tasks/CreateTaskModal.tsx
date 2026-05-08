import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Task, TaskStatus, ConstructionPhase } from '../../types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (task: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => void;
  zones: { id: string; name: string; colorCode: string }[];
  allTasks: Task[];
  projectId: string;
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  onCreate,
  zones,
  allTasks,
  projectId,
}: CreateTaskModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    phase: 'excavation' as ConstructionPhase,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    percentComplete: 0,
    status: 'not_started' as TaskStatus,
    zoneId: '',
    dependencies: [] as string[],
    notes: [] as string[],
  });

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!formData.name.trim()) {
      alert('Please enter a task name');
      return;
    }

    onCreate({
      ...formData,
      projectId,
      durationDays: Math.ceil(
        (new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      ),
    });
    onClose();
    setFormData({
      name: '',
      phase: 'excavation',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      percentComplete: 0,
      status: 'not_started',
      zoneId: '',
      dependencies: [],
      notes: [],
    });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="flex h-full max-h-[95dvh] w-full max-w-lg flex-col rounded-lg bg-white shadow-xl sm:h-auto">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Create New Task</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content (scrolls on phones) */}
        <div className="editorial-scrollbox flex-1 px-4 py-4">
          <div className="space-y-3">
            {/* Task Name */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Task Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., North Wing Electrical"
                className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                autoFocus
              />
            </div>

            {/* Phase & Status */}
            <div className="grid gap-3 sm:grid-cols-2">
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
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as TaskStatus })
                  }
                  className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="complete">Complete</option>
                  <option value="delayed">Delayed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Start Date *
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
                  End Date *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  min={formData.startDate}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Zone */}
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

            {/* Dependencies */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Dependencies
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    setFormData({
                      ...formData,
                      dependencies: [...formData.dependencies, e.target.value],
                    });
                  }
                }}
                className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                defaultValue=""
              >
                <option value="" disabled>
                  Add dependency...
                </option>
                {allTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
              {formData.dependencies.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {formData.dependencies.map((depId) => {
                    const depTask = allTasks.find((t) => t.id === depId);
                    return (
                      <Badge key={depId} variant="secondary" className="text-xs">
                        {depTask?.name.split(' ').slice(0, 3).join(' ') || depId}
                        <button
                          onClick={() =>
                            setFormData({
                              ...formData,
                              dependencies: formData.dependencies.filter((id) => id !== depId),
                            })
                          }
                          className="ml-1.5 text-slate-500 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Duration Preview */}
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Duration</span>
                <span className="text-sm font-semibold text-emerald-600">
                  {Math.ceil(
                    (new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )}{' '}
                  days
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Task
          </Button>
        </div>
      </div>
    </div>
  );
}
