import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Upload, Calendar, FileText, Image, Users, MessageSquare, DollarSign, Shield, BarChart3, CheckSquare, FolderOpen } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { useAppStore } from '../../store';
import { canUploadPhotos, canViewFinance, canEditTasks } from '../../lib/permissions';

type Capability = 'upload_photos' | 'upload_documents' | 'edit_tasks' | 'view_finance';

interface QuickAction {
  label: string;
  description: string;
  icon: typeof Upload;
  path: string;
  color: string;
  shortcut?: string;
  requires?: Capability;
}

interface QuickActionCategory {
  title: string;
  actions: QuickAction[];
}

const quickActionCategories: QuickActionCategory[] = [
  {
    title: 'Upload & Media',
    actions: [
      {
        label: 'Upload Photos',
        description: 'Add site progress photos with AI analysis',
        icon: Upload,
        path: '/upload',
        color: 'bg-[#E5F2EA] text-[#246F47]',
        shortcut: 'U',
        requires: 'upload_photos',
      },
      {
        label: 'Photo Gallery',
        description: 'Browse all project photos and videos',
        icon: Image,
        path: '/gallery',
        color: 'bg-[#F0EDE4] text-[#3A3A3A]',
      },
      {
        label: 'Upload Documents',
        description: 'Add contracts, permits, and blueprints',
        icon: FileText,
        path: '/files',
        color: 'bg-[#E5F2EA] text-[#246F47]',
        requires: 'upload_documents',
      },
    ],
  },
  {
    title: 'Project Management',
    actions: [
      {
        label: 'View Gantt Chart',
        description: 'Interactive project timeline and schedule',
        icon: Calendar,
        path: '/gantt',
        color: 'bg-[#F9EFD9] text-[#C8841E]',
        shortcut: 'G',
      },
      {
        label: 'Task Dashboard',
        description: 'Manage and track all project tasks',
        icon: CheckSquare,
        path: '/projects',
        color: 'bg-[#EEF1F4] text-[#5B6B7B]',
        requires: 'edit_tasks',
      },
      {
        label: 'Project Files',
        description: 'All documents, photos, and videos',
        icon: FolderOpen,
        path: '/files',
        color: 'bg-[#FAF8F2] text-[#6B6B6B]',
      },
    ],
  },
  {
    title: 'Reports & Analytics',
    actions: [
      {
        label: 'Generate Report',
        description: 'Create weekly or milestone reports',
        icon: FileText,
        path: '/reports',
        color: 'bg-[#E5F2EA] text-[#246F47]',
        shortcut: 'R',
        requires: 'edit_tasks',
      },
      {
        label: 'Progress Reports',
        description: 'View historical progress and trends',
        icon: BarChart3,
        path: '/reports?type=progress',
        color: 'bg-[#EEF1F4] text-[#5B6B7B]',
      },
      {
        label: 'Financial Reports',
        description: 'Budget, bids, and expense tracking',
        icon: DollarSign,
        path: '/reports?type=financial',
        color: 'bg-[#F9EFD9] text-[#C8841E]',
        requires: 'view_finance',
      },
      {
        label: 'Audit Trail',
        description: 'Complete activity log and history',
        icon: Users,
        path: '/reports?type=audit',
        color: 'bg-[#F0EDE4] text-[#3A3A3A]',
      },
    ],
  },
  {
    title: 'Communication',
    actions: [
      {
        label: 'Messages',
        description: 'Team conversations and updates',
        icon: MessageSquare,
        path: '/messages',
        color: 'bg-[#FAF8F2] text-[#6B6B6B]',
        shortcut: 'M',
      },
      {
        label: 'Safety Alerts',
        description: 'View and manage safety notifications',
        icon: Shield,
        path: '/reports?type=safety',
        color: 'bg-[#FBE5E5] text-[#C44545]',
      },
    ],
  },
];

export default function QuickActionsSidebar() {
  const navigate = useNavigate();
  const currentUser = useAppStore((s) => s.currentUser);
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const visibleCategories = useMemo<QuickActionCategory[]>(() => {
    const allowed: Record<Capability, boolean> = {
      upload_photos:    canUploadPhotos(currentUser),
      upload_documents: canUploadPhotos(currentUser),
      edit_tasks:       canEditTasks(currentUser),
      view_finance:     canViewFinance(currentUser),
    };
    return quickActionCategories
      .map((cat) => ({
        ...cat,
        actions: cat.actions.filter((a) => !a.requires || allowed[a.requires]),
      }))
      .filter((cat) => cat.actions.length > 0);
  }, [currentUser]);

  // Auto-hide after 5 seconds of inactivity
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (isOpen && !isHovered) {
      timeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 5000);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isOpen, isHovered]);

  // Lock the page underneath while the sidebar is open on mobile so the
  // user's vertical drag doesn't scroll the dashboard behind the panel.
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('body-scroll-lock');
    } else {
      document.body.classList.remove('body-scroll-lock');
    }
    return () => {
      document.body.classList.remove('body-scroll-lock');
    };
  }, [isOpen]);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const handleActionClick = (path: string) => {
    navigate(path);
    setIsOpen(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'q' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <>
      {/* Toggle Button - Fixed on left side */}
      <button
        onClick={toggleSidebar}
        className={`fixed left-0 top-1/2 z-50 -translate-y-1/2 rounded-r-md border-y border-r border-[#E6E1D4] bg-white shadow-[0_2px_8px_rgba(20,20,20,0.08)] transition-all hover:bg-[#FAF8F2] ${
          isOpen ? 'translate-x-64' : 'translate-x-0'
        }`}
        title="Quick Actions (Q)"
      >
        <div className="flex h-6 w-6 items-center justify-center p-1.5">
          {isOpen ? (
            <X className="h-3.5 w-3.5 text-[#6B6B6B]" />
          ) : (
            <svg className="h-3.5 w-3.5 text-[#6B6B6B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
              <path d="M9 9l-3 3 3 3" />
            </svg>
          )}
        </div>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#1A1A1A]/20"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Panel — full width on phones, fixed 320px on sm+. */}
      <div
        ref={sidebarRef}
        className={`fixed left-0 top-0 z-50 h-full w-full transform border-r border-[#E6E1D4] bg-[#FAF8F2] shadow-[0_8px_28px_rgba(20,20,20,0.12)] transition-transform duration-300 ease-in-out sm:w-80 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingLeft: 'env(safe-area-inset-left)' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E6E1D4] bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1A1A1A]">Quick Actions</h2>
            <p className="text-xs text-[#6B6B6B]">Press Q to toggle</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close quick actions"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#3A3A3A] active:bg-[#F0EDE4]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100vh-80px)] overflow-auto p-4">
          {visibleCategories.map((category, categoryIndex) => (
            <div key={category.title} className="mb-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#6B6B6B]">
                {category.title}
              </h3>
              <div className="space-y-2">
                {category.actions.map((action, actionIndex) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      onClick={() => handleActionClick(action.path)}
                      className="group flex w-full items-start gap-3 rounded-[14px] border border-[#E6E1D4] bg-white p-3 text-left transition-all hover:border-[#2F8F5C]/40 hover:bg-[#E5F2EA]/30 hover:shadow-[0_2px_8px_rgba(20,20,20,0.06)]"
                      style={{
                        animationDelay: `${(categoryIndex * 3 + actionIndex) * 50}ms`,
                      }}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${action.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1A1A1A] group-hover:text-[#246F47]">
                            {action.label}
                          </span>
                          {action.shortcut && (
                            <Badge variant="secondary" className="border border-[#E6E1D4] bg-[#FAF8F2] text-[10px] text-[#6B6B6B]">
                              {action.shortcut}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[#6B6B6B] group-hover:text-[#3A3A3A]">
                          {action.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {categoryIndex < visibleCategories.length - 1 && (
                <Separator className="my-4 bg-[#EFEBE0]" />
              )}
            </div>
          ))}

          {/* Footer */}
          <div className="mt-6 rounded-[14px] border border-[#E6E1D4] bg-white p-4">
            <p className="text-xs text-[#6B6B6B]">
              <strong className="text-[#3A3A3A]">Tip:</strong> Use keyboard shortcuts for faster navigation
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
