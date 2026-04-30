import { useMemo, useState } from 'react';
import { ChevronRight, FolderKanban, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Project, ProjectStatus } from '../types';
import { useTableState } from '../hooks/useTableState';
import { SortableHeader } from './SortableHeader';
import { FilterPills } from './FilterPills';

type SortKey = 'name' | 'percentComplete' | 'tasksComplete' | 'tasksPending' | 'tasksOutstanding' | 'status';
type StatusFilter = 'all' | ProjectStatus;

interface ProjectsListTabProps {
  projects: Project[];
  onView?: (projectId: string) => void;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_BADGE: Record<ProjectStatus, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-blue-200 bg-blue-50 text-blue-700',
  archived: 'border-slate-200 bg-slate-50 text-slate-600',
};

function progressBarColor(pct: number) {
  if (pct >= 90) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-blue-500';
  return 'bg-amber-500';
}

export function ProjectsListTab({ projects, onView }: ProjectsListTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const statusFiltered = useMemo(
    () => (statusFilter === 'all' ? projects : projects.filter((p) => p.status === statusFilter)),
    [projects, statusFilter]
  );

  const { search, setSearch, sort, toggleSort, applied } = useTableState<Project, SortKey>({
    rows: statusFiltered,
    searchFields: ['name', 'client'],
    getSortValue: (row, key) => {
      if (key === 'name' || key === 'status') return row[key];
      return row[key];
    },
  });

  const pillOptions = useMemo(() => {
    const counts = projects.reduce<Record<ProjectStatus, number>>(
      (acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      },
      { active: 0, on_hold: 0, completed: 0, archived: 0 }
    );
    return [
      { value: 'all' as StatusFilter, label: 'All', count: projects.length },
      { value: 'active' as StatusFilter, label: 'Active', count: counts.active },
      { value: 'on_hold' as StatusFilter, label: 'On Hold', count: counts.on_hold },
      { value: 'completed' as StatusFilter, label: 'Completed', count: counts.completed },
    ];
  }, [projects]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">All Projects</CardTitle>
            <CardDescription>Filter, search, and sort across every project</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name or client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 pl-10"
            />
          </div>
        </div>
        <div className="mt-3">
          <FilterPills options={pillOptions} value={statusFilter} onChange={setStatusFilter} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <SortableHeader label="Project" sortKey="name" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="% Complete" sortKey="percentComplete" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Complete" sortKey="tasksComplete" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Pending" sortKey="tasksPending" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Outstanding" sortKey="tasksOutstanding" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
                <th className="px-4 py-3 text-right font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applied.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12">
                    <div className="flex flex-col items-center text-center">
                      <FolderKanban className="h-10 w-10 text-slate-300" />
                      <p className="mt-3 text-sm font-medium text-slate-900">No projects match your filters</p>
                      <p className="text-xs text-slate-500">Try clearing the search or selecting a different status.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                applied.map((proj) => (
                  <tr key={proj.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{proj.name}</p>
                      <p className="text-xs text-slate-500">{proj.client}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-2 rounded-full ${progressBarColor(proj.percentComplete)}`}
                            style={{ width: `${proj.percentComplete}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium tabular-nums text-slate-700">{proj.percentComplete}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{proj.tasksComplete}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{proj.tasksPending}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{proj.tasksOutstanding}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[proj.status]}`}
                      >
                        {STATUS_LABEL[proj.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => onView?.(proj.id)}>
                        View
                        <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
