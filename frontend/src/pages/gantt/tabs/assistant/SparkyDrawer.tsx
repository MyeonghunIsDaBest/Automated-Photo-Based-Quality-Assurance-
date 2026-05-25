// frontend/src/pages/gantt/tabs/assistant/SparkyDrawer.tsx
//
// Right-side slide-in drawer wrapping the existing AssistantView. Mounts
// on `open=true`, slides in via framer-motion. Backdrop click + Esc close.
// Fresh chat every mount (AssistantView already behaves this way).

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Zap } from 'lucide-react';
import type { Project, User } from '../../../../types';
import { AssistantView } from './AssistantView';

interface SparkyDrawerProps {
  open: boolean;
  onClose: () => void;
  project: Project;
  currentUser: User | null;
  initialSeedText: string;
}

export function SparkyDrawer({ open, onClose, project, currentUser, initialSeedText }: SparkyDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />

          {/* Drawer panel */}
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-[10px] bg-[#2F8F5C] text-white grid place-items-center shadow-[0_0_0_3px_rgba(47,143,92,0.18)]">
                  <Zap className="h-4 w-4" />
                </span>
                <div className="leading-tight">
                  <div className="font-semibold text-[15px]">Sparky</div>
                  <div className="text-[11.5px] text-slate-500">Site Diary assistant</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Sparky"
                className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Chat */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <AssistantView
                project={project}
                currentUser={currentUser}
                initialSeedText={initialSeedText}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
