import { create } from 'zustand';
import { Project } from './types';
import { mockProjects } from './mocks/projects';

interface ProjectsListState {
  projects: Project[];
  addProject: (project: Project) => void;
}

export const useProjectsListStore = create<ProjectsListState>((set) => ({
  projects: mockProjects,
  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),
}));
