import { Task } from '../../types';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Badge } from './badge';

interface GanttChartProps {
  tasks: Task[];
  startDate: string;
  endDate: string;
  compact?: boolean;
  showMonths?: boolean;
}

export function GanttChart({ tasks, startDate, endDate, compact = false, showMonths = true }: GanttChartProps) {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const totalDays = differenceInDays(end, start);

  // Generate month headers
  const months: { name: string; start: number; width: number }[] = [];
  let currentDate = new Date(start);
  let dayOffset = 0;

  while (currentDate <= end) {
    const monthStart = new Date(currentDate);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const clampedEnd = monthEnd > end ? end : monthEnd;
    const daysInMonth = differenceInDays(clampedEnd, monthStart) + 1;

    months.push({
      name: format(monthStart, 'MMM yyyy'),
      start: dayOffset,
      width: (daysInMonth / totalDays) * 100,
    });

    currentDate = new Date(monthEnd);
    currentDate.setDate(currentDate.getDate() + 1);
    dayOffset += daysInMonth;
  }

  const getTaskPosition = (task: Task) => {
    const taskStart = parseISO(task.startDate);
    const taskEnd = parseISO(task.endDate);
    const startOffset = differenceInDays(taskStart, start);
    const duration = differenceInDays(taskEnd, taskStart) + 1;

    return {
      left: (startOffset / totalDays) * 100,
      width: (duration / totalDays) * 100,
    };
  };

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'not_started': return 'bg-slate-400';
      case 'in_progress': return 'bg-blue-500';
      case 'complete': return 'bg-emerald-500';
      case 'delayed': return 'bg-red-500';
      case 'blocked': return 'bg-gray-700';
    }
  };

  const getZoneColor = (zoneId?: string) => {
    const zoneColors: Record<string, string> = {
      'zone_1': '#3B82F6',
      'zone_2': '#10B981',
      'zone_3': '#F59E0B',
      'zone_4': '#EF4444',
      'zone_5': '#8B5CF6',
    };
    return zoneId ? zoneColors[zoneId] : '#64748b';
  };

  const getStatusLabel = (status: Task['status']) => {
    return status.replace('_', ' ').toUpperCase();
  };

  if (compact) {
    return (
      // Compact mode: scroll horizontally on phones so the bar stays readable.
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div className="min-w-[560px]">
        {/* Task Rows - Compact */}
        <div className="divide-y divide-slate-100">
          {tasks.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              No tasks scheduled — upload a photo or add a milestone to begin.
            </div>
          )}
          {tasks.map((task) => {
            const position = getTaskPosition(task);
            return (
              <div key={task.id} className="flex items-center gap-4 p-3">
                <div className="w-36 flex-shrink-0 sm:w-48">
                  <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
                  <p className="text-xs text-slate-500">{task.percentComplete}%</p>
                </div>
                <div className="flex-1">
                  <div className="relative h-6 rounded-full bg-slate-100">
                    <div
                      className="absolute top-0 bottom-0 rounded-full"
                      style={{
                        left: `${position.left}%`,
                        width: `${position.width}%`,
                        backgroundColor: getZoneColor(task.zoneId),
                      }}
                    >
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${getStatusColor(task.status)}`}
                        style={{ width: `${task.percentComplete}%`, opacity: 0.8 }}
                      />
                    </div>
                  </div>
                </div>
                <Badge variant={task.status === 'complete' ? 'default' : task.status === 'delayed' ? 'destructive' : 'blue'}>
                  {getStatusLabel(task.status)}
                </Badge>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    );
  }

  return (
    // Full mode: also horizontal-scroll on small viewports — the chart needs
    // ≥640px to be useful at all, and squishing months produces unreadable text.
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <div className="min-w-[640px]">
      {/* Month Headers */}
      {showMonths && (
        <div className="flex border-b border-slate-200 bg-slate-50">
          <div className="w-36 flex-shrink-0 border-r border-slate-200 p-3 text-sm font-medium text-slate-700 sm:w-48">
            Task Name
          </div>
          <div className="flex-1">
            <div className="flex">
              {months.map((month) => (
                <div
                  key={month.name}
                  className="border-r border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
                  style={{ width: `${month.width}%` }}
                >
                  {month.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Task Rows */}
      <div className="divide-y divide-slate-100">
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center bg-slate-50/60 px-6 py-16 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              No tasks yet
            </p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Upload a daily site photo, or add a milestone — they appear here as the schedule fills in.
            </p>
          </div>
        )}
        {tasks.map((task) => {
          const position = getTaskPosition(task);
          return (
            <div key={task.id} className="flex items-center">
              <div className="w-36 flex-shrink-0 border-r border-slate-200 p-3 sm:w-48">
                <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-slate-500">{task.percentComplete}%</span>
                  <Badge variant={task.status === 'complete' ? 'default' : task.status === 'delayed' ? 'destructive' : 'blue'} className="text-xs">
                    {getStatusLabel(task.status)}
                  </Badge>
                </div>
              </div>
              <div className="relative flex-1 py-4">
                {/* Background grid */}
                <div className="absolute inset-0 flex">
                  {months.map((month) => (
                    <div
                      key={month.name}
                      className="border-r border-slate-100"
                      style={{ width: `${month.width}%` }}
                    />
                  ))}
                </div>

                {/* Task Bar */}
                <div
                  className="absolute top-1/2 h-8 -translate-y-1/2 rounded-md shadow-sm"
                  style={{
                    left: `${position.left}%`,
                    width: `${position.width}%`,
                    backgroundColor: getZoneColor(task.zoneId),
                  }}
                >
                  {/* Progress overlay */}
                  <div
                    className={`absolute inset-y-0 left-0 rounded-md ${getStatusColor(task.status)}`}
                    style={{ width: `${task.percentComplete}%`, opacity: 0.8 }}
                  />

                  {/* Task label */}
                  <div className="absolute inset-0 flex items-center px-2">
                    <span className="truncate text-xs font-medium text-white drop-shadow">
                      {task.percentComplete}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 bg-slate-50 p-4 text-sm">
        <span className="text-slate-500">Status:</span>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-slate-400" />
          <span>Not Started</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <span>In Progress</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span>Delayed</span>
        </div>
      </div>
      </div>
    </div>
  );
}
