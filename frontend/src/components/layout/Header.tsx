import { Bell, Plus } from 'lucide-react';
import { useAppStore } from '../../store';
import { format } from 'date-fns';

interface HeaderProps {
  title: string;
  onUploadClick?: () => void;
}

export default function Header({ title, onUploadClick }: HeaderProps) {
  const { activityFeed } = useAppStore();
  
  const recentActivities = activityFeed.slice(0, 3);

  return (
    <header className="border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">
            Last updated: {format(new Date(), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Activity Notifications */}
          <div className="relative">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <Bell className="h-5 w-5" />
              {recentActivities.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                  {recentActivities.length}
                </span>
              )}
            </button>
          </div>
          
          {/* Quick Upload Button */}
          {onUploadClick && (
            <button
              onClick={onUploadClick}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Upload Photos
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
