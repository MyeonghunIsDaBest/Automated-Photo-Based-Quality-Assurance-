import { useState } from 'react';
import { Filter, Plus, Edit2, Eye, ListPlus } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import type { Task, TaskStatus, Zone, User, Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { getPhaseIcon } from '../../../store';
import TaskModal from '../../../components/tasks/TaskModal';
import CreateTaskModal from '../../../components/tasks/CreateTaskModal';
import BulkAddTasksModal from '../../../components/tasks/BulkAddTasksModal';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';

interface ScheduleTabProps {
  project: Project;
  tasks: Task[];          // already scoped to this project
  zones: Zone[];          // already scoped to this project
  currentUser: User | null;
  canEdit: boolean;
  canDelete: boolean;
  onCreateTask: (newTask: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
  onSaveTask:   (task: Task) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
}

// Lifted from the original Gantt.tsx with no behaviour change. Owns the
// zone/status filters + the chart rows + both task modals. Permissions
// and realtime mutations stay in the parent.
export function ScheduleTab({
  project, tasks, zones, currentUser, canEdit, canDelete,
  onCreateTask, onSaveTask, onDeleteTask,
}: ScheduleTabProps) {
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);

  const filteredTasks = tasks.filter((task) => {
    if (filterZone && task.zoneId !== filterZone) return false;
    if (filterStatus && task.status !== filterStatus) return false;
    return true;
  });

  const startDate = parseISO(project.startDate);
  const endDate = parseISO(project.endDate);
  const totalDays = Math.max(1, differenceInDays(endDate, startDate));

  const months: { name: string; start: number; width: number }[] = [];
  let currentDate = new Date(startDate);
  let dayOffset = 0;

  while (currentDate <= endDate) {
    const monthStart = new Date(currentDate);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const clampedEnd = monthEnd > endDate ? endDate : monthEnd;
    const daysInMonth = differenceInDays(clampedEnd, monthStart) + 1;

    months.push({
      name: format(monthStart, 'MMM yyyy'),
      start: dayOffset,
      width: (daysInMonth / totalDays) * 100,
    });

    currentDate = new Date(monthEnd);
    currentDate.setDate(currentDate.getDate() + 1);
    dayOffset += daysInMonth;
  }

  const getTaskPosition = (task: Task) => {
    const taskStart = parseISO(task.startDate);
    const taskEnd = parseISO(task.endDate);
    const startOffset = differenceInDays(taskStart, startDate);
    const duration = differenceInDays(taskEnd, taskStart) + 1;
    return {
      left: (startOffset / totalDays) * 100,
      width: (duration / totalDays) * 100,
    };
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'not_started': return 'bg-slate-400';
      case 'in_progress': return 'bg-blue-500';
      case 'complete':    return 'bg-emerald-500';
      case 'delayed':     return 'bg-red-500';
      case 'blocked':     return 'bg-gray-700';
    }
  };

  const getStatusBadgeVariant = (status: TaskStatus) => {
    switch (status) {
      case 'not_started': return 'secondary' as const;
      case 'in_progress': return 'blue' as const;
      case 'complete':    return 'default' as const;
      case 'delayed':     return 'destructive' as const;
      case 'blocked':     return 'secondary' as const;
    }
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  return (
    <>
      <TabHeader
        eyebrow="Workspace · Schedule"
        title={project.name}
        description={
          canEdit
            ? 'Track and manage every task on this project. Photos uploaded against a task move its bar forward automatically.'
            : 'Read-only view — you can leave notes but not modify the schedule.'
        }
        action={
          canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setIsBulkAddOpen(true)}>
                <ListPlus className="mr-2 h-4 w-4" />
                Bulk add
              </Button>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Task
              </Button>
            </div>
          )
        }
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">All Zones</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="delayed">Delayed</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gantt Chart */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Outer wrapper scrolls horizontally on phones — the chart needs at  */}
          {/* least ~720px to be readable, so we let the user pan on mobile      */}
          {/* instead of cramping or squishing the bars.                         */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <div className="min-w-[720px]">
            {/* Month Headers */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="w-48 flex-shrink-0 border-r border-slate-200 p-3 text-sm font-medium text-slate-700 sm:w-64">
                Task Name
              </div>
              <div className="flex-1">
                <div className="flex">
                  {months.map((month) => (
                    <div
                      key={month.name}
                      className="border-r border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
                      style={{ width: `${month.width}%` }}
                    >
                      {month.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Task Rows */}
            <div className="max-h-[500px] overflow-auto">
              {filteredTasks.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title={
                      tasks.length === 0
                        ? `Nothing scheduled for ${project.name}.`
                        : 'No tasks match your filters.'
                    }
                    description={
                      tasks.length === 0
                        ? 'Add a task to start drawing the schedule. Photos uploaded against that task will move the bar forward.'
                        : 'Clear the filters to see the rest of the schedule.'
                    }
                    action={
                      canEdit && tasks.length === 0 ? (
                        <Button onClick={() => setIsCreateModalOpen(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add your first task
                        </Button>
                      ) : null
                    }
                  />
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const position = getTaskPosition(task);
                  const zone = zones.find((z) => z.id === task.zoneId);

                  return (
                    <div
                      key={task.id}
                      onClick={() => handleEditTask(task)}
                      className={`group flex cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 ${
                        selectedTask?.id === task.id ? 'bg-emerald-50' : ''
                      }`}
                    >
                      <div className="w-48 flex-shrink-0 border-r border-slate-200 p-3 sm:w-64">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getPhaseIcon(task.phase)}</span>
                          <div className="flex-1 overflow-hidden">
                            <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
                            <p className="text-xs text-slate-500">
                              {format(parseISO(task.startDate), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="relative flex-1 py-4">
                        <div className="absolute inset-0 flex">
                          {months.map((month) => (
                            <div
                              key={month.name}
                              className="border-r border-slate-100"
                              style={{ width: `${month.width}%` }}
                            />
                          ))}
                        </div>

                        <div
                          className="gantt-task-bar absolute top-1/2 h-8 -translate-y-1/2 rounded-md shadow-sm"
                          style={{
                            left: `${position.left}%`,
                            width: `${position.width}%`,
                            backgroundColor: zone?.colorCode || '#64748b',
                          }}
                        >
                          <div
                            className={`absolute inset-y-0 left-0 rounded-md ${getStatusColor(task.status)}`}
                            style={{ width: `${task.percentComplete}%`, opacity: 0.8 }}
                          />
                          <div className="absolute inset-0 flex items-center px-2">
                            <span className="truncate text-xs font-medium text-white drop-shadow">
                              {task.percentComplete}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pr-4 opacity-0 transition-opacity group-hover:opacity-100">
                        <Badge variant={getStatusBadgeVariant(task.status)}>
                          {task.status.replace('_', ' ')}
                        </Badge>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTask(task);
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                          title={canEdit ? 'Edit task' : 'View task & leave a note'}
                        >
                          {canEdit ? <Edit2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-500">Status:</span>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-slate-400" />
              <span>Not Started</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span>Complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span>Delayed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Edit Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={async (t) => {
          await onSaveTask(t);
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onDelete={async (id) => {
          await onDeleteTask(id);
        }}
        zones={zones}
        allTasks={tasks}
        readOnly={!canEdit}
        canDelete={canDelete}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={async (input) => {
          await onCreateTask(input);
          setIsCreateModalOpen(false);
        }}
        zones={zones}
        allTasks={tasks}
        projectId={project.id}
      />

      {/* Bulk Add Modal — same shared mutation path as the single-task form. */}
      <BulkAddTasksModal
        isOpen={isBulkAddOpen}
        onClose={() => setIsBulkAddOpen(false)}
        projectId={project.id}
        defaultStart={project.startDate}
        defaultEnd={project.endDate}
      />

      {/* currentUser is intentionally accepted for future read-state UI; */}
      {/* swallow unused-var lint by rendering nothing with it. */}
      {currentUser ? null : null}
    </>
  );
}
