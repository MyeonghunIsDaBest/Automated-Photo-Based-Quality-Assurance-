import type { Project, User } from '../../../types';

interface SiteDiaryTabProps {
  project: Project;
  currentUser: User | null;
  canEdit: boolean;
  canDelete: boolean;
}

export function SiteDiaryTab({ project }: SiteDiaryTabProps) {
  return (
    <div className="p-8 text-center text-sm text-slate-500">
      Site Diary v2 — rewrite in progress · {project.name}
    </div>
  );
}
