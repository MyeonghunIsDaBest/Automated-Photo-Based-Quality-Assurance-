import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import {
  ArrowLeft, CalendarDays, CheckSquare,
  FileBox, Inbox, Layers, LayoutDashboard, ListChecks, Package,
  Upload as UploadIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Task } from '../types';
import { canEditTasks, canDeleteTasks, canUploadPhotos } from '../lib/permissions';
import {
  createTaskShared,
  saveTaskShared,
  deleteTaskShared,
} from '../lib/api/taskMutations';

import { useGanttSideStore } from './gantt/store';
import type { TabId } from './gantt/types';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { useUrlHydration } from '../lib/hooks/useUrlHydration';
import { EditorialPageHeader } from '../components/editorial';

import { OverviewTab }     from './gantt/tabs/OverviewTab';
import { TasksTab }        from './gantt/tabs/TasksTab';
import { ReviewQueueTab }  from './gantt/tabs/ReviewQueueTab';
import { PunchListTab }    from './gantt/tabs/PunchListTab';
import { InventoryTab }    from './gantt/tabs/InventoryTab';
import { PlansTab }        from './gantt/tabs/PlansTab';
import { UploadsTab }      from './gantt/tabs/UploadsTab';
import { SiteDiaryTab }    from './gantt/tabs/SiteDiaryTab';
// SupplierTab merges OrdersTab + DeliveriesTab + InvoicesTab + WarrantiesTab
// under one editorial header so the procurement surface area collapses from
// four nav entries to one. Each child tab is reused as-is via a `hideHeader`
// prop so we don't duplicate logic / drawers / wizards.
import { SupplierTab }     from './gantt/tabs/SupplierTab';


interface TabSpec {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

// Overview lands first so clicking into a project always opens the briefing.
// 'supplier' merges Orders + Deliveries + Invoices + Warranties into one
// procurement-side tab; 'inventory' is the rebrand of the old Selections.
const TAB_SPECS: TabSpec[] = [
  { id: 'overview',    label: 'Overview',   icon: LayoutDashboard },
  { id: 'tasks',       label: 'Tasks',      icon: ListChecks },
  { id: 'review',      label: 'Review',     icon: Inbox },
  { id: 'site_diary',  label: 'Site Diary', icon: CalendarDays },
  { id: 'punch_list',  label: 'Punch List', icon: CheckSquare },
  { id: 'supplier',    label: 'Supplier',   icon: Package },
  { id: 'inventory',   label: 'Inventory',  icon: Layers },
  { id: 'plans',       label: 'Plans',      icon: FileBox },
  { id: 'uploads',     label: 'Uploads',    icon: UploadIcon },
];

type ActiveTab = TabSpec['id'];

export default function Gantt() {
  const { tasks, zones, project, currentUser } = useAppStore();
  const documents = useFeatureStore((s) => s.documents);

  // Subscribe to side-store slices so badges update live. Deliveries don't
  // contribute to the Supplier badge (informational, not action-needed) so
  // we skip subscribing here — SupplierTab subscribes for its own pill.
  const dailyLogs    = useGanttSideStore((s) => s.diaryEntries);
  const todos        = useGanttSideStore((s) => s.punchItems);
  const orders       = useGanttSideStore((s) => s.orders);
  const warranties   = useGanttSideStore((s) => s.warranties);
  const invoices     = useGanttSideStore((s) => s.invoices);


  const canEdit   = canEditTasks(currentUser);
  const canDelete = canDeleteTasks(currentUser);
  const canUpload = canUploadPhotos(currentUser);

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [initialOpenTaskId, setInitialOpenTaskId] = useState<string | null>(null);

  // Connectedness Pass 2: read `?project=&tab=&task=` and hydrate page state.
  // The hook handles `?project=` itself; the callback applies the rest.
  useUrlHydration({
    onApplyExtras: ({ tab, task }) => {
      if (tab && TAB_SPECS.some((s) => s.id === tab)) {
        setActiveTab(tab as ActiveTab);
      }
      if (task) setInitialOpenTaskId(task);
    },
  });

  // Tasks realtime + initial fetch is mounted at Layout via
  // `useProjectTasksRealtime` so the Dashboard sees teammate updates while
  // the user is on any page, not just Gantt.

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const projectZones = useMemo(
    () => zones.filter((z) => z.projectId === project.id),
    [zones, project.id],
  );

  // Counter badges for the tab strip. The Supplier tab's badge is the sum
  // of "things that need attention" across its four sub-sections (open
  // orders + unpaid invoices + warranties expiring within 30 days). Total
  // deliveries don't add to the badge because most are completed records;
  // they're informational, not action-needed.
  const counts = useMemo(() => {
    const projOrders     = orders?.[project.id]     ?? [];
    const projInvoices   = invoices?.[project.id]   ?? [];
    const projWarranties = warranties?.[project.id] ?? [];
    const ordersOpen     = projOrders.filter((o) => o.status !== 'received' && o.status !== 'cancelled').length;
    const invoicesUnpaid = projInvoices.filter((i) => i.status !== 'paid').length;
    const now           = Date.now();
    const thirtyDays    = now + 30 * 24 * 3600 * 1000;
    const warrantiesSoon = projWarranties.filter((w) => {
      const exp = Date.parse(w.expiryDate);
      return Number.isFinite(exp) && exp <= thirtyDays;
    }).length;

    return {
      overview:    undefined as number | undefined,
      site_diary:  (dailyLogs?.[project.id] ?? []).length,
      punch_list:  (todos?.[project.id]     ?? []).filter((p) => p.status === 'open').length,
      tasks:       projectTasks.length,
      supplier:    ordersOpen + invoicesUnpaid + warrantiesSoon,
      inventory:   0, // selections list — count when quantity tracking lands
      plans: (documents ?? []).filter(
        (d) => d.projectId === project.id && (d.category === 'blueprint' || d.category === 'permit'),
      ).length,
      uploads: undefined as number | undefined,
    };
  }, [projectTasks, project.id, dailyLogs, todos, orders, invoices, warranties, documents]);


  // ── Task mutation handlers ────────────────────────────────────────────
  const handleSaveTask   = (updated: Task) => saveTaskShared(updated);
  const handleDeleteTask = (taskId: string) => deleteTaskShared(taskId);
  const handleCreateTask = (input: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) =>
    createTaskShared(input).then(() => undefined);

  // Overview deep-links into other tabs. Orders / Deliveries / Invoices /
  // Warranties all resolve to the merged Supplier tab — SupplierTab opens
  // on its 'orders' sub-section by default; we'd pass `initialSection`
  // here once SupplierTab supports honouring it from props.
  const handleJumpToTab = (tabId: TabId) => {
    const map: Partial<Record<TabId, ActiveTab>> = {
      overview:   'overview',
      tasks:      'tasks',
      site_diary: 'site_diary',
      punch_list: 'punch_list',
      supplier:   'supplier',
      orders:     'supplier',
      deliveries: 'supplier',
      invoices:   'supplier',
      warranties: 'supplier',
      inventory:  'inventory',
      plans:      'plans',
      files:      'plans',     // standalone Files page consumed from /files
      uploads:    'uploads',
    };
    const next = map[tabId];
    if (next) setActiveTab(next);
  };

  return (
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      <EditorialPageHeader
        eyebrow="Plan · Schedule"
        title="The schedule,"
        accent="moving"
        description="Tasks, milestones, supplier orders, inventory, plans, uploads, and the punch list — all keyed to the active project."
        actions={
          <Link
            to="/projects"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            All projects
          </Link>
        }
      />

      <div className="px-4 py-8 sm:px-8 sm:py-10">

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
            initialOpenTaskId={initialOpenTaskId}
            onDrawerClose={() => setInitialOpenTaskId(null)}
          />
        )}

        {activeTab === 'review' && (
          <ReviewQueueTab
            project={project}
            tasks={projectTasks}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'site_diary' && (
          <SiteDiaryTab project={project} currentUser={currentUser} canEdit={canEdit} />
        )}

        {activeTab === 'punch_list' && (
          <PunchListTab project={project} canEdit={canEdit} canDelete={canDelete} />
        )}

        {activeTab === 'supplier' && (
          <SupplierTab project={project} canEdit={canEdit} canDelete={canDelete} />
        )}

        {activeTab === 'inventory' && (
          <InventoryTab
            project={project}
            zones={projectZones}
            canEdit={canEdit}
            onJumpToOrders={() => setActiveTab('supplier')}
          />
        )}

        {activeTab === 'plans' && <PlansTab project={project} canEdit={canEdit} />}

        {activeTab === 'uploads' && (
          <UploadsTab project={project} currentUser={currentUser} canUpload={canUpload} />
        )}
      </ErrorBoundary>
      </div>
    </div>
  );
}