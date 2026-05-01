import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import {
  Calendar, CalendarDays, CheckSquare, ClipboardEdit,
  FileBox, ListChecks, Palette, ShieldCheck, Upload as UploadIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Task } from '../types';
import { canEditTasks, canDeleteTasks, canUploadPhotos } from '../lib/permissions';
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

import { useGanttSideStore } from './gantt/store';
import type { TabId } from './gantt/types';

import { ScheduleTab }     from './gantt/tabs/ScheduleTab';
import { TasksTab }        from './gantt/tabs/TasksTab';
import { DailyLogsTab }    from './gantt/tabs/DailyLogsTab';
import { TodosTab }        from './gantt/tabs/TodosTab';
import { ChangeOrdersTab } from './gantt/tabs/ChangeOrdersTab';
import { SelectionsTab }   from './gantt/tabs/SelectionsTab';
import { WarrantiesTab }   from './gantt/tabs/WarrantiesTab';
import { PlansTab }        from './gantt/tabs/PlansTab';
import { UploadsTab }      from './gantt/tabs/UploadsTab';

interface TabSpec {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TAB_SPECS: TabSpec[] = [
  { id: 'schedule',      label: 'Schedule',      icon: Calendar },
  { id: 'daily_logs',    label: 'Daily Logs',    icon: CalendarDays },
  { id: 'todos',         label: 'To-Dos',        icon: CheckSquare },
  { id: 'tasks',         label: 'Tasks',         icon: ListChecks },
  { id: 'change_orders', label: 'Change Orders', icon: ClipboardEdit },
  { id: 'selections',    label: 'Selections',    icon: Palette },
  { id: 'warranties',    label: 'Warranties',    icon: ShieldCheck },
  { id: 'plans',         label: 'Plans',         icon: FileBox },
  { id: 'uploads',       label: 'Uploads',       icon: UploadIcon },
];

export default function Gantt() {
  const { tasks, zones, project, currentUser } = useAppStore();
  const { updateTaskProgress, addTask, deleteTask } = useFeatureStore();
  const documents = useFeatureStore((s) => s.documents);
  const sideStore = useGanttSideStore.getState; // for counter badges (read once per render)

  const canEdit   = canEditTasks(currentUser);
  const canDelete = canDeleteTasks(currentUser);
  const canUpload = canUploadPhotos(currentUser);

  const [activeTab, setActiveTab] = useState<TabId>('schedule');

  // ── Realtime task sync ─────────────────────────────────────────────────
  // Subscription lives in the parent so it persists when the user clicks
  // through tabs — Schedule and Tasks tabs both consume the same slice.
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

  // Project-scoped slices (memoised so tab components don't re-derive them).
  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const projectZones = useMemo(
    () => zones.filter((z) => z.projectId === project.id),
    [zones, project.id],
  );

  // Counter badges for the tab strip. Reads sub-store snapshots once per
  // render — cheap because the badges live next to the tab labels.
  const counts = useMemo(() => {
    const side = sideStore();
    return {
      schedule:      projectTasks.length,
      daily_logs:    (side.dailyLogs[project.id]    ?? []).length,
      todos:         (side.todos[project.id]        ?? []).filter((t) => !t.done).length,
      tasks:         projectTasks.length,
      change_orders: (side.changeOrders[project.id] ?? []).length,
      selections:    (side.selections[project.id]   ?? []).length,
      warranties:    (side.warranties[project.id]   ?? []).length,
      plans: documents.filter(
        (d) => d.projectId === project.id && (d.category === 'blueprint' || d.category === 'permit'),
      ).length,
      uploads: undefined as number | undefined,
    };
  }, [projectTasks, documents, project.id, sideStore]);

  // Subscribe to side-store changes so badges update live.
  useGanttSideStore();

  // ── Task mutation handlers (shared by Schedule + Tasks tabs) ───────────
  const handleSaveTask = async (updatedTask: Task) => {
    if (supabaseConfigured()) {
      try {
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
        updateTaskProgress(updatedTask.id, updatedTask.percentComplete, 'manual');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[gantt] save task failed:', e);
        await apiUpdateTaskProgress(updatedTask.id, updatedTask.percentComplete).catch(() => {});
        updateTaskProgress(updatedTask.id, updatedTask.percentComplete, 'manual');
      }
    } else {
      updateTaskProgress(updatedTask.id, updatedTask.percentComplete, 'manual');
    }
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
        addTask(mapTaskRow(row));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[gantt] create task failed:', e);
      }
    } else {
      addTask({
        ...newTask,
        id: `task_${Date.now()}`,
        photoCount: 0,
        lastUpdated: new Date().toISOString(),
        updateSource: 'manual',
      });
    }
  };

  return (
    <div className="p-6">
      {/* ─── Tab strip ─── */}
      <div className="mb-6 -mx-6 overflow-x-auto px-6 pb-1">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {TAB_SPECS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const count = counts[tab.id as keyof typeof counts];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {typeof count === 'number' && count > 0 && (
                  <span
                    className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Active tab ─── */}
      {activeTab === 'schedule' && (
        <ScheduleTab
          project={project}
          tasks={projectTasks}
          zones={projectZones}
          currentUser={currentUser}
          canEdit={canEdit}
          canDelete={canDelete}
          onCreateTask={handleCreateTask}
          onSaveTask={handleSaveTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {activeTab === 'tasks' && (
        <TasksTab
          project={project}
          tasks={projectTasks}
          zones={projectZones}
          currentUser={currentUser}
          canEdit={canEdit}
          canDelete={canDelete}
          onCreateTask={handleCreateTask}
          onSaveTask={handleSaveTask}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {activeTab === 'daily_logs' && (
        <DailyLogsTab project={project} currentUser={currentUser} canEdit={canEdit} />
      )}

      {activeTab === 'todos' && <TodosTab project={project} canEdit={canEdit} />}

      {activeTab === 'change_orders' && (
        <ChangeOrdersTab project={project} canEdit={canEdit} />
      )}

      {activeTab === 'selections' && (
        <SelectionsTab project={project} zones={projectZones} canEdit={canEdit} />
      )}

      {activeTab === 'warranties' && <WarrantiesTab project={project} canEdit={canEdit} />}

      {activeTab === 'plans' && <PlansTab project={project} canEdit={canEdit} />}

      {activeTab === 'uploads' && (
        <UploadsTab project={project} currentUser={currentUser} canUpload={canUpload} />
      )}
    </div>
  );
}
