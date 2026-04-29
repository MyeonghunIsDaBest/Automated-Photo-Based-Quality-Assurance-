import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Image, Search, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { Button } from '../../../components/ui/button';
import { useProjectData } from '../hooks/useProjectData';
import { useTableState } from '../hooks/useTableState';
import { DailyLog, Worker } from '../types';
import { SortableHeader } from './SortableHeader';
import { EmptyProjectState } from './EmptyProjectState';

type SubView = 'today' | 'workers' | 'history';
type WorkerSortKey = 'name' | 'role' | 'company' | 'totalHours';

interface ActivityTabProps {
  projectId: string | null;
}

const SUB_VIEWS: { value: SubView; label: string }[] = [
  { value: 'today',   label: 'Today' },
  { value: 'workers', label: 'Workers' },
  { value: 'history', label: 'View All' },
];

export function ActivityTab({ projectId }: ActivityTabProps) {
  const [view, setView] = useState<SubView>('today');
  const data = useProjectData(projectId);

  if (!projectId) {
    return <EmptyProjectState message="Activity (today, workers, history) is project-scoped. Pick a project to begin." />;
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
        {SUB_VIEWS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setView(opt.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              view === opt.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {view === 'today'   && <TodayView log={data.dailyLogs[0]} />}
      {view === 'workers' && <WorkersView workers={data.workers} dailyLogs={data.dailyLogs} />}
      {view === 'history' && <ViewAll logs={data.dailyLogs} />}
    </div>
  );
}

// =================== TODAY ===================

function TodayView({ log }: { log: DailyLog | undefined }) {
  if (!log) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium text-slate-900">No activity logged yet</p>
          <p className="mt-1 text-xs text-slate-500">When the team logs hours and photos, today's snapshot will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Personnel</CardTitle>
          <CardDescription>{format(new Date(log.date), 'MMMM d, yyyy')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {log.personnel.map((person, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="font-medium text-slate-900">{person.name}</p>
                  <p className="text-sm text-slate-500">
                    {person.role} • {person.company}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-emerald-700">
                  {person.hours} hrs
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm font-medium text-slate-700">Total Hours</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{log.hours} hrs</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Photos</CardTitle>
            <CardDescription className="tabular-nums">{log.photos} photos uploaded</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex aspect-square items-center justify-center rounded-lg bg-slate-100">
                  <Image className="h-7 w-7 text-slate-400" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description of Works</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700">{log.description}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =================== WORKERS (with drilldown) ===================

interface WorkerDayEntry {
  date: string;
  hours: number;
  description: string;
  logId: string;
}

function buildWorkerDays(workerName: string, logs: DailyLog[]): WorkerDayEntry[] {
  const out: WorkerDayEntry[] = [];
  for (const log of logs) {
    const match = log.personnel.find((p) => p.name === workerName);
    if (match) {
      out.push({ date: log.date, hours: match.hours, description: log.description, logId: log.id });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function WorkersView({ workers, dailyLogs }: { workers: Worker[]; dailyLogs: DailyLog[] }) {
  const { search, setSearch, sort, toggleSort, applied } = useTableState<Worker, WorkerSortKey>({
    rows: workers,
    searchFields: ['name', 'role', 'company'],
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Worker Times</CardTitle>
            <CardDescription>Hours logged on this project — click a row for date breakdown</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search workers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 pl-10"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-8 px-2 py-2.5"></th>
                <SortableHeader label="Worker" sortKey="name" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Role" sortKey="role" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Company" sortKey="company" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="Total Hours" sortKey="totalHours" sort={sort} onToggle={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applied.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12">
                    <div className="flex flex-col items-center text-center">
                      <Users className="h-10 w-10 text-slate-300" />
                      <p className="mt-3 text-sm font-medium text-slate-900">No workers match your search</p>
                      <p className="text-xs text-slate-500">Try a different name, role, or company.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                applied.map((worker) => {
                  const isOpen = expanded === worker.id;
                  const days = isOpen ? buildWorkerDays(worker.name, dailyLogs) : [];
                  return (
                    <Fragment key={worker.id}>
                      <tr
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setExpanded(isOpen ? null : worker.id)}
                      >
                        <td className="px-2 py-3 text-slate-400">
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={worker.avatar} />
                              <AvatarFallback>{worker.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-slate-900">{worker.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{worker.role}</td>
                        <td className="px-4 py-3 text-slate-600">{worker.company}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{worker.totalHours} hrs</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="px-4 py-4">
                            {days.length === 0 ? (
                              <p className="text-center text-sm text-slate-500">
                                No daily logs recorded for {worker.name} on this project yet.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                <p className="px-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Hours by date — {days.length} day{days.length === 1 ? '' : 's'}
                                </p>
                                <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                                      <tr>
                                        <th className="px-3 py-2">Date</th>
                                        <th className="px-3 py-2">Description</th>
                                        <th className="px-3 py-2 text-right">Hours</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {days.map((d) => (
                                        <tr key={d.logId}>
                                          <td className="px-3 py-2 tabular-nums text-slate-700">
                                            {format(new Date(d.date), 'EEE, MMM d, yyyy')}
                                          </td>
                                          <td className="px-3 py-2 text-slate-600">{d.description}</td>
                                          <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">{d.hours} hrs</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// =================== VIEW ALL (months → days → personnel) ===================

interface MonthBucket {
  key: string; // "2024-02"
  label: string; // "February 2024"
  logs: DailyLog[];
  totalHours: number;
}

function bucketByMonth(logs: DailyLog[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const log of logs) {
    const d = parseISO(log.date);
    const key = format(d, 'yyyy-MM');
    const existing = map.get(key);
    if (existing) {
      existing.logs.push(log);
      existing.totalHours += log.hours;
    } else {
      map.set(key, { key, label: format(d, 'MMMM yyyy'), logs: [log], totalHours: log.hours });
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}

function ViewAll({ logs }: { logs: DailyLog[] }) {
  const months = useMemo(() => bucketByMonth(logs), [logs]);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [logId, setLogId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium text-slate-900">No history yet</p>
          <p className="mt-1 text-xs text-slate-500">Past daily logs will appear here as the team records them.</p>
        </CardContent>
      </Card>
    );
  }

  // Drill 3: a specific day's personnel breakdown
  if (monthKey && logId) {
    const log = logs.find((l) => l.id === logId);
    if (!log) {
      setLogId(null);
      return null;
    }
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => setLogId(null)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back to days
              </Button>
              <CardTitle className="text-lg">{format(new Date(log.date), 'EEEE, MMMM d, yyyy')}</CardTitle>
              <CardDescription className="tabular-nums">
                {log.personnel.length} workers • {log.hours} hrs • {log.photos} photos
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-700">{log.description}</p>
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-2">Worker</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {log.personnel.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.role}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.company}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">{p.hours} hrs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Drill 2: days within selected month
  if (monthKey) {
    const month = months.find((m) => m.key === monthKey);
    if (!month) {
      setMonthKey(null);
      return null;
    }
    return (
      <Card>
        <CardHeader>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 self-start" onClick={() => setMonthKey(null)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back to months
          </Button>
          <CardTitle className="text-lg">{month.label}</CardTitle>
          <CardDescription className="tabular-nums">
            {month.logs.length} logged day{month.logs.length === 1 ? '' : 's'} • {month.totalHours} hrs total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {month.logs
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setLogId(log.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
                >
                  <div>
                    <p className="font-medium text-slate-900">{format(new Date(log.date), 'EEEE, MMMM d')}</p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {log.personnel.length} workers • {log.photos} photos
                    </p>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-600">{log.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                      {log.hours} hrs
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </button>
              ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Drill 1: months
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Daily History</CardTitle>
        <CardDescription className="tabular-nums">
          {months.length} month{months.length === 1 ? '' : 's'} of recorded activity — drill in for daily personnel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMonthKey(m.key)}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
            >
              <div>
                <p className="font-medium text-slate-900">{m.label}</p>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {m.logs.length} day{m.logs.length === 1 ? '' : 's'} • {m.totalHours} hrs
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
