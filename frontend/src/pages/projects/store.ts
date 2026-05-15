import { create } from 'zustand';
import { Project } from './types';
import { mockProjects } from './mocks/projects';
import { listProjects, type ProjectRow } from '../../lib/api/projects';
import { supabaseConfigured } from '../../lib/supabase';

interface ProjectsListState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  addProject: (project: Project) => void;
  updateProject: (id: string, patch: Partial<Project>) => void;
  setActiveProject: (id: string) => void;
  // Replaces the local list with whatever Supabase has. No-op when env vars
  // aren't set, so the mock-data dev experience keeps working.
  loadProjects: () => Promise<void>;
}

// The Hampstead Heights demo project is always present in the projects list
// so users can flip to it via the switcher and see the editable Gantt with
// realistic phase progression — regardless of whether real projects exist
// in Supabase yet. In live mode `loadProjects()` appends server rows
// alongside the demo; in mock mode the rest of mockProjects also loads.
const DEMO_ONLY = mockProjects.filter((p) => p.id === 'project_demo_inflight');
const initialProjects: Project[] = supabaseConfigured() ? DEMO_ONLY : mockProjects;
const initialActive = initialProjects[0]?.id ?? null;

function projectRowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    client: row.client_name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    // Stats are derived from tasks at render time; default to 0 here and let
    // the Gantt / Dashboard pages fill them in once the tasks slice loads.
    percentComplete: 0,
    tasksComplete: 0,
    tasksPending: 0,
    tasksOutstanding: 0,
  };
}

export const useProjectsListStore = create<ProjectsListState>((set) => ({
  projects: initialProjects,
  activeProjectId: initialActive,
  isLoading: false,
  addProject: (project) =>
    set((state) => ({
      projects: [project, ...state.projects],
      // First project ever added becomes the active one automatically.
      activeProjectId: state.activeProjectId ?? project.id,
    })),
  updateProject: (id, patch) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  setActiveProject: (id) => set({ activeProjectId: id }),
  loadProjects: async () => {
    if (!supabaseConfigured()) return;
    set({ isLoading: true });
    try {
      const rows = await listProjects();
      const serverProjects = rows.map(projectRowToProject);
      // Always keep the Hampstead Heights demo at the top so users can see
      // the editable Gantt's realistic phase progression even before any
      // real projects exist on the server.
      const projects = [...DEMO_ONLY, ...serverProjects];
      set((state) => ({
        projects,
        activeProjectId:
          projects.find((p) => p.id === state.activeProjectId)?.id
            ?? projects[0]?.id
            ?? null,
        isLoading: false,
      }));
    } catch (e) {
      // Don't fail loud — keep the demo project visible so the UI still has
      // something to render.
      // eslint-disable-next-line no-console
      console.error('[projects] failed to load:', e);
      set({ projects: DEMO_ONLY, isLoading: false });
    }
  },
}));

// Re-export for callers that don't want to import from the API module.
export type { ProjectRow };

// Convenience selector — returns the active project record, falling back to
// the first one if the active id has been removed.
export function selectActiveProject(state: ProjectsListState): Project | null {
  if (state.projects.length === 0) return null;
  const found = state.projects.find((p) => p.id === state.activeProjectId);
  return found ?? state.projects[0];
}
