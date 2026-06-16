import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  ChevronDown,
  Filter,
  Search,
  Users,
} from 'lucide-react';
import { useAppStore } from '../../store';
import type { AuditLog } from '../../types';

type EntityFilter = 'all' | AuditLog['entityType'];

const ENTITY_FILTERS: { value: EntityFilter; label: string }[] = [
  { value: 'all',     label: 'All' },
  { value: 'project', label: 'Project' },
  { value: 'task',    label: 'Task' },
  { value: 'photo',   label: 'Photo' },
  { value: 'user',    label: 'User' },
];

function actionIcon(action: string): string {
  if (action.includes('photo'))   return '📷';
  if (action.includes('ai'))      return '🤖';
  if (action.includes('task'))    return '📋';
  if (action.includes('comment')) return '💬';
  if (action.includes('report'))  return '📄';
  if (action.includes('project')) return '🏗️';
  return '📌';
}

export default function AuditTrailPanel() {
  const { auditLogs, users } = useAppStore();

  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [userFilter, setUserFilter]     = useState<string>('all');
  const [auditSearch, setAuditSearch]   = useState('');

  const auditUsers = useMemo(
    () => Array.from(new Set(auditLogs.map((l) => l.userId))),
    [auditLogs],
  );

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
      if (userFilter !== 'all' && log.userId !== userFilter) return false;
      if (q) {
        const haystack = `${log.action} ${log.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, entityFilter, userFilter, auditSearch]);

  const userName = (id: string) => {
    if (id === 'system') return 'System';
    return users.find((u) => u.id === id)?.fullName ?? 'Unknown';
  };

  return (
    <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#EFEBE0] p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[#6B6B6B]">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-max rounded-full border border-[#E6E1D4] bg-white p-0.5">
            {ENTITY_FILTERS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setEntityFilter(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  entityFilter === opt.value
                    ? 'bg-[#1A1A1A] text-white'
                    : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A0A0]" />
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="h-8 appearance-none rounded-full border border-[#E6E1D4] bg-white pl-3 pr-8 text-xs text-[#3A3A3A] focus:outline-none focus:ring-2 focus:ring-[#2F8F5C] focus:ring-offset-1"
          >
            <option value="all">All users</option>
            {auditUsers.map((id) => (
              <option key={id} value={id}>{userName(id)}</option>
            ))}
          </select>
        </div>
        <div className="relative w-full sm:ml-auto sm:w-auto">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            placeholder="Search action or notes…"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            className="h-9 w-full rounded-full border border-[#E6E1D4] bg-white pl-9 pr-3 text-base focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-xs sm:w-64"
          />
        </div>
      </div>

      {/* List */}
      {filteredAudit.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <Activity className="mx-auto h-10 w-10 text-[#A0A0A0]" />
          <p className="mt-3 text-sm font-medium text-[#1A1A1A]">No entries match your filters.</p>
          <p className="mt-1 text-xs text-[#6B6B6B]">Try widening the entity, user, or search criteria.</p>
        </div>
      ) : (
        <ul className="max-h-[640px] divide-y divide-[#EFEBE0] overflow-y-auto">
          {filteredAudit.map((log) => (
            <li key={log.id} className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-[#FAF8F2]">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-[#F0EDE4] text-xl">
                {actionIcon(log.action)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize text-[#1A1A1A]">{log.action.replace(/_/g, ' ')}</p>
                    <span className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                      {log.entityType}
                    </span>
                  </div>
                  <span className="tabular-nums text-xs text-[#6B6B6B]">
                    {format(new Date(log.createdAt), 'MMM d, h:mm:ss a')}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#3A3A3A]">{log.notes || 'No details'}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-[#6B6B6B]">
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
