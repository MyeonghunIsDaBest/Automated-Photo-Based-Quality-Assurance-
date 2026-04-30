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
        color: 'bg-blue-50 text-blue-600',
        shortcut: 'U',
        requires: 'upload_photos',
      },
      {
        label: 'Photo Gallery',
        description: 'Browse all project photos and videos',
        icon: Image,
        path: '/gallery',
        color: 'bg-purple-50 text-purple-600',
      },
      {
        label: 'Upload Documents',
        description: 'Add contracts, permits, and blueprints',
        icon: FileText,
        path: '/files',
        color: 'bg-emerald-50 text-emerald-600',
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
        color: 'bg-amber-50 text-amber-600',
        shortcut: 'G',
      },
      {
        label: 'Task Dashboard',
        description: 'Manage and track all project tasks',
        icon: CheckSquare,
        path: '/gantt',
        color: 'bg-indigo-50 text-indigo-600',
        requires: 'edit_tasks',
      },
      {
        label: 'Project Files',
        description: 'All documents, photos, and videos',
        icon: FolderOpen,
        path: '/files',
        color: 'bg-slate-50 text-slate-600',
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
        color: 'bg-emerald-50 text-emerald-600',
        shortcut: 'R',
        requires: 'edit_tasks',
      },
      {
        label: 'Progress Reports',
        description: 'View historical progress and trends',
        icon: BarChart3,
        path: '/reports?type=progress',
        color: 'bg-blue-50 text-blue-600',
      },
      {
        label: 'Financial Reports',
        description: 'Budget, bids, and expense tracking',
        icon: DollarSign,
        path: '/reports?type=financial',
        color: 'bg-green-50 text-green-600',
        requires: 'view_finance',
      },
      {
        label: 'Audit Trail',
        description: 'Complete activity log and history',
        icon: Users,
        path: '/reports?type=audit',
        color: 'bg-purple-50 text-purple-600',
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
        color: 'bg-pink-50 text-pink-600',
        shortcut: 'M',
      },
      {
        label: 'Safety Alerts',
        description: 'View and manage safety notifications',
        icon: Shield,
        path: '/reports?type=safety',
        color: 'bg-red-50 text-red-600',
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
        className={`fixed left-0 top-1/2 z-50 -translate-y-1/2 rounded-r-md border-y border-r border-slate-200 bg-white shadow-md transition-all hover:bg-slate-50 ${
          isOpen ? 'translate-x-64' : 'translate-x-0'
        }`}
        title="Quick Actions (Q)"
      >
        <div className="flex h-6 w-6 items-center justify-center p-1.5">
          {isOpen ? (
            <X className="h-3.5 w-3.5 text-slate-600" />
          ) : (
            <svg className="h-3.5 w-3.5 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Panel */}
      <div
        ref={sidebarRef}
        className={`fixed left-0 top-0 z-50 h-full w-80 transform border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
            <p className="text-xs text-slate-500">Press Q to toggle</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100vh-80px)] overflow-auto p-4">
          {visibleCategories.map((category, categoryIndex) => (
            <div key={category.title} className="mb-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {category.title}
              </h3>
              <div className="space-y-2">
                {category.actions.map((action, actionIndex) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      onClick={() => handleActionClick(action.path)}
                      className="group flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm"
                      style={{
                        animationDelay: `${(categoryIndex * 3 + actionIndex) * 50}ms`,
                      }}
                    >
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${action.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 group-hover:text-emerald-700">
                            {action.label}
                          </span>
                          {action.shortcut && (
                            <Badge variant="secondary" className="text-xs">
                              {action.shortcut}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 group-hover:text-slate-600">
                          {action.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {categoryIndex < visibleCategories.length - 1 && (
                <Separator className="my-4" />
              )}
            </div>
          ))}

          {/* Footer */}
          <div className="mt-6 rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">
              <strong>Tip:</strong> Use keyboard shortcuts for faster navigation
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
