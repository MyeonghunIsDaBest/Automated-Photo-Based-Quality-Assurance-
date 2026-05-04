import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import {
  CalendarDays, CheckSquare, ClipboardEdit,
  FileBox, LayoutDashboard, ListChecks, Palette, ShieldCheck,
  Upload as UploadIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Task } from '../types';
import { canEditTasks, canDeleteTasks, canUploadPhotos } from '../lib/permissions';
import {
  listTasks,
  mapTaskRow,
  type TaskRow,
} from '../lib/api/tasks';
import {
  createTaskShared,
  saveTaskShared,
  deleteTaskShared,
} from '../lib/api/taskMutations';
import { subscribeToProjectTasks } from '../lib/api/realtime';
import { supabaseConfigured } from '../lib/supabase';

import { useGanttSideStore } from './gantt/store';
import type { TabId } from './gantt/types';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

import { OverviewTab }     from './gantt/tabs/OverviewTab';
import { TasksTab }        from './gantt/tabs/TasksTab';
import { DailyLogsTab }    from './gantt/tabs/DailyLogsTab';
import { TodosTab }        from './gantt/tabs/TodosTab';
import { ChangeOrdersTab } from './gantt/tabs/ChangeOrdersTab';
import { SelectionsTab }   from './gantt/tabs/SelectionsTab';
import { WarrantiesTab }   from './gantt/tabs/WarrantiesTab';
import { PlansTab }        from './gantt/tabs/PlansTab';
import { UploadsTab }      from './gantt/tabs/UploadsTab';

interface TabSpec {
  id: TabId | 'daily_logs_legacy' | 'change_orders_legacy' | 'selections_legacy';
  label: string;
  icon: LucideIcon;
}

// Overview lands first so clicking into a project always opens the briefing.
// The merged Overview now folds in the old Schedule view's Trend / Timeline /
// Calendar surfaces, so the standalone "Schedule (old)" tab is gone.
// Remaining legacy tabs (Daily Logs, Change Orders, Selections) stay visible
// during the rework so testing doesn't lose access to the old surfaces.
const TAB_SPECS: TabSpec[] = [
  { id: 'overview',           label: 'Overview',      icon: LayoutDashboard },
  { id: 'tasks',              label: 'Tasks',         icon: ListChecks },
  { id: 'daily_logs_legacy',  label: 'Daily Logs',    icon: CalendarDays },
  { id: 'punch_list',         label: 'To-Dos',        icon: CheckSquare },
  { id: 'change_orders_legacy', label: 'Change Orders', icon: ClipboardEdit },
  { id: 'selections_legacy',  label: 'Selections',    icon: Palette },
  { id: 'warranties',         label: 'Warranties',    icon: ShieldCheck },
  { id: 'plans',              label: 'Plans',         icon: FileBox },
  { id: 'uploads',            label: 'Uploads',       icon: UploadIcon },
];

type ActiveTab = TabSpec['id'];

export default function Gantt() {
  const { tasks, zones, project, currentUser } = useAppStore();
  const documents = useFeatureStore((s) => s.documents);

  // Subscribe to side-store slices so badges update live.
  const dailyLogs    = useGanttSideStore((s) => s.diaryEntries);    // legacy badge: count diary entries
  const todos        = useGanttSideStore((s) => s.punchItems);
  const orders       = useGanttSideStore((s) => s.orders);
  const warranties   = useGanttSideStore((s) => s.warranties);

  const canEdit   = canEditTasks(currentUser);
  const canDelete = canDeleteTasks(currentUser);
  const canUpload = canUploadPhotos(currentUser);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // ── Realtime task sync ─────────────────────────────────────────────────
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

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const projectZones = useMemo(
    () => zones.filter((z) => z.projectId === project.id),
    [zones, project.id],
  );

  // Counter badges for the tab strip.
  const counts = useMemo(() => ({
    overview:               undefined as number | undefined,
    daily_logs_legacy:      (dailyLogs?.[project.id]   ?? []).length,
    punch_list:             (todos?.[project.id]       ?? []).filter((p) => p.status === 'open').length,
    tasks:                  projectTasks.length,
    change_orders_legacy:   (orders?.[project.id]      ?? []).length,
    selections_legacy:      0, // legacy tab kept for view; selections folded into orders
    warranties:             (warranties?.[project.id]  ?? []).length,
    plans: (documents ?? []).filter(
      (d) => d.projectId === project.id && (d.category === 'blueprint' || d.category === 'permit'),
    ).length,
    uploads: undefined as number | undefined,
  }), [projectTasks, project.id, dailyLogs, todos, orders, warranties, documents]);

  // ── Task mutation handlers ────────────────────────────────────────────
  const handleSaveTask   = (updated: Task) => saveTaskShared(updated);
  const handleDeleteTask = (taskId: string) => deleteTaskShared(taskId);
  const handleCreateTask = (input: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) =>
    createTaskShared(input).then(() => undefined);

  // Overview deep-links into other tabs.
  const handleJumpToTab = (tabId: TabId) => {
    // Map new TabIds onto the legacy ones still wired up below.
    const map: Partial<Record<TabId, ActiveTab>> = {
      overview:    'overview',
      tasks:       'tasks',
      site_diary:  'daily_logs_legacy',     // until Site Diary lands
      punch_list:  'punch_list',
      orders:      'change_orders_legacy',  // until Orders lands
      deliveries:  'change_orders_legacy',
      invoices:    'change_orders_legacy',
      warranties:  'warranties',
      plans:       'plans',
      files:       'plans',                 // Files lives in the project Files page
      messages:    'uploads',               // until Messages tab is wired here
      uploads:     'uploads',
    };
    const next = map[tabId];
    if (next) setActiveTab(next);
  };

  return (
    <div className="p-4 sm:p-6">
      {/* ─── Tab strip ─── */}
      <div className="mb-6 -mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
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
      <ErrorBoundary label={TAB_SPECS.find((t) => t.id === activeTab)?.label ?? activeTab}>
        {activeTab === 'overview' && (
          <OverviewTab
            project={project}
            tasks={projectTasks}
            zones={projectZones}
            currentUser={currentUser}
            canEdit={canEdit}
            canDelete={canDelete}
            onCreateTask={handleCreateTask}
            onSaveTask={handleSaveTask}
            onDeleteTask={handleDeleteTask}
            onJumpToTab={handleJumpToTab}
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

        {activeTab === 'daily_logs_legacy' && (
          <DailyLogsTab project={project} currentUser={currentUser} canEdit={canEdit} />
        )}

        {activeTab === 'punch_list' && <TodosTab project={project} canEdit={canEdit} />}

        {activeTab === 'change_orders_legacy' && (
          <ChangeOrdersTab project={project} canEdit={canEdit} />
        )}

        {activeTab === 'selections_legacy' && (
          <SelectionsTab project={project} zones={projectZones} canEdit={canEdit} />
        )}

        {activeTab === 'warranties' && <WarrantiesTab project={project} canEdit={canEdit} />}

        {activeTab === 'plans' && <PlansTab project={project} canEdit={canEdit} />}

        {activeTab === 'uploads' && (
          <UploadsTab project={project} currentUser={currentUser} canUpload={canUpload} />
        )}
      </ErrorBoundary>
    </div>
  );
}