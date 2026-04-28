import { useState } from 'react';
import { useAppStore } from '../store';
import Header from '../components/layout/Header';
import { Search, Filter, Download, Shield, User, FileText, Image as ImageIcon, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function Audit() {
  const { auditLogs, users } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');

  const filteredLogs = auditLogs.filter(log => {
    if (searchQuery && !log.action.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !log.notes?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterAction && log.action !== filterAction) return false;
    if (filterEntityType && log.entityType !== filterEntityType) return false;
    return true;
  });

  const uniqueActions = [...new Set(auditLogs.map(log => log.action))];
  const uniqueEntityTypes = [...new Set(auditLogs.map(log => log.entityType))];

  const getUserName = (userId: string) => {
    if (userId === 'system') return 'System';
    return users.find(u => u.id === userId)?.fullName || 'Unknown';
  };

  const getActionIcon = (action: string) => {
    if (action.includes('photo')) return ImageIcon;
    if (action.includes('task')) return FileText;
    if (action.includes('user')) return User;
    if (action.includes('ai')) return Shield;
    return FileText;
  };

  const getActionColor = (action: string) => {
    if (action.includes('upload')) return 'bg-blue-100 text-blue-700';
    if (action.includes('ai')) return 'bg-purple-100 text-purple-700';
    if (action.includes('update')) return 'bg-green-100 text-green-700';
    if (action.includes('comment')) return 'bg-amber-100 text-amber-700';
    if (action.includes('report')) return 'bg-slate-100 text-slate-700';
    return 'bg-slate-100 text-slate-700';
  };

  const handleExport = () => {
    // Simulate CSV export
    const headers = ['ID', 'Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Notes'];
    const rows = filteredLogs.map(log => [
      log.id,
      log.createdAt,
      getUserName(log.userId),
      log.action,
      log.entityType,
      log.entityId || '',
      log.notes || '',
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div>
      <Header title="Audit Trail" />
      
      <div className="p-6">
        {/* Info Banner */}
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-medium text-blue-900">Tamper-Evident Audit Log</h3>
              <p className="text-sm text-blue-700">
                Every action in SiteProof is logged with timestamp, user, and IP address. 
                This provides complete accountability and can be used for dispute resolution.
              </p>
            </div>
          </div>
        </div>
        
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-slate-400" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>
              ))}
            </select>
            
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Types</option>
              {uniqueEntityTypes.map(type => (
                <option key={type} value={type} className="capitalize">{type}</option>
              ))}
            </select>
            
            <button
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
        
        {/* Audit Log Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Audit Logs</h3>
              <p className="text-sm text-slate-500">
                {filteredLogs.length} of {auditLogs.length} entries
              </p>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">Timestamp</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">User</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">Action</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">Entity</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">Details</th>
                  <th className="px-6 py-3 text-left font-medium text-slate-700">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  const Icon = getActionIcon(log.action);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          <span className="font-medium text-slate-900">
                            {format(new Date(log.createdAt), 'MMM d, h:mm:ss a')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-900">{getUserName(log.userId)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${getActionColor(log.action)}`}>
                          <Icon className="h-3 w-3" />
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 capitalize">
                            {log.entityType}
                          </span>
                          {log.entityId && (
                            <span className="text-slate-500">{log.entityId}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        <p className="truncate text-slate-600">{log.notes || '-'}</p>
                        {log.oldValue && log.newValue && (
                          <div className="mt-1 text-xs">
                            <span className="text-red-500">{JSON.stringify(log.oldValue)}</span>
                            <span className="mx-1">→</span>
                            <span className="text-green-500">{JSON.stringify(log.newValue)}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-slate-500">
                          {log.ipAddress || '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {filteredLogs.length === 0 && (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Search className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">No audit logs found</h3>
              <p className="text-slate-500">Try adjusting your filters</p>
            </div>
          )}
        </div>
        
        {/* Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Total Events</p>
            <p className="text-2xl font-bold text-slate-900">{auditLogs.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Photos Uploaded</p>
            <p className="text-2xl font-bold text-blue-600">
              {auditLogs.filter(l => l.action === 'photo_uploaded').length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">AI Analyses</p>
            <p className="text-2xl font-bold text-purple-600">
              {auditLogs.filter(l => l.action === 'ai_analysis_completed').length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Task Updates</p>
            <p className="text-2xl font-bold text-green-600">
              {auditLogs.filter(l => l.action === 'task_progress_updated').length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
