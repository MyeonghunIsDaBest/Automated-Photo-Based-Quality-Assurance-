import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import {
  ArrowLeft, CalendarDays,
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
import { useProjectAccessGuard } from '../lib/hooks/useProjectAccessGuard';
import { EditorialPageHeader } from '../components/editorial';

import { OverviewTab }     from './gantt/tabs/OverviewTab';
import { TasksTab }        from './gantt/tabs/TasksTab';
import { ReviewQueueTab }  from './gantt/tabs/ReviewQueueTab';
import { InventoryTab }    from './gantt/tabs/InventoryTab';
import { PlansTab }        from './gantt/tabs/PlansTab';
import { UploadsTab }      from './gantt/tabs/UploadsTab';
import { SiteDiaryTab } from './gantt/tabs/SiteDiaryTab';
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
// Punch List used to be its own tab — it's now folded into Site Diary as a
// 4th sub-view alongside Today / Workers / Calendar.
const TAB_SPECS: TabSpec[] = [
  { id: 'overview',    label: 'Overview',   icon: LayoutDashboard },
  { id: 'tasks',       label: 'Tasks',      icon: ListChecks },
  { id: 'review',      label: 'AI-Analysis', icon: Inbox },
  { id: 'site_diary',  label: 'Site Diary', icon: CalendarDays },
  { id: 'supplier',    label: 'Supplier',   icon: Package },
  { id: 'inventory',   label: 'Inventory',  icon: Layers },
  { id: 'plans',       label: 'Plans',      icon: FileBox },
  { id: 'uploads',     label: 'Uploads',    icon: UploadIcon },
];

type ActiveTab = TabSpec['id'];

export default function Gantt() {
  const { tasks, zones, project, currentUser } = useAppStore();
  const documents = useFeatureStore((s) => s.documents);
  // Defensive: store can briefly hold a placeholder project (mid-hydration,
  // brand-new user before first project create) whose .id is empty. A bare
  // `project.id` access there throws, which crashes the page mid-route-swap
  // and reads as a white page until hard refresh. Coalesce to a stable empty
  // string so memo / hook deps stay primitive.
  const projectId = project?.id ?? '';

  // Field-role access guard — worker / stakeholder / supplier deep-linking
  // into a project they were never invited to gets bounced to /home with a
  // toast. Admins/PMs pass through. Server-side RLS is the hard line; this
  // is the UX wrapper.
  useProjectAccessGuard(project?.id);

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
  // Legacy `?tab=punch_list` resolves to Site Diary's Punch sub-view so old
  // links keep working after the standalone Punch List tab was retired.
  useUrlHydration({
    onApplyExtras: ({ tab, task }) => {
      if (tab === 'punch_list') {
        setActiveTab('site_diary');
      } else if (tab && TAB_SPECS.some((s) => s.id === tab)) {
        setActiveTab(tab as ActiveTab);
      }
      if (task) setInitialOpenTaskId(task);
    },
  });

  // Tasks realtime + initial fetch is mounted at Layout via
  // `useProjectTasksRealtime` so the Dashboard sees teammate updates while
  // the user is on any page, not just Gantt.

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === projectId),
    [tasks, projectId],
  );
  const projectZones = useMemo(
    () => zones.filter((z) => z.projectId === projectId),
    [zones, projectId],
  );

  // Counter badges for the tab strip. The Supplier tab's badge is the sum
  // of "things that need attention" across its four sub-sections (open
  // orders + unpaid invoices + warranties expiring within 30 days). Total
  // deliveries don't add to the badge because most are completed records;
  // they're informational, not action-needed.
  const counts = useMemo(() => {
    const projOrders     = orders?.[projectId]     ?? [];
    const projInvoices   = invoices?.[projectId]   ?? [];
    const projWarranties = warranties?.[projectId] ?? [];
    const ordersOpen     = projOrders.filter((o) => o.status !== 'received' && o.status !== 'cancelled').length;
    const invoicesUnpaid = projInvoices.filter((i) => i.status !== 'paid').length;
    const now           = Date.now();
    const thirtyDays    = now + 30 * 24 * 3600 * 1000;
    const warrantiesSoon = projWarranties.filter((w) => {
      const exp = Date.parse(w.expiryDate);
      return Number.isFinite(exp) && exp <= thirtyDays;
    }).length;

    // The Site Diary badge counts diary entries + open punch items now that
    // the two surfaces share a tab. Either kind of unfinished business is
    // surfaced together.
    const punchOpen = (todos?.[projectId] ?? []).filter((p) => p.status === 'open').length;
    return {
      overview:    undefined as number | undefined,
      site_diary:  (dailyLogs?.[projectId] ?? []).length + punchOpen,
      tasks:       projectTasks.length,
      supplier:    ordersOpen + invoicesUnpaid + warrantiesSoon,
      inventory:   0, // selections list — count when quantity tracking lands
      plans: (documents ?? []).filter(
        (d) => d.projectId === projectId && (d.category === 'blueprint' || d.category === 'permit'),
      ).length,
      uploads: undefined as number | undefined,
    };
  }, [projectTasks, projectId, dailyLogs, todos, orders, invoices, warranties, documents]);


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
    // `punch_list` is a legacy id — the standalone tab is gone; we land on
    // Site Diary's Punch sub-view instead so Overview's "punch open" tile
    // and any old deep-links still resolve.
    if (tabId === 'punch_list') {
      setActiveTab('site_diary');
      return;
    }
    const map: Partial<Record<TabId, ActiveTab>> = {
      overview:   'overview',
      tasks:      'tasks',
      site_diary: 'site_diary',
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

  // Brand-new user or store mid-hydration: there's no active project yet.
  // Render a friendly empty state instead of letting the tabs crash on
  // `project.name` / `project.startDate` etc.
  if (!project || !projectId) {
    return (
      <div className="editorial-root min-h-full bg-[#FAFAF7]">
        <EditorialPageHeader
          eyebrow="Plan · Schedule"
          title="No active project."
          description="Pick a project from the list to see its schedule, tasks, and uploads."
          actions={
            <Link
              to="/projects"
              className="group relative z-10 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              All projects
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      <div className="px-4 py-8 sm:px-8 sm:py-10">

      {/* ─── Tab strip + All projects pill on a single row ─── */}
      {/* Two distinct containers: the tab strip pill on the left (can scroll
          horizontally on narrow screens via min-w-0 + overflow-x-auto) and the
          "All projects" return link on the right, sized to its content. The
          active dark pill behind the focused tab is a single motion.div with
          layoutId — framer-motion FLIPs it between positions on click. */}
      <div className="mb-6 flex items-center gap-3 sm:gap-4">
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
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
                  className={`relative flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="gantt-primary-tab-pill"
                      className="absolute inset-0 rounded-xl bg-slate-900 shadow-sm"
                      transition={{ type: 'spring', damping: 30, stiffness: 360 }}
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{tab.label}</span>
                  {typeof count === 'number' && count > 0 && (
                    <span
                      className={`relative z-10 tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
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
        <Link
          to="/projects"
          aria-label="Back to all projects"
          className="group inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span className="hidden sm:inline">All projects</span>
        </Link>
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
            zones={projectZones}
            currentUser={currentUser}
          />
        )}

        {activeTab === 'site_diary' && (
          <SiteDiaryTab
            project={project}
            currentUser={currentUser}
            canEdit={canEdit}
            canDelete={canDelete}
          />
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