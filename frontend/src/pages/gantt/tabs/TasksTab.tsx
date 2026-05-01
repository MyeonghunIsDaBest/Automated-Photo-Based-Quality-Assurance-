import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Lock, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Task, Zone, User, Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import TaskModal from '../../../components/tasks/TaskModal';
import CreateTaskModal from '../../../components/tasks/CreateTaskModal';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';

interface TasksTabProps {
  project: Project;
  tasks: Task[];
  zones: Zone[];
  currentUser: User | null;
  canEdit: boolean;
  canDelete: boolean;
  onCreateTask: (newTask: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
  onSaveTask:   (task: Task) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
}

type SortKey = 'name' | 'phase' | 'startDate' | 'endDate' | 'percentComplete' | 'status';
type SortDir = 'asc' | 'desc';
type FilterChip = 'all' | 'mine' | 'open' | 'complete';

const STATUS_BADGE: Record<Task['status'], string> = {
  not_started: 'border-slate-200 bg-slate-50 text-slate-600',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  complete:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  delayed:     'border-red-200 bg-red-50 text-red-700',
  blocked:     'border-amber-200 bg-amber-50 text-amber-700',
};

const FILTER_CHIPS: { id: FilterChip; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'mine',     label: 'My tasks' },
  { id: 'open',     label: 'Open' },
  { id: 'complete', label: 'Complete' },
];

export function TasksTab({
  project, tasks, zones, currentUser, canEdit, canDelete,
  onCreateTask, onSaveTask, onDeleteTask,
}: TasksTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [chip, setChip] = useState<FilterChip>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredAndSorted = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (chip === 'mine')     return t.assigneeId === currentUser?.id;
      if (chip === 'open')     return t.status !== 'complete';
      if (chip === 'complete') return t.status === 'complete';
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [tasks, chip, sortKey, sortDir, currentUser?.id]);

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-slate-700" />
      : <ArrowDown className="h-3 w-3 text-slate-700" />;
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Tasks · ${project.name}`}
        title="Every task at a glance."
        description="A flat list of every task on this project. Sort any column, filter to your own work, click a row to edit. Same data as the Schedule — different lens."
        action={
          canEdit ? (
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Task
            </Button>
          ) : (
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
              <Lock className="h-3.5 w-3.5" />
              Read-only
            </Badge>
          )
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChip(c.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                chip === c.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {c.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500">
            {filteredAndSorted.length} of {tasks.length}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filteredAndSorted.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={tasks.length === 0 ? `No tasks on ${project.name}.` : 'No tasks match this filter.'}
                description={
                  tasks.length === 0
                    ? 'Create one to start tracking. Photos uploaded against a task move its bar forward.'
                    : 'Try a different filter or clear it to see everything.'
                }
                action={
                  canEdit && tasks.length === 0 ? (
                    <Button onClick={() => setIsCreateModalOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      New Task
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    <SortHeader label="Task"    onClick={() => handleSort('name')}            icon={sortIcon('name')} />
                    <SortHeader label="Phase"   onClick={() => handleSort('phase')}           icon={sortIcon('phase')} />
                    <SortHeader label="Start"   onClick={() => handleSort('startDate')}       icon={sortIcon('startDate')} />
                    <SortHeader label="End"     onClick={() => handleSort('endDate')}         icon={sortIcon('endDate')} />
                    <SortHeader label="%"       onClick={() => handleSort('percentComplete')} icon={sortIcon('percentComplete')} />
                    <SortHeader label="Status"  onClick={() => handleSort('status')}          icon={sortIcon('status')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAndSorted.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => {
                        setSelectedTask(t);
                        setIsTaskModalOpen(true);
                      }}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{t.name}</p>
                        {t.zoneId && (
                          <p className="text-[11px] text-slate-500">
                            {zones.find((z) => z.id === t.zoneId)?.name ?? 'Unknown zone'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-600">{t.phase}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {format(parseISO(t.startDate), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {format(parseISO(t.endDate), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500"
                              style={{ width: `${t.percentComplete}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-slate-600">
                            {t.percentComplete}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase tracking-wider ${STATUS_BADGE[t.status]}`}
                        >
                          {t.status.replace('_', ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TaskModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={async (t) => {
          await onSaveTask(t);
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onDelete={async (id) => {
          await onDeleteTask(id);
        }}
        zones={zones}
        allTasks={tasks}
        readOnly={!canEdit}
        canDelete={canDelete}
      />

      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={async (input) => {
          await onCreateTask(input);
          setIsCreateModalOpen(false);
        }}
        zones={zones}
        allTasks={tasks}
        projectId={project.id}
      />
    </>
  );
}

function SortHeader({
  label, icon, onClick,
}: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 transition-colors hover:text-slate-900"
      >
        {label}
        {icon}
      </button>
    </th>
  );
}
