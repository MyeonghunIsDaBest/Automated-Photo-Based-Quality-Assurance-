import { useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, CheckCircle2, CheckSquare, ChevronRight,
  Circle, Clock, ListTodo, Plus, Square, User as UserIcon,
} from 'lucide-react';
import { differenceInDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import type { Project, Task, User, Zone } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useFeatureStore } from '../../../store/features';
import { useAppStore } from '../../../store';
import { useGanttSideStore, usePunchItems } from '../store';
import type { PunchItem } from '../types';
import PunchItemDrawer from './PunchItemDrawer';
import NewPunchItemSheet from './NewPunchItemSheet';

interface PunchListTabProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
}

type Filter = 'open' | 'closed' | 'mine' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open',   label: 'Open' },
  { id: 'mine',   label: 'Mine' },
  { id: 'closed', label: 'Closed' },
  { id: 'all',    label: 'All' },
];

// Sort buckets used by the open-items list. Closed items always render last
// in their own section, regardless of due date.
type Bucket = 'overdue' | 'today' | 'this_week' | 'later' | 'no_due';

const BUCKET_META: Record<Bucket, { label: string; tone: string; icon: typeof Calendar }> = {
  overdue:   { label: 'Overdue',     tone: 'text-red-700 bg-red-50',    icon: AlertTriangle },
  today:     { label: 'Today',       tone: 'text-amber-700 bg-amber-50', icon: Clock },
  this_week: { label: 'This week',   tone: 'text-blue-700 bg-blue-50',   icon: Calendar },
  later:     { label: 'Later',       tone: 'text-slate-600 bg-slate-50', icon: Calendar },
  no_due:    { label: 'No due date', tone: 'text-slate-600 bg-slate-50', icon: Calendar },
};

function bucketFor(item: PunchItem): Bucket {
  if (!item.dueDate) return 'no_due';
  const today = new Date();
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const due = parseISO(item.dueDate);
  const diff = differenceInDays(due, today);
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'today';
  if (due <= weekEnd) return 'this_week';
  return 'later';
}

export function PunchListTab({ project, canEdit, canDelete }: PunchListTabProps) {
  const punchItems = usePunchItems(project.id);
  const tasks = useFeatureStore((s) => s.tasks);
  const zones = useAppStore((s) => s.zones);
  const currentUser = useAppStore((s) => s.currentUser);

  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [drawerItem, setDrawerItem] = useState<PunchItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const projectZones = useMemo(
    () => zones.filter((z) => z.projectId === project.id),
    [zones, project.id],
  );

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const today = new Date();
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

    let open = 0, dueThisWeek = 0, overdue = 0, closed = 0;
    for (const it of punchItems) {
      if (it.status === 'done') { closed += 1; continue; }
      open += 1;
      if (!it.dueDate) continue;
      const due = parseISO(it.dueDate);
      const diff = differenceInDays(due, today);
      if (diff < 0) overdue += 1;
      else if (due <= weekEnd) dueThisWeek += 1;
    }
    return { open, dueThisWeek, overdue, closed };
  }, [punchItems]);

  // ── Filter + search ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return punchItems.filter((it) => {
      if (filter === 'open'   && it.status !== 'open') return false;
      if (filter === 'closed' && it.status !== 'done') return false;
      if (filter === 'mine'   && it.assigneeId !== currentUser?.id) return false;
      if (q) {
        const task = projectTasks.find((t) => t.id === it.taskId);
        const zone = projectZones.find((z) => z.id === it.zoneId);
        const hay = [
          it.text,
          task?.name ?? '',
          zone?.name ?? '',
          it.assigneeId ?? '',
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [punchItems, filter, search, currentUser?.id, projectTasks, projectZones]);

  // ── Group open items into buckets; closed items into their own list ────
  const grouped = useMemo(() => {
    const open: Record<Bucket, PunchItem[]> = {
      overdue: [], today: [], this_week: [], later: [], no_due: [],
    };
    const closed: PunchItem[] = [];
    for (const it of filtered) {
      if (it.status === 'done') closed.push(it);
      else open[bucketFor(it)].push(it);
    }
    // Sort each open bucket by due date ascending; no_due alphabetical.
    for (const b of Object.keys(open) as Bucket[]) {
      if (b === 'no_due') {
        open[b].sort((a, b) => a.text.localeCompare(b.text));
      } else {
        open[b].sort((a, b) => {
          const ad = a.dueDate ? parseISO(a.dueDate).getTime() : Infinity;
          const bd = b.dueDate ? parseISO(b.dueDate).getTime() : Infinity;
          return ad - bd;
        });
      }
    }
    // Closed: most recently closed first.
    closed.sort((a, b) => {
      const ac = a.closedAt ? parseISO(a.closedAt).getTime() : 0;
      const bc = b.closedAt ? parseISO(b.closedAt).getTime() : 0;
      return bc - ac;
    });
    return { open, closed };
  }, [filtered]);

  const openItem = (item: PunchItem) => {
    setDrawerItem(item);
    setDrawerOpen(true);
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Punch List · ${project.name}`}
        title="Loose ends, captured."
        description="Quick-capture items that don't deserve a Gantt task — defects, follow-ups, single-action notes. Tie them to a task or zone for context, set a due date, tick the box when handled."
        action={
          canEdit ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add item
            </Button>
          ) : (
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
              <ListTodo className="h-3.5 w-3.5" />
              Read-only
            </Badge>
          )
        }
      />

      {/* KPIs */}
      <div className="mb-4 -mx-4 overflow-x-auto px-4 pb-1 sm:-mx-0 sm:px-0">
        <div className="flex min-w-max gap-3 sm:grid sm:min-w-0 sm:grid-cols-4">
          <Kpi
            icon={ListTodo}
            label="Open"
            value={String(kpis.open)}
            tone={kpis.open > 0 ? 'slate' : 'emerald'}
          />
          <Kpi
            icon={Calendar}
            label="Due this week"
            value={String(kpis.dueThisWeek)}
            tone={kpis.dueThisWeek > 0 ? 'amber' : 'slate'}
          />
          <Kpi
            icon={AlertTriangle}
            label="Overdue"
            value={String(kpis.overdue)}
            tone={kpis.overdue > 0 ? 'red' : 'slate'}
          />
          <Kpi
            icon={CheckCircle2}
            label="Closed"
            value={String(kpis.closed)}
            tone="emerald"
          />
        </div>
      </div>

      {/* Filters + search */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1.5">
              {FILTERS.map((f) => {
                const isOn = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isOn
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items, task, zone…"
            className="h-9 w-full sm:w-72"
          />
        </CardContent>
      </Card>

      {/* Body */}
      {punchItems.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ListTodo}
              title={`No punch items on ${project.name}.`}
              description={
                canEdit
                  ? 'Capture defects, follow-ups, or quick reminders. Tie each to a task or zone so they\'re easy to find later.'
                  : 'Nothing has been captured yet.'
              }
              action={
                canEdit ? (
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    First item
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ListTodo}
              title={
                filter === 'closed' ? 'Nothing closed yet.' :
                filter === 'mine'   ? 'Nothing assigned to you.' :
                                      'No items match your search.'
              }
              description="Loosen the filter or clear the search."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Open buckets — only render those with items */}
          {(['overdue', 'today', 'this_week', 'later', 'no_due'] as Bucket[]).map((b) => {
            const items = grouped.open[b];
            if (items.length === 0) return null;
            return (
              <Section
                key={b}
                bucket={b}
                items={items}
                tasks={projectTasks}
                zones={projectZones}
                onOpen={openItem}
                onToggle={(it) => useGanttSideStore.getState().togglePunchItem(project.id, it.id)}
                canEdit={canEdit}
              />
            );
          })}

          {/* Closed — only when filter shows them */}
          {grouped.closed.length > 0 && (filter === 'all' || filter === 'closed' || filter === 'mine') && (
            <ClosedSection
              items={grouped.closed}
              tasks={projectTasks}
              zones={projectZones}
              onOpen={openItem}
              onToggle={(it) => useGanttSideStore.getState().togglePunchItem(project.id, it.id)}
              canEdit={canEdit}
            />
          )}
        </div>
      )}

      <PunchItemDrawer
        item={drawerItem}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerItem(null);
        }}
        projectId={project.id}
        tasks={projectTasks}
        zones={projectZones}
        readOnly={!canEdit}
        canDelete={canDelete}
      />

      <NewPunchItemSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={project.id}
        tasks={projectTasks}
        zones={projectZones}
        currentUser={currentUser}
      />
    </>
  );
}

// ─── Open-bucket section ────────────────────────────────────────────────────

function Section({
  bucket, items, tasks, zones, onOpen, onToggle, canEdit,
}: {
  bucket: Bucket;
  items: PunchItem[];
  tasks: Task[];
  zones: Zone[];
  onOpen: (it: PunchItem) => void;
  onToggle: (it: PunchItem) => void;
  canEdit: boolean;
}) {
  const meta = BUCKET_META[bucket];
  const Icon = meta.icon;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${meta.tone}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <PunchRow
                key={it.id}
                item={it}
                task={tasks.find((t) => t.id === it.taskId)}
                zone={zones.find((z) => z.id === it.zoneId)}
                onOpen={() => onOpen(it)}
                onToggle={() => onToggle(it)}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

// ─── Closed-section (collapsed by default would be nice, kept inline for v1) ─

function ClosedSection({
  items, tasks, zones, onOpen, onToggle, canEdit,
}: {
  items: PunchItem[];
  tasks: Task[];
  zones: Zone[];
  onOpen: (it: PunchItem) => void;
  onToggle: (it: PunchItem) => void;
  canEdit: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          Closed
        </span>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <PunchRow
                key={it.id}
                item={it}
                task={tasks.find((t) => t.id === it.taskId)}
                zone={zones.find((z) => z.id === it.zoneId)}
                onOpen={() => onOpen(it)}
                onToggle={() => onToggle(it)}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

// ─── Single row ─────────────────────────────────────────────────────────────

function PunchRow({
  item, task, zone, onOpen, onToggle, canEdit,
}: {
  item: PunchItem;
  task: Task | undefined;
  zone: Zone | undefined;
  onOpen: () => void;
  onToggle: () => void;
  canEdit: boolean;
}) {
  const isDone = item.status === 'done';
  const dueText = item.dueDate
    ? `Due ${format(parseISO(item.dueDate), 'MMM d')}`
    : null;
  const overdueOpen = !isDone && item.dueDate && parseISO(item.dueDate) < new Date();

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canEdit}
        className="mt-0.5 flex-shrink-0 rounded p-0.5 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed"
        aria-label={isDone ? 'Reopen item' : 'Mark done'}
      >
        {isDone
          ? <CheckSquare className="h-5 w-5 text-emerald-600" />
          : <Square      className="h-5 w-5 text-slate-400" />}
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${isDone ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            {item.text}
          </p>

          {(task || zone || dueText || item.assigneeId) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              {task && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                  <Circle className="h-2 w-2 text-slate-400" fill="currentColor" />
                  {task.name}
                </span>
              )}
              {zone && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600"
                  style={{ borderColor: zone.colorCode + '60' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: zone.colorCode }} />
                  {zone.name}
                </span>
              )}
              {item.assigneeId && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
                  <UserIcon className="h-2.5 w-2.5" />
                  {item.assigneeId}
                </span>
              )}
              {dueText && (
                <span className={`tabular-nums ${
                  overdueOpen ? 'text-red-600 font-medium' : 'text-slate-500'
                }`}>
                  {dueText}
                </span>
              )}
            </div>
          )}

          {isDone && item.closedAt && (
            <p className="mt-1 text-[11px] text-slate-400">
              Closed {format(parseISO(item.closedAt), 'MMM d')}
            </p>
          )}
        </div>
        <ChevronRight className="ml-1 mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
      </button>
    </li>
  );
}

// ─── KPI cell ──────────────────────────────────────────────────────────────

function Kpi({
  icon: Icon, label, value, tone,
}: {
  icon: typeof ListTodo;
  label: string;
  value: string;
  tone: 'emerald' | 'amber' | 'red' | 'slate';
}) {
  const before = {
    emerald: 'before:bg-emerald-500',
    amber:   'before:bg-amber-500',
    red:     'before:bg-red-500',
    slate:   'before:bg-slate-400',
  }[tone];

  return (
    <div
      className={`relative flex w-44 flex-shrink-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 before:absolute before:left-0 before:top-0 before:h-1 before:w-10 sm:w-auto sm:p-4 ${before}`}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p
        className="text-2xl font-semibold tabular-nums leading-none text-slate-900 sm:text-3xl"
        style={{ fontFamily: "'Fraunces', Georgia, serif" }}
      >
        {value}
      </p>
    </div>
  );
}