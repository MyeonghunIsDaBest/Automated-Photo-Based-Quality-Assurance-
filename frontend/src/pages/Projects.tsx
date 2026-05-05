import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Plus } from 'lucide-react';
import { useAppStore } from '../store';
import { canCreateProjects } from '../lib/permissions';
import { useProjectsListStore } from './projects/store';
import { ProjectsListTab } from './projects/components/ProjectsListTab';
import { NewProjectModal } from './projects/components/NewProjectModal';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

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

// The Projects page is a directory and nothing more — Timeline / Activity /
// Documents / Logs all moved into each project's Gantt page where they're
// scoped to a single project. Picking a tile here routes into the per-project
// Gantt workspace, which is the only place those views live now.
export default function Projects() {
  const { tasks, currentUser } = useAppStore();
  const projects = useProjectsListStore((s) => s.projects);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);
  const navigate = useNavigate();
  const canCreate = canCreateProjects(currentUser);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // Click on a project row → set it as the active project, then navigate to
  // the Gantt overview. The Gantt page now hosts edit-project, files, and
  // messages so the modal-based detail view from this page is retired.
  const handleOpenProject = (id: string) => {
    setActiveProject(id);
    navigate('/gantt');
  };

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

      {/* ─── Projects directory ─── */}
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <ErrorBoundary label="Projects · list">
          <ProjectsListTab
            projects={projectsWithProgress}
            onOpen={handleOpenProject}
          />
        </ErrorBoundary>
      </div>

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
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
