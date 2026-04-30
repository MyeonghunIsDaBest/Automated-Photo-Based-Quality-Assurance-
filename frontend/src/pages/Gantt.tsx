import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { Filter, Plus, Edit2, Eye, Lock } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Task, TaskStatus } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { getPhaseIcon } from '../store';
import { canEditTasks, canDeleteTasks } from '../lib/permissions';
import TaskModal from '../components/tasks/TaskModal';
import CreateTaskModal from '../components/tasks/CreateTaskModal';
import {
  listTasks,
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
  updateTaskProgress as apiUpdateTaskProgress,
  deleteTask as apiDeleteTask,
  mapTaskRow,
  type TaskRow,
} from '../lib/api/tasks';
import { subscribeToProjectTasks } from '../lib/api/realtime';
import { supabaseConfigured } from '../lib/supabase';

export default function Gantt() {
  const { tasks, zones, project, currentUser } = useAppStore();
  const { updateTaskProgress, addTask, deleteTask } = useFeatureStore();
  const canEdit = canEditTasks(currentUser);
  const canDelete = canDeleteTasks(currentUser);
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // ── Live data sync ─────────────────────────────────────────────────────
  // When Supabase is configured, fetch the canonical task list for the
  // active project on mount + project change, then subscribe to realtime
  // INSERT/UPDATE/DELETE events. Mutations elsewhere (this tab or another)
  // echo back through this subscription, so we never rely on optimistic
  // local state for correctness.
  useEffect(() => {
    if (!supabaseConfigured() || !project?.id) return;
    let cancelled = false;
    const projectId = project.id;

    (async () => {
      try {
        const rows = await listTasks(projectId);
        if (cancelled) return;
        const mapped = rows.map(mapTaskRow);
        useFeatureStore.setState((state) => ({
          tasks: [
            ...state.tasks.filter((t) => t.projectId !== projectId),
            ...mapped,
          ],
        }));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[gantt] failed to load tasks:', e);
      }
    })();

    const unsubscribe = subscribeToProjectTasks(projectId, (payload) => {
      useFeatureStore.setState((state) => {
        if (payload.eventType === 'INSERT') {
          const next = mapTaskRow(payload.new as TaskRow);
          if (state.tasks.some((t) => t.id === next.id)) return state;
          return { tasks: [...state.tasks, next] };
        }
        if (payload.eventType === 'UPDATE') {
          const next = mapTaskRow(payload.new as TaskRow);
          return {
            tasks: state.tasks.map((t) => (t.id === next.id ? next : t)),
          };
        }
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id?: string }).id;
          if (!oldId) return state;
          return { tasks: state.tasks.filter((t) => t.id !== oldId) };
        }
        return state;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [project?.id]);

  // Only show tasks/zones that belong to the active project. Without this,
  // every task created across every project would render on every Gantt.
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const projectZones = zones.filter((zone) => zone.projectId === project.id);

  const filteredTasks = projectTasks.filter(task => {
    if (filterZone && task.zoneId !== filterZone) return false;
    if (filterStatus && task.status !== filterStatus) return false;
    return true;
  });

  const startDate = parseISO(project.startDate);
  const endDate = parseISO(project.endDate);
  const totalDays = differenceInDays(endDate, startDate);
  
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
      case 'complete': return 'bg-emerald-500';
      case 'delayed': return 'bg-red-500';
      case 'blocked': return 'bg-gray-700';
    }
  };

  const getStatusBadgeVariant = (status: TaskStatus) => {
    switch (status) {
      case 'not_started': return 'secondary' as const;
      case 'in_progress': return 'blue' as const;
      case 'complete': return 'default' as const;
      case 'delayed': return 'destructive' as const;
      case 'blocked': return 'secondary' as const;
    }
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (updatedTask: Task) => {
    if (supabaseConfigured()) {
      try {
        // Persist any field changes the modal made (dates, name, status, %)
        // through a single update call. Realtime echoes the new row back.
        await apiUpdateTask(updatedTask.id, {
          name: updatedTask.name,
          phase: updatedTask.phase,
          start_date: updatedTask.startDate,
          end_date: updatedTask.endDate,
          status: updatedTask.status,
          percent_complete: updatedTask.percentComplete,
          zone_id: updatedTask.zoneId ?? null,
          assignee_id: updatedTask.assigneeId ?? null,
          parent_task_id: updatedTask.parentTaskId ?? null,
          dependencies: updatedTask.dependencies,
        });
        // Keep updateTaskProgress() running too so notifications + progress
        // history points are emitted from the local source-of-truth store.
        updateTaskProgress(updatedTask.id, updatedTask.percentComplete, 'manual');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[gantt] save task failed:', e);
        // Last-resort: mirror the change locally so the bar still moves.
        await apiUpdateTaskProgress(updatedTask.id, updatedTask.percentComplete).catch(() => {});
        updateTaskProgress(updatedTask.id, updatedTask.percentComplete, 'manual');
      }
    } else {
      updateTaskProgress(updatedTask.id, updatedTask.percentComplete, 'manual');
    }
    setIsTaskModalOpen(false);
    setSelectedTask(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (supabaseConfigured()) {
      try {
        await apiDeleteTask(taskId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[gantt] delete task failed:', e);
      }
    }
    // Realtime DELETE will remove the row from local state too, but call the
    // local mutator so the UI updates instantly when running offline.
    deleteTask(taskId);
  };

  const handleCreateTask = async (
    newTask: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>,
  ) => {
    if (supabaseConfigured()) {
      try {
        const row = await apiCreateTask({
          project_id: newTask.projectId,
          zone_id: newTask.zoneId ?? null,
          assignee_id: newTask.assigneeId ?? null,
          parent_task_id: newTask.parentTaskId ?? null,
          name: newTask.name,
          phase: newTask.phase,
          start_date: newTask.startDate,
          end_date: newTask.endDate,
          percent_complete: newTask.percentComplete,
          status: newTask.status,
          notes: newTask.notes,
          update_source: 'manual',
          dependencies: newTask.dependencies,
        });
        // Realtime usually echoes the INSERT back in <1s; insert locally too
        // so the new row appears immediately even on lossy connections.
        const mapped = mapTaskRow(row);
        addTask(mapped);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[gantt] create task failed:', e);
      }
    } else {
      const task: Task = {
        ...newTask,
        id: `task_${Date.now()}`,
        photoCount: 0,
        lastUpdated: new Date().toISOString(),
        updateSource: 'manual',
      };
      addTask(task);
    }
    setIsCreateModalOpen(false);
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Project Management</h1>
            <p className="text-slate-500">
              {canEdit ? 'Track and manage project activities' : 'Read-only view — you can leave notes but not modify the schedule.'}
            </p>
          </div>
          {canEdit ? (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Task
            </Button>
          ) : (
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
              <Lock className="h-3.5 w-3.5" />
              Read-only
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Card className="mb-6">
        <CardContent className="p-2">
          <div className="flex gap-1">
            {['Schedule', 'Daily Logs', 'To-Dos', 'Tasks', 'Change Orders', 'Selections', 'Warranties', 'Plans'].map((tab, i) => (
              <button
                key={tab}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  i === 0 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

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
                {projectZones.map(zone => (
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
        <CardHeader>
          <div>
            <CardTitle className="text-lg">Project Schedule</CardTitle>
            <p className="text-sm text-slate-500">Upcoming milestones and deadlines</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {/* Month Headers */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="w-64 flex-shrink-0 border-r border-slate-200 p-3 text-sm font-medium text-slate-700">
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
              {filteredTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                    No tasks yet
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">
                    {projectTasks.length === 0
                      ? `Nothing scheduled for ${project.name}.`
                      : 'No tasks match your filters.'}
                  </h3>
                  <p className="mt-1 max-w-md text-sm text-slate-500">
                    {projectTasks.length === 0
                      ? 'Add a task to start drawing the schedule. Photos uploaded against that task will move the bar forward.'
                      : 'Clear the filters to see the rest of the schedule.'}
                  </p>
                  {canEdit && projectTasks.length === 0 && (
                    <Button className="mt-5" onClick={() => setIsCreateModalOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add your first task
                    </Button>
                  )}
                </div>
              )}
              {filteredTasks.map((task) => {
                const position = getTaskPosition(task);
                const zone = projectZones.find(z => z.id === task.zoneId);
                
                return (
                  <div
                    key={task.id}
                    onClick={() => handleEditTask(task)}
                    className={`group flex cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 ${
                      selectedTask?.id === task.id ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <div className="w-64 flex-shrink-0 border-r border-slate-200 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getPhaseIcon(task.phase)}</span>
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
                          <p className="text-xs text-slate-500">{format(parseISO(task.startDate), 'MMM d, yyyy')}</p>
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
              })}
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
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        zones={projectZones}
        allTasks={projectTasks}
        readOnly={!canEdit}
        canDelete={canDelete}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateTask}
        zones={projectZones}
        allTasks={projectTasks}
        projectId={project.id}
      />
    </div>
  );
}
