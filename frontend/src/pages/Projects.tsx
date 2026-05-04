import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Calendar,
  FolderOpen,
  Plus,
  ScrollText,
} from 'lucide-react';
import { useAppStore } from '../store';
import { canCreateProjects, canEditTasks } from '../lib/permissions';
import { GanttChart } from '../components/ui/GanttChart';
import { useProjectsListStore } from './projects/store';
import { ProjectsListTab } from './projects/components/ProjectsListTab';
import { ActivityTab } from './projects/components/ActivityTab';
import { DocumentsTab } from './projects/components/DocumentsTab';
import { LogsTab } from './projects/components/LogsTab';
import { ProjectSelector } from './projects/components/ProjectSelector';
import { NewProjectModal } from './projects/components/NewProjectModal';
import CreateTaskModal from '../components/tasks/CreateTaskModal';
import BulkAddTasksModal from '../components/tasks/BulkAddTasksModal';
import { createTaskShared } from '../lib/api/taskMutations';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

type TabKey = 'list' | 'timeline' | 'activity' | 'documents' | 'logs';

const SCOPED_TABS: TabKey[] = ['timeline', 'activity', 'documents', 'logs'];

const TABS: { key: TabKey; label: string; Icon: typeof BarChart3 }[] = [
  { key: 'list',      label: 'Projects',  Icon: BarChart3   },
  { key: 'timeline',  label: 'Timeline',  Icon: Calendar    },
  { key: 'activity',  label: 'Activity',  Icon: Activity    },
  { key: 'documents', label: 'Documents', Icon: FolderOpen  },
  { key: 'logs',      label: 'Logs',      Icon: ScrollText  },
];

const FONT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
  .projects-root { font-family: 'DM Sans', system-ui, sans-serif; }
  .projects-root .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
  .projects-root .num     { font-family: 'Fraunces', Georgia, serif; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
  .projects-root .grid-bg {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
  }
`;

export default function Projects() {
  const { project, tasks, currentUser } = useAppStore();
  const projects = useProjectsListStore((s) => s.projects);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);
  const navigate = useNavigate();
  const canCreate = canCreateProjects(currentUser);
  const [activeTab, setActiveTab] = useState<TabKey>('list');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  const canAddTask = canEditTasks(currentUser);

  // Click on a project row → set it as the active project, then navigate to
  // the Gantt overview. The Gantt page now hosts edit-project, files, and
  // messages so the modal-based detail view from this page is retired.
  const handleOpenProject = (id: string) => {
    setActiveProject(id);
    navigate('/gantt');
  };

  // Project the Timeline tab is currently scoped to. Falls back to the
  // active project when the user hasn't manually picked one.
  const timelineProjectId = selectedProjectId ?? project.id;

  // Re-derive each project's task counts and progress from the live tasks
  // store. The static fields on the Project record become stale the moment
  // anyone creates or edits a task, so always trust the tasks store.
  const projectsWithProgress = useMemo(() => {
    return projects.map((p) => {
      const owned = tasks.filter((t) => t.projectId === p.id);
      if (owned.length === 0) return p;
      const tasksComplete = owned.filter((t) => t.status === 'complete').length;
      const tasksPending = owned.filter((t) => t.status === 'in_progress').length;
      const tasksOutstanding = owned.length - tasksComplete - tasksPending;
      const percentComplete = Math.round(
        owned.reduce((sum, t) => sum + t.percentComplete, 0) / owned.length
      );
      return { ...p, tasksComplete, tasksPending, tasksOutstanding, percentComplete };
    });
  }, [projects, tasks]);

  const showSelector = SCOPED_TABS.includes(activeTab);

  const selectedProjectMeta = useMemo(
    () => projectsWithProgress.find((p) => p.id === selectedProjectId) ?? null,
    [projectsWithProgress, selectedProjectId]
  );

  const timelineTasks = useMemo(() => {
    const scopeId = selectedProjectId ?? project.id;
    return tasks.filter((t) => t.projectId === scopeId);
  }, [tasks, selectedProjectId, project.id]);

  const timelineRange = selectedProjectMeta
    ? { startDate: selectedProjectMeta.startDate, endDate: selectedProjectMeta.endDate }
    : { startDate: project.startDate, endDate: project.endDate };

  const timelineLabel = selectedProjectMeta?.name ?? project.name;

  const stats = useMemo(() => {
    const active    = projectsWithProgress.filter((p) => p.status === 'active').length;
    const onHold    = projectsWithProgress.filter((p) => p.status === 'on_hold').length;
    const completed = projectsWithProgress.filter((p) => p.status === 'completed').length;
    const totalTasks = tasks.length;
    return { active, onHold, completed, totalTasks };
  }, [projectsWithProgress, tasks]);

  return (
    <div className="projects-root min-h-full bg-[#FAFAF7]">
      <style>{FONT_STYLES}</style>

      {/* ─── Editorial Header ─── */}
      <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                <span className="inline-block h-px w-6 bg-slate-400" />
                Workspace · Projects
              </div>
              <h1
                className="display text-2xl font-medium leading-tight text-slate-900 sm:text-4xl md:text-5xl"
                style={{ textWrap: 'balance' }}
              >
                The <em className="font-normal italic text-emerald-700">portfolio</em>.
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                Every site, every milestone, every dependency — tracked from groundbreaking
                through handover, in one place.
              </p>
            </div>

            {canCreate ? (
              <button
                onClick={() => setNewProjectOpen(true)}
                className="group inline-flex items-center justify-center gap-2.5 self-start whitespace-nowrap rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 active:bg-emerald-800"
              >
                <Plus className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
                New Project
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                Read-only access
              </div>
            )}
          </div>

          {/* Stat strip */}
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-4">
            <StatCell
              label="Active"
              value={stats.active.toString()}
              caption={`${projects.length} total`}
              accent="#0F766E"
            />
            <StatCell
              label="On Hold"
              value={stats.onHold.toString()}
              caption="Paused or pending input"
              accent="#B45309"
            />
            <StatCell
              label="Completed"
              value={stats.completed.toString()}
              caption="Closed and archived"
              accent="#1E40AF"
            />
            <StatCell
              label="Tasks tracked"
              value={stats.totalTasks.toString()}
              caption="Across every project"
              accent="#0F172A"
            />
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="px-4 py-6 space-y-6 sm:px-8 sm:py-8">
        {/* Tab row + selector — horizontal-scrolls on phones so the strip never */}
        {/* wraps mid-tab; selector below it on small screens, inline on >= md.  */}
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            {TABS.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <t.Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
            </div>
          </div>

          {showSelector && (
            <ProjectSelector
              projects={projectsWithProgress}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
            />
          )}
        </div>

        {/* Tab content — boundary-wrapped so a render error in one tab doesn't */}
        {/* nuke the rest of the Projects page.                                  */}
        <ErrorBoundary label={`Projects · ${activeTab}`}>
        {activeTab === 'list' && (
          <ProjectsListTab
            projects={projectsWithProgress}
            onOpen={handleOpenProject}
          />
        )}

        {activeTab === 'timeline' && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Schedule
                </p>
                <h2
                  className="display mt-1 text-xl font-medium text-slate-900 sm:text-2xl"
                  style={{ textWrap: 'balance' }}
                >
                  {timelineLabel}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedProjectMeta
                    ? `${timelineTasks.length} task${timelineTasks.length === 1 ? '' : 's'} on the Gantt`
                    : 'Pick a project from the selector to scope the schedule. Showing the active project by default.'}
                </p>
              </div>
              {canAddTask && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setBulkAddOpen(true)}
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Bulk add
                  </button>
                  <button
                    onClick={() => setAddTaskOpen(true)}
                    className="group inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 active:bg-emerald-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Task
                  </button>
                </div>
              )}
            </div>
            <div className="p-6">
              <GanttChart
                tasks={timelineTasks}
                startDate={timelineRange.startDate}
                endDate={timelineRange.endDate}
                compact={false}
              />
            </div>
          </section>
        )}

        {activeTab === 'activity'  && <ActivityTab projectId={selectedProjectId} />}
        {activeTab === 'documents' && <DocumentsTab projectId={selectedProjectId} />}
        {activeTab === 'logs'      && <LogsTab projectId={selectedProjectId} />}
        </ErrorBoundary>
      </div>

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={() => setActiveTab('list')}
      />

      {/* The project-detail modal moved to the Gantt page so editing project */}
      {/* metadata happens inside the project itself, not from the directory.   */}

      <CreateTaskModal
        isOpen={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        onCreate={async (form) => {
          await createTaskShared(form);
          setAddTaskOpen(false);
        }}
        zones={[]}
        allTasks={timelineTasks}
        projectId={timelineProjectId}
      />

      <BulkAddTasksModal
        isOpen={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        projectId={timelineProjectId}
        defaultStart={timelineRange.startDate}
        defaultEnd={timelineRange.endDate}
      />
    </div>
  );
}

function StatCell({
  label, value, caption, accent,
}: { label: string; value: string; caption: string; accent: string }) {
  return (
    <div className="relative overflow-hidden bg-white p-5">
      <div className="absolute left-0 top-0 h-px w-8" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="num mt-2 text-4xl font-medium text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </div>
  );
}
