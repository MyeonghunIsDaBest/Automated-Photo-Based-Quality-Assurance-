import { ChevronDown, FolderKanban } from 'lucide-react';
import { Project } from '../types';

interface ProjectSelectorProps {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
}

export function ProjectSelector({ projects, value, onChange }: ProjectSelectorProps) {
  return (
    <div className="relative">
      <FolderKanban className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 w-72 appearance-none rounded-md border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
      >
        <option value="">Select a project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
