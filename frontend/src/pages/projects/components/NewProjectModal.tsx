// NewProjectModal — editorial shell wrapping ProjectCreateForm.
//
// Standalone usage (Projects.tsx): modal opens, user creates a project, the
// onCreated callback fires, Projects.tsx navigates to the new project.
// The navigate() call lives in Projects.tsx's onCreated handler, not here.

import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { FRAUNCES } from '../../gantt/components/ledger';
import { ProjectCreateForm } from './ProjectCreateForm';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const navigate = useNavigate();

  if (!open) return null;

  const handleCreated = (newId: string) => {
    onCreated?.();
    onClose();
    // Navigate to the newly created project.
    if (newId && newId !== 'mock') {
      navigate(`/gantt?project=${newId}`);
    }
  };

  return (
    // Overlay scrolls itself — see comment in original NewProjectModal.
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#1A1A1A]/50">
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className="flex max-h-[95dvh] w-full max-w-xl flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)] sm:max-h-[90dvh]">

          {/* Header */}
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E6E1D4] px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                Portfolio
              </p>
              <h2
                className="mt-1 text-xl font-medium text-[#1A1A1A]"
                style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
              >
                New project.
              </h2>
              <p className="mt-0.5 text-xs text-[#6B6B6B]">
                Choose the phases for this job — each starts empty; add tasks from the list in the
                Gantt.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form — standalone mode: ProjectCreateForm renders its own footer */}
          <ProjectCreateForm
            id="new-project-form-standalone"
            onCreated={handleCreated}
            hideFooter={false}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
