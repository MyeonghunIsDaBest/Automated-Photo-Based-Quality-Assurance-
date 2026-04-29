import { useMemo, useState } from 'react';
import { Activity, Search, Users } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { AuditLog } from '../../../types';
import { EmptyProjectState } from './EmptyProjectState';

type EntityFilter = 'all' | AuditLog['entityType'];

interface LogsTabProps {
  projectId: string | null;
}

const ENTITY_FILTERS: { value: EntityFilter; label: string }[] = [
  { value: 'all',     label: 'All' },
  { value: 'project', label: 'Project' },
  { value: 'task',    label: 'Task' },
  { value: 'photo',   label: 'Photo' },
  { value: 'user',    label: 'User' },
];

const actionIcon = (action: string) => {
  if (action.includes('photo'))   return '📷';
  if (action.includes('ai'))      return '🤖';
  if (action.includes('task'))    return '📋';
  if (action.includes('comment')) return '💬';
  if (action.includes('report'))  return '📄';
  if (action.includes('project')) return '🏗️';
  return '📌';
};

export function LogsTab({ projectId }: LogsTabProps) {
  const allLogs = useAppStore((s) => s.auditLogs);
  const users = useAppStore((s) => s.users);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [search, setSearch] = useState('');

  const projectLogs = useMemo(
    () => (projectId ? allLogs.filter((l) => l.projectId === projectId) : []),
    [allLogs, projectId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projectLogs.filter((log) => {
      if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
      if (q) {
        const haystack = `${log.action} ${log.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [projectLogs, entityFilter, search]);

  const userName = (id: string) => {
    if (id === 'system') return 'System';
    return users.find((u) => u.id === id)?.fullName ?? 'Unknown';
  };

  if (!projectId) {
    return <EmptyProjectState message="The audit log is project-scoped. Pick a project to see its activity history." />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Project Activity Log</CardTitle>
            <CardDescription className="tabular-nums">
              {projectLogs.length} entr{projectLogs.length === 1 ? 'y' : 'ies'} for this project
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
              {ENTITY_FILTERS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEntityFilter(opt.value)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    entityFilter === opt.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search action or notes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-64 pl-8 text-xs"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {projectLogs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Activity className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-900">No activity yet</p>
            <p className="text-xs text-slate-500">Photo uploads, task updates, and project changes will appear here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Activity className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-900">No entries match your filters</p>
            <p className="text-xs text-slate-500">Try widening the entity type or clearing the search.</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {filtered.map((log) => (
                <div key={log.id} className="flex items-start gap-4 rounded-lg border border-slate-100 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl">
                    {actionIcon(log.action)}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium capitalize text-slate-900">{log.action.replace(/_/g, ' ')}</p>
                        <Badge variant="secondary" className="capitalize">{log.entityType}</Badge>
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">
                        {format(new Date(log.createdAt), 'MMM d, h:mm:ss a')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{log.notes || 'No details'}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Users className="h-3 w-3" />
                      <span>{userName(log.userId)}</span>
                      {log.ipAddress && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{log.ipAddress}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
