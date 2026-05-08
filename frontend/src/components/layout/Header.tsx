import { Bell, Plus } from 'lucide-react';
import { format } from 'date-fns';

interface HeaderProps {
  title: string;
  onUploadClick?: () => void;
}

// Legacy header used only by the Audit page (which is itself unrouted as
// of Phase A — see App.tsx). The notification bell shows no badge because
// the dead `activityFeed` slice was removed in the connectedness pass.
// When `/audit` is wired up, this header should be replaced with TopNav +
// page-level notification surfacing.
export default function Header({ title, onUploadClick }: HeaderProps) {
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
          <div className="relative">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </button>
          </div>

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
