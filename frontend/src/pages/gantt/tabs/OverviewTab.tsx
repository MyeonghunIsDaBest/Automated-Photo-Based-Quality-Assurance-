import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  ClipboardList, FileText, GanttChartSquare, Image as ImageIcon,
  Layers, ListChecks, MessageSquare, Receipt, ShieldCheck,
  ShoppingCart, Sparkles, TrendingUp, Truck, Wallet,
} from 'lucide-react';
import {
  Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import {
  differenceInDays, eachDayOfInterval, endOfMonth, format, isSameDay,
  isWithinInterval, parseISO, startOfMonth,
} from 'date-fns';
import type { Project, Task, User, Zone } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { GanttChart } from '../../../components/ui/GanttChart';
import { useFeatureStore } from '../../../store/features';
import { useGanttSideStore, orderTotal } from '../store';
import { useProjectActivity } from '../lib/useProjectActivity';
import ActivityFeed from '../../../components/activity/ActivityFeed';
import ActivityDetailModal from '../../../components/activity/ActivityDetailModal';
import type { ActivityEvent } from '../../../lib/activity/types';
import { useNavigate } from 'react-router-dom';
import { TabHeader } from '../components/TabHeader';
import type { TabId } from '../types';

interface OverviewTabProps {
  project: Project;
  tasks: Task[];          // already scoped
  zones: Zone[];          // already scoped
  currentUser: User | null;
  canEdit: boolean;
  canDelete: boolean;
  onCreateTask: (newTask: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => Promise<void> | void;
  onSaveTask:   (task: Task) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
  onJumpToTab?: (tabId: TabId) => void;
}

// Hero card mode — the single place we surface schedule/progress shape.
// "trend" overlays the progress curve, "timeline" the Gantt, "calendar" the
// month grid. Merging the three under one card keeps the page from sprouting
// three separate sections that each show the same thing differently.
type HeroMode = 'trend' | 'timeline' | 'calendar';

// The Briefing tab — the default landing surface for a project. Aggregates
// every project-scoped slice (tasks, orders, deliveries, invoices, punch,
// warranties, documents, comments, photos) into a single scroll designed to
// answer "where are we, and what needs me?" without paging.
//
// The activity feed re-renders on a 30s tick so "just now / 2m ago" labels
// stay fresh — the underlying store is already reactive, the tick only
// nudges the timeAgo() formatter.
export function OverviewTab({
  project, tasks, zones, canEdit, onJumpToTab,
}: OverviewTabProps) {
  const navigate = useNavigate();
  const [heroMode, setHeroMode] = useState<HeroMode>('trend');

  // Activity row click → modal-first detail surface. The modal shows the
  // event metadata (who/what/when) and a single "Open detail" action that
  // deep-links to the entity via the shared router. Switching from
  // immediate-navigate to modal-first means the row is "usable" — the user
  // sees full context first, then chooses to drill in.
  const [activeActivityEvent, setActiveActivityEvent] = useState<ActivityEvent | null>(null);

  // ── Live tick — bumps every 30s so relative timestamps stay current ──
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Store reads ───────────────────────────────────────────────────────
  const progressHistory = useFeatureStore((s) => s.progressHistory);
  const documents       = useFeatureStore((s) => s.documents);
  const allComments     = useFeatureStore((s) => s.comments);

  const allOrders     = useGanttSideStore((s) => s.orders);
  const allDeliveries = useGanttSideStore((s) => s.deliveries);
  const allInvoices   = useGanttSideStore((s) => s.invoices);
  const allPunch      = useGanttSideStore((s) => s.punchItems);
  const allWarranties = useGanttSideStore((s) => s.warranties);

  const orders     = useMemo(() => allOrders?.[project.id]     ?? [], [allOrders, project.id]);
  const deliveries = useMemo(() => allDeliveries?.[project.id] ?? [], [allDeliveries, project.id]);
  const invoices   = useMemo(() => allInvoices?.[project.id]   ?? [], [allInvoices, project.id]);
  const punch      = useMemo(() => allPunch?.[project.id]      ?? [], [allPunch, project.id]);
  const warranties = useMemo(() => allWarranties?.[project.id] ?? [], [allWarranties, project.id]);

  const projectFiles = useMemo(
    () => documents.filter((d) => d.projectId === project.id),
    [documents, project.id],
  );

  // Notes/comments scoped to the project's tasks. Comments only carry a
  // taskId, so we walk the task list to figure out which ones belong here.
  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const projectComments = useMemo(
    () => allComments.filter((c) => c.taskId && taskIds.has(c.taskId)),
    [allComments, taskIds],
  );

  // 12 events instead of 8 — the feed has more vertical real estate now and
  // two-tabs-of-history reads better than a single screen.
  const activity = useProjectActivity(project.id, { limit: 12 });

  // ── Briefing math ────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const total = tasks.length;
    const overall = total
      ? Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / total)
      : 0;

    const today = new Date();
    const delayed = tasks.filter(
      (t) => parseISO(t.endDate) < today && t.percentComplete < 100,
    ).length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const notStarted = tasks.filter((t) => t.status === 'not_started').length;
    const blocked    = tasks.filter((t) => t.status === 'blocked').length;
    const complete   = tasks.filter((t) => t.status === 'complete').length;

    const ordersOpen = orders.filter((o) => o.status !== 'received' && o.status !== 'cancelled').length;
    const ordersPending = orders.filter(
      (o) => o.status === 'submitted' || o.status === 'confirmed',
    ).length;
    const ordersCommitted = orders.reduce((sum, o) => sum + orderTotal(o), 0);

    const deliveriesPending = orders.filter(
      (o) => o.status === 'submitted' || o.status === 'confirmed' || o.status === 'partial',
    ).length;
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const deliveriesThisWeek = deliveries.filter((d) => Date.parse(d.receivedDate) > sevenDaysAgo).length;

    const invoicesOutstanding = invoices
      .filter((i) => i.status !== 'paid')
      .reduce((sum, i) => sum + i.amount, 0);
    const invoicesPaid = invoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + i.amount, 0);
    const invoicesOverdue = invoices.filter((i) => i.status === 'overdue').length;
    const invoicesPending = invoices.filter((i) => i.status === 'pending').length;

    const punchOpen = punch.filter((p) => p.status === 'open').length;
    const openIssues = delayed + punchOpen;

    // Warranties expiring within 60 days.
    const sixtyDays = today.getTime() + 60 * 24 * 3600 * 1000;
    const warrantiesExpiringSoon = warranties.filter((w) => {
      const exp = Date.parse(w.expiryDate);
      return Number.isFinite(exp) && exp >= today.getTime() && exp <= sixtyDays;
    });

    // Progress delta vs ~7 days ago.
    const projectTrend = progressHistory.slice(-30);
    const oldPoint = projectTrend[Math.max(0, projectTrend.length - 8)];
    const latest = projectTrend[projectTrend.length - 1];
    const deltaWeek = oldPoint && latest ? latest.progress - oldPoint.progress : 0;

    const daysRemaining = Math.max(
      0,
      differenceInDays(parseISO(project.endDate), today),
    );

    const scheduleHealth: 'on_track' | 'at_risk' | 'behind' =
      delayed === 0 ? 'on_track' :
      delayed <= 2 ? 'at_risk' :
                     'behind';

    return {
      total, overall, deltaWeek, complete, inProgress, notStarted, blocked, delayed,
      ordersOpen, ordersPending, ordersCommitted,
      deliveriesPending, deliveriesThisWeek,
      invoicesOutstanding, invoicesPaid, invoicesOverdue, invoicesPending,
      punchOpen, openIssues,
      warrantiesExpiringSoon,
      daysRemaining, scheduleHealth,
      trend: projectTrend,
    };
  }, [tasks, orders, deliveries, invoices, punch, warranties, project.endDate, progressHistory]);

  // Empty state used to bail to a separate `SetupGuide` panel — but the user-
  // facing Overview is more useful when the layout is *always* present and the
  // individual cards carry their own zero-states. The KPI tiles already render
  // "0%" / "0" cleanly; the Activity feed shows its own empty caption; the
  // hero card is happy with an empty task list. So drop the gate and let the
  // structure carry through.
  const hasData = totals.total > 0 || orders.length > 0 || invoices.length > 0;

  const dateRange = project.startDate && project.endDate
    ? `${format(parseISO(project.startDate), 'MMM d, yyyy')} → ${format(parseISO(project.endDate), 'MMM d, yyyy')}`
    : '—';

  return (
    <>
      <TabHeader
        eyebrow="Workspace · Overview"
        title={project.name}
        description={`${dateRange} · ${totals.daysRemaining} day${totals.daysRemaining === 1 ? '' : 's'} remaining`}
        action={
          <Badge
            variant="outline"
            className={`whitespace-nowrap px-3 py-1 text-[10px] uppercase tracking-wider ${statusBadge(project.status)}`}
          >
            {project.status?.replace('_', ' ') ?? 'active'}
          </Badge>
        }
      />

      {!hasData && (
        <SetupGuide
          project={project}
          canEdit={canEdit}
          onJumpToTab={onJumpToTab}
        />
      )}

      {/* ── Top KPI strip ────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCell
          icon={TrendingUp}
          label="Overall progress"
          value={`${totals.overall}%`}
          accent="emerald"
          caption={
            totals.deltaWeek === 0
              ? 'No change this week'
              : `${totals.deltaWeek > 0 ? '+' : ''}${totals.deltaWeek}% this week`
          }
        />
        <KpiCell
          icon={Activity}
          label="Schedule"
          value={
            totals.scheduleHealth === 'on_track' ? 'On track' :
            totals.scheduleHealth === 'at_risk'  ? 'At risk'  : 'Behind'
          }
          accent={
            totals.scheduleHealth === 'on_track' ? 'emerald' :
            totals.scheduleHealth === 'at_risk'  ? 'amber'   : 'red'
          }
          caption={`${totals.delayed} delayed · ${totals.complete} complete`}
        />
        <KpiCell
          icon={ListChecks}
          label="Tasks"
          value={String(totals.total)}
          accent="slate"
          caption={`${totals.inProgress} in progress · ${totals.notStarted} not started`}
        />
        <KpiCell
          icon={AlertTriangle}
          label="Open issues"
          value={String(totals.openIssues)}
          accent={totals.openIssues > 0 ? 'red' : 'emerald'}
          caption={`${totals.delayed} delayed · ${totals.punchOpen} punch`}
        />
      </div>

      {/* ── Hero: Schedule & progress (Trend ⇆ Timeline ⇆ Calendar) ─ */}
      <Card className="mb-6 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5 sm:py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Schedule &amp; progress
              </p>
              <h3
                className="mt-1 text-lg font-medium leading-tight text-slate-900 sm:text-xl"
                style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em', textWrap: 'balance' }}
              >
                {heroMode === 'trend'    ? 'Progress trend.'   :
                 heroMode === 'timeline' ? 'Timeline view.'    : 'Calendar view.'}
              </h3>
            </div>
            <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
              <ModeButton
                active={heroMode === 'trend'}
                onClick={() => setHeroMode('trend')}
                icon={TrendingUp}
                label="Trend"
              />
              <ModeButton
                active={heroMode === 'timeline'}
                onClick={() => setHeroMode('timeline')}
                icon={GanttChartSquare}
                label="Timeline"
              />
              <ModeButton
                active={heroMode === 'calendar'}
                onClick={() => setHeroMode('calendar')}
                icon={CalendarIcon}
                label="Calendar"
              />
            </div>
          </div>

          {heroMode === 'trend' && (
            <TrendBody trend={totals.trend} overall={totals.overall} delta={totals.deltaWeek} />
          )}
          {heroMode === 'timeline' && (
            <div className="p-2 sm:p-3">
              <GanttChart
                tasks={tasks}
                startDate={project.startDate}
                endDate={project.endDate}
              />
            </div>
          )}
          {heroMode === 'calendar' && (
            <CalendarMode tasks={tasks} zones={zones} />
          )}
        </CardContent>
      </Card>

      {/* ── Mid grid: Finance · Task breakdown · Watchlist ──────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FinanceCard
          ordersOpen={totals.ordersOpen}
          ordersPending={totals.ordersPending}
          ordersCommitted={totals.ordersCommitted}
          deliveriesPending={totals.deliveriesPending}
          deliveriesThisWeek={totals.deliveriesThisWeek}
          invoicesOutstanding={totals.invoicesOutstanding}
          invoicesPaid={totals.invoicesPaid}
          invoicesOverdue={totals.invoicesOverdue}
          invoicesPending={totals.invoicesPending}
          onJumpToTab={onJumpToTab}
        />

        <TaskBreakdownCard
          total={totals.total}
          inProgress={totals.inProgress}
          notStarted={totals.notStarted}
          complete={totals.complete}
          delayed={totals.delayed}
          blocked={totals.blocked}
          onJumpToTab={onJumpToTab}
        />

        <WatchlistCard
          punchOpen={totals.punchOpen}
          warrantiesExpiringSoon={totals.warrantiesExpiringSoon.length}
          daysRemaining={totals.daysRemaining}
          endDate={project.endDate}
          onJumpToTab={onJumpToTab}
        />
      </div>

      {/* ── Bottom grid: Activity · (Files + Notes) ─────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <h3 className="text-sm font-medium text-slate-900">Live activity</h3>
              </div>
              <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-400">
                {activity.length} latest
              </span>
            </div>
            <ActivityFeed
              events={activity}
              onSelect={(e) => setActiveActivityEvent(e)}
              emptyLabel="Nothing has happened on this project yet."
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <RecentFilesCard files={projectFiles} onJumpToTab={onJumpToTab} />
          <RecentNotesCard
            comments={projectComments}
            tasks={tasks}
            onJumpToTab={onJumpToTab}
          />
        </div>
      </div>

      <ActivityDetailModal
        event={activeActivityEvent}
        projectId={project.id}
        navigate={navigate}
        onClose={() => setActiveActivityEvent(null)}
      />
    </>
  );
}

// ─── Setup guide for empty projects ─────────────────────────────────────

function SetupGuide({
  project, canEdit, onJumpToTab,
}: {
  project: Project;
  canEdit: boolean;
  onJumpToTab?: (tabId: TabId) => void;
}) {
  const steps: { tabId: TabId; icon: typeof ListChecks; title: string; body: string }[] = [
    {
      tabId: 'tasks',
      icon: ListChecks,
      title: 'Add tasks to your schedule',
      body: 'Build the spine of the project. Tasks become Gantt bars and feed the progress trend.',
    },
    {
      tabId: 'orders',
      icon: ShoppingCart,
      title: 'Place your first order',
      body: 'Track supplies from PO through delivery. Receipts auto-update order status.',
    },
    {
      tabId: 'plans',
      icon: Layers,
      title: 'Upload baseline drawings',
      body: 'Drop the latest plan set so the team has one source of truth.',
    },
    {
      tabId: 'site_diary',
      icon: ClipboardList,
      title: 'Log day one',
      body: 'Capture who was on site, what got done, and what came up.',
    },
  ];

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
          Set up
        </p>
        <h3
          className="mt-2 text-xl font-semibold text-slate-900 sm:text-2xl"
          style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em', textWrap: 'balance' }}
        >
          A clean slate for {project.name}.
        </h3>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          {canEdit
            ? 'Knock these out in any order — the Overview fills out as you go.'
            : 'The project lead is still setting things up. Check back shortly.'}
        </p>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.tabId}>
                <button
                  type="button"
                  onClick={() => onJumpToTab?.(s.tabId)}
                  disabled={!canEdit}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-emerald-300 hover:shadow-sm active:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{s.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{s.body}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Hero bodies ────────────────────────────────────────────────────────

function TrendBody({
  trend, overall, delta,
}: { trend: { date: string; progress: number }[]; overall: number; delta: number }) {
  if (trend.length <= 1) {
    return (
      <div className="px-4 py-12 text-center text-sm text-slate-400 sm:px-5">
        No progress history yet — log a task update to start the curve.
      </div>
    );
  }
  return (
    <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-slate-500">Last {trend.length} datapoints</p>
        <div className="flex items-baseline gap-2">
          <span
            className="whitespace-nowrap text-2xl font-semibold tabular-nums text-emerald-600 sm:text-3xl"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            {overall}%
          </span>
          <span
            className={`text-xs font-medium tabular-nums ${
              delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-slate-400'
            }`}
          >
            {delta === 0 ? 'flat' : `${delta > 0 ? '+' : ''}${delta}% wk`}
          </span>
        </div>
      </div>
      <div className="h-40 sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="ovProg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#10B981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(d: string) => format(parseISO(d), 'MMM d')}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              domain={[0, 100]}
              ticks={[0, 50, 100]}
            />
            <RTooltip
              contentStyle={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={((v: number) => [`${v}%`, 'Progress']) as never}
              labelFormatter={((d: string) => format(parseISO(d), 'MMM d, yyyy')) as never}
            />
            <Area
              type="monotone"
              dataKey="progress"
              stroke="#10B981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#ovProg)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Calendar mode ──────────────────────────────────────────────────────

function CalendarMode({ tasks, zones }: { tasks: Task[]; zones: Zone[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState(today);
  const monthStart = startOfMonth(cursor);
  const monthEnd   = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const zoneById = new Map(zones.map((z) => [z.id, z]));

  // Pad the grid to align Mondays in column 1.
  const firstDow = monthStart.getDay();    // 0 = Sun
  const padBefore = (firstDow + 6) % 7;    // align Mon-first
  const cells: (Date | null)[] = [
    ...Array.from({ length: padBefore }, () => null),
    ...days,
  ];

  const tasksOn = (d: Date) =>
    tasks.filter((t) =>
      isWithinInterval(d, { start: parseISO(t.startDate), end: parseISO(t.endDate) }),
    );

  const DOWS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const DOWS_LONG  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="p-2 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3
          className="min-w-0 truncate text-sm font-medium text-slate-900 sm:text-base"
          style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
        >
          {format(cursor, 'MMMM yyyy')}
        </h3>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 active:bg-slate-100"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
        {DOWS_LONG.map((dow, i) => (
          <div
            key={dow + i}
            className="bg-slate-50 px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500"
          >
            <span className="hidden sm:inline">{dow}</span>
            <span className="sm:hidden">{DOWS_SHORT[i]}</span>
          </div>
        ))}

        {cells.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} className="min-h-[56px] bg-white sm:min-h-[80px]" />;
          const ts = tasksOn(d);
          const isToday = isSameDay(d, today);
          const visible = ts.slice(0, 2);
          return (
            <div
              key={d.toISOString()}
              className={`min-h-[56px] bg-white p-1 sm:min-h-[80px] sm:p-1.5 ${
                isToday ? 'ring-1 ring-inset ring-emerald-400' : ''
              }`}
            >
              <p
                className={`mb-1 text-[10px] font-medium tabular-nums sm:text-[11px] ${
                  isToday ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {format(d, 'd')}
              </p>
              <div className="space-y-0.5">
                {visible.map((t) => (
                  <div
                    key={t.id}
                    className="truncate rounded px-1 py-0.5 text-[9px] text-white sm:text-[10px]"
                    style={{ backgroundColor: zoneById.get(t.zoneId ?? '')?.colorCode ?? '#64748b' }}
                    title={`${t.name} — ${t.percentComplete}%`}
                  >
                    {t.name}
                  </div>
                ))}
                {ts.length > visible.length && (
                  <p className="text-[9px] text-slate-400">+{ts.length - visible.length}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mid-grid cards ─────────────────────────────────────────────────────

function FinanceCard({
  ordersOpen, ordersPending, ordersCommitted,
  deliveriesPending, deliveriesThisWeek,
  invoicesOutstanding, invoicesPaid, invoicesOverdue, invoicesPending,
  onJumpToTab,
}: {
  ordersOpen: number; ordersPending: number; ordersCommitted: number;
  deliveriesPending: number; deliveriesThisWeek: number;
  invoicesOutstanding: number; invoicesPaid: number; invoicesOverdue: number; invoicesPending: number;
  onJumpToTab?: (t: TabId) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-medium text-slate-900">Finance</h3>
        </div>

        <div className="space-y-2.5">
          <FinanceRow
            icon={ShoppingCart}
            label="Open orders"
            primary={`${ordersOpen} open`}
            secondary={`${ordersPending} pending · ${fmtUSD(ordersCommitted)} committed`}
            onClick={() => onJumpToTab?.('orders')}
          />
          <FinanceRow
            icon={Truck}
            label="Deliveries"
            primary={`${deliveriesPending} awaiting`}
            secondary={`${deliveriesThisWeek} received this week`}
            onClick={() => onJumpToTab?.('deliveries')}
          />
          <FinanceRow
            icon={Receipt}
            label="Invoices"
            primary={`${fmtUSD(invoicesOutstanding)} outstanding`}
            secondary={`${invoicesOverdue} overdue · ${invoicesPending} pending · ${fmtUSD(invoicesPaid)} paid`}
            tone={invoicesOverdue > 0 ? 'red' : 'slate'}
            onClick={() => onJumpToTab?.('invoices')}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FinanceRow({
  icon: Icon, label, primary, secondary, onClick, tone = 'slate',
}: {
  icon: typeof ShoppingCart; label: string; primary: string; secondary: string;
  onClick?: () => void; tone?: 'slate' | 'red';
}) {
  const toneText = tone === 'red' ? 'text-red-700' : 'text-slate-900';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-left transition-all hover:border-slate-200 hover:bg-white hover:shadow-sm"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-white text-slate-500 group-hover:text-emerald-600">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className={`truncate text-sm font-medium ${toneText}`}>{primary}</p>
        <p className="truncate text-[11px] text-slate-500">{secondary}</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300 transition-colors group-hover:text-emerald-500" />
    </button>
  );
}

function TaskBreakdownCard({
  total, inProgress, notStarted, complete, delayed, blocked, onJumpToTab,
}: {
  total: number; inProgress: number; notStarted: number;
  complete: number; delayed: number; blocked: number;
  onJumpToTab?: (t: TabId) => void;
}) {
  const segments: { label: string; value: number; color: string }[] = [
    { label: 'Complete',    value: complete,    color: '#10B981' },
    { label: 'In progress', value: inProgress,  color: '#3B82F6' },
    { label: 'Not started', value: notStarted,  color: '#94a3b8' },
    { label: 'Delayed',     value: delayed,     color: '#EF4444' },
    { label: 'Blocked',     value: blocked,     color: '#1f2937' },
  ];
  const denom = Math.max(1, total);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-900">Task breakdown</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToTab?.('tasks')}
            className="text-[11px] font-medium text-emerald-600 transition-colors hover:text-emerald-700"
          >
            View all →
          </button>
        </div>

        {/* Stacked status bar */}
        <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
          {segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                style={{ width: `${(s.value / denom) * 100}%`, backgroundColor: s.color }}
                title={`${s.label}: ${s.value}`}
              />
            ) : null,
          )}
        </div>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate text-slate-600">{s.label}</span>
              </span>
              <span className="tabular-nums font-medium text-slate-900">{s.value}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="tabular-nums font-medium text-slate-900">{total}</span> total task{total === 1 ? '' : 's'}
        </div>
      </CardContent>
    </Card>
  );
}

function WatchlistCard({
  punchOpen, warrantiesExpiringSoon, daysRemaining, endDate, onJumpToTab,
}: {
  punchOpen: number; warrantiesExpiringSoon: number;
  daysRemaining: number; endDate: string;
  onJumpToTab?: (t: TabId) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-medium text-slate-900">Watchlist</h3>
        </div>

        <div className="space-y-2.5">
          <WatchRow
            icon={ClipboardList}
            label="Punch list"
            value={String(punchOpen)}
            sub={punchOpen === 0 ? 'All clear' : `${punchOpen} open item${punchOpen === 1 ? '' : 's'}`}
            tone={punchOpen > 0 ? 'amber' : 'emerald'}
          />
          <WatchRow
            icon={ShieldCheck}
            label="Warranties"
            value={String(warrantiesExpiringSoon)}
            sub={warrantiesExpiringSoon === 0 ? 'None expiring soon' : `Expiring in 60 days`}
            tone={warrantiesExpiringSoon > 0 ? 'amber' : 'slate'}
            onClick={() => onJumpToTab?.('warranties')}
          />
          <WatchRow
            icon={CalendarIcon}
            label="Deadline"
            value={`${daysRemaining}d`}
            sub={`Ends ${format(parseISO(endDate), 'MMM d, yyyy')}`}
            tone={daysRemaining < 14 ? 'red' : daysRemaining < 30 ? 'amber' : 'slate'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function WatchRow({
  icon: Icon, label, value, sub, tone, onClick,
}: {
  icon: typeof ClipboardList; label: string; value: string; sub: string;
  tone: 'slate' | 'amber' | 'red' | 'emerald';
  onClick?: () => void;
}) {
  const toneClasses = {
    slate:   'text-slate-900',
    amber:   'text-amber-700',
    red:     'text-red-700',
    emerald: 'text-emerald-700',
  }[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-left transition-all ${
        onClick ? 'hover:border-slate-200 hover:bg-white hover:shadow-sm' : ''
      }`}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-white text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className={`text-sm font-semibold tabular-nums ${toneClasses}`}>{value}</p>
        <p className="truncate text-[11px] text-slate-500">{sub}</p>
      </div>
      {onClick && <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300 transition-colors group-hover:text-emerald-500" />}
    </Comp>
  );
}

// ─── Bottom-grid cards ──────────────────────────────────────────────────

function RecentFilesCard({
  files, onJumpToTab,
}: {
  files: { id: string; name: string; type: 'document' | 'photo' | 'video'; uploadedAt: string; size: number }[];
  onJumpToTab?: (t: TabId) => void;
}) {
  const recent = useMemo(
    () => [...files].sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)).slice(0, 4),
    [files],
  );
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-900">Recent files</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToTab?.('files')}
            className="text-[11px] font-medium text-emerald-600 transition-colors hover:text-emerald-700"
          >
            View all →
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">
            No files uploaded yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((f) => {
              const Icon = f.type === 'photo' ? ImageIcon : FileText;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToTab?.('files')}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-900">{f.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {fmtBytes(f.size)} · {timeAgo(f.uploadedAt)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentNotesCard({
  comments, tasks, onJumpToTab,
}: {
  comments: { id: string; taskId?: string; userName: string; content: string; createdAt: string }[];
  tasks: Task[];
  onJumpToTab?: (t: TabId) => void;
}) {
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const recent = useMemo(
    () => [...comments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4),
    [comments],
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-900">Recent notes</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToTab?.('tasks')}
            className="text-[11px] font-medium text-emerald-600 transition-colors hover:text-emerald-700"
          >
            View all →
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">
            No notes on this project yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((c) => {
              const taskName = c.taskId ? taskById.get(c.taskId)?.name : undefined;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onJumpToTab?.('tasks')}
                    className="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium text-slate-700">{c.userName}</span>
                      <span className="flex-shrink-0 text-slate-400">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-600">{c.content}</p>
                    {taskName && (
                      <span className="truncate text-[10px] uppercase tracking-wider text-slate-400">
                        on {taskName}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function KpiCell({
  icon: Icon, label, value, caption, accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  caption: string;
  accent: 'emerald' | 'amber' | 'red' | 'slate';
}) {
  const accentBar = {
    emerald: 'bg-emerald-500',
    amber:   'bg-amber-500',
    red:     'bg-red-500',
    slate:   'bg-slate-400',
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className={`absolute left-0 top-0 h-1 w-10 ${accentBar}`} aria-hidden="true" />
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-slate-500" />
        <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
      <p
        className="truncate text-2xl font-semibold tabular-nums leading-none text-slate-900 sm:text-3xl"
        style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        title={value}
      >
        {value}
      </p>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
        {caption}
      </p>
    </div>
  );
}

function ModeButton({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: typeof CalendarIcon; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors ${
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  n === 0
    ? '$0'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function statusBadge(status: string | undefined): string {
  switch (status) {
    case 'on_hold':   return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'completed': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'archived':  return 'border-slate-200 bg-slate-50 text-slate-600';
    case 'active':
    default:          return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return format(parseISO(iso), 'MMM d');
  const m = Math.floor(ms / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return format(parseISO(iso), 'MMM d');
}
