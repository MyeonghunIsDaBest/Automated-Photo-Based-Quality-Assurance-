import { useState } from 'react';
import { FileBox, Image as ImageIcon } from 'lucide-react';
import type { Project, User } from '../../../types';
import { PlansTab } from './PlansTab';
import { UploadsTab } from './UploadsTab';

interface FilesTabProps {
  project: Project;
  canEdit: boolean;
  canUpload: boolean;
  currentUser: User | null;
}

// Files — the merged home for everything the project files away: the formal
// plan set (drawings / permits) and the photo log (site photos + video). Two
// registers behind a Plans | Uploads sub-nav, same warm-logbook pattern as the
// Inventory tab's Stock | Defects switch. Replaces the old standalone Plans and
// Uploads tabs.
export function FilesTab({ project, canEdit, canUpload, currentUser }: FilesTabProps) {
  const [view, setView] = useState<'plans' | 'uploads'>('plans');

  return (
    <div className="editorial-root">
      <div className="mb-4 inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        {([['plans', 'Plans', FileBox], ['uploads', 'Uploads', ImageIcon]] as const).map(([id, label, Icon]) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                isActive ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {view === 'plans' && <PlansTab project={project} canEdit={canEdit} />}
      {view === 'uploads' && <UploadsTab project={project} currentUser={currentUser} canUpload={canUpload} />}
    </div>
  );
}
