import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowUp, CheckSquare,
  ChevronRight, ClipboardList, Clock, DollarSign, Eye, FileText,
  GanttChartSquare, Image as ImageIcon, Layers, ListChecks,
  Plus, Receipt, ShieldCheck, ShoppingCart, SquarePen, TrendingUp,
  Truck, Upload as UploadIcon,
} from 'lucide-react';
import {
  Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project, Task, User, Zone } from '../../../types';
import { SplitPaneGantt } from '../../../components/ui/SplitPaneGantt';
import { useFeatureStore } from '../../../store/features';
import { useGanttSideStore, orderTotal, useDiaryEntries } from '../store';
import { isVisibleEntry } from './sitediary/diaryRowMapper';
import { useProjectActivity } from '../lib/useProjectActivity';
import ActivityDetailModal from '../../../components/activity/ActivityDetailModal';
import { LiveActivityCard } from './LiveActivityCard';
import type { ActivityEvent } from '../../../lib/activity/types';
import { useNavigate } from 'react-router-dom';
import { LedgerHeader, StatusPill, cardShell, type ToneKey } from '../components/ledger';
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
type HeroMode = 'trend' | 'timeline';

// The Briefing tab — the default landing surface for a project. Aggregates
// every project-scoped slice (tasks, orders, deliveries, invoices, punch,
// warranties, documents, comments, photos) into a single scroll designed to
// answer "where are we, and what needs me?" without paging.
//
// The activity feed re-renders on a 30s tick so "just now / 2m ago" labels
// stay fresh — the underlying store is already reactive, the tick only
// nudges the timeAgo() formatter.
export function OverviewTab({
  project, tasks, zones, currentUser, canEdit, onJumpToTab,
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

  // Recent notes now surface Site Diary entries (see RecentNotesCard) — task
  // comments are no longer aggregated here.

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

    // Schedule health folds in planned-vs-actual variance (the same baseline the
    // trend chart draws), not just overdue tasks — so the card and the chart
    // agree. variance = actual overall − where the linear schedule says we should
    // be by today (+ ahead, − behind).
    const startMs = parseISO(project.startDate).getTime();
    const endMs = Math.max(startMs + 86_400_000, parseISO(project.endDate).getTime());
    const todayMs = Math.min(endMs, Math.max(startMs, today.getTime()));
    const plannedPct = Math.round(clampPct(((todayMs - startMs) / (endMs - startMs)) * 100));
    const variance = overall - plannedPct;

    const scheduleHealth: 'on_track' | 'at_risk' | 'behind' =
      (variance <= -15 || delayed > 2) ? 'behind' :
      (variance <= -7  || delayed >= 1) ? 'at_risk' :
                                          'on_track';

    return {
      total, overall, deltaWeek, complete, inProgress, notStarted, blocked, delayed,
      ordersOpen, ordersPending, ordersCommitted,
      deliveriesPending, deliveriesThisWeek,
      invoicesOutstanding, invoicesPaid, invoicesOverdue, invoicesPending,
      punchOpen, openIssues,
      warrantiesExpiringSoon,
      daysRemaining, scheduleHealth, plannedPct, variance,
      trend: projectTrend,
    };
  }, [tasks, orders, deliveries, invoices, punch, warranties, project.startDate, project.endDate, progressHistory]);

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
      <LedgerHeader
        kicker="OVR"
        icon={GanttChartSquare}
        eyebrow={`Overview · ${project.name}`}
        title={project.name}
        meta={`${dateRange} · ${totals.daysRemaining} day${totals.daysRemaining === 1 ? '' : 's'} remaining`}
        actions={
          <StatusPill tone={statusTone(project.status)} className="px-3 py-1 uppercase tracking-wider">
            {project.status?.replace('_', ' ') ?? 'active'}
          </StatusPill>
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
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <KpiCell
          icon={TrendingUp}
          label="Overall progress"
          value={String(totals.overall)}
          unit="%"
          accent="emerald"
          delta={
            totals.deltaWeek !== 0
              ? { value: totals.deltaWeek, suffix: '% wk' }
              : undefined
          }
          caption={
            totals.deltaWeek === 0
              ? 'Trend flat · last 7 datapoints'
              : `Trending ${totals.deltaWeek > 0 ? 'up' : 'down'} · last 7 datapoints`
          }
        />
        <KpiCell
          icon={CheckSquare}
          label="Schedule"
          value={
            totals.scheduleHealth === 'on_track' ? 'On track' :
            totals.scheduleHealth === 'at_risk'  ? 'At risk'  : 'Behind'
          }
          accent={
            totals.scheduleHealth === 'on_track' ? 'emerald' :
            totals.scheduleHealth === 'at_risk'  ? 'amber'   : 'red'
          }
          caption={`${
            totals.variance < 0 ? `${Math.abs(totals.variance)}% behind`
            : totals.variance > 0 ? `${totals.variance}% ahead`
            : 'On plan'
          } · ${totals.delayed} delayed`}
        />
        <KpiCell
          icon={ListChecks}
          label="Tasks"
          value={String(totals.total)}
          accent="amber"
          caption={`${totals.inProgress} in progress · ${totals.notStarted} not started`}
        />
        <KpiCell
          icon={AlertTriangle}
          label="Open issues"
          value={String(totals.openIssues)}
          accent={totals.openIssues > 0 ? 'red' : 'slate'}
          caption={`${totals.delayed} delayed · ${totals.punchOpen} in punch list`}
        />
      </div>

      {/* ── Hero: Schedule & progress (Trend ⇆ Timeline ⇆ Calendar) ─ */}
      <div className="mb-4 overflow-hidden rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        <div className="flex flex-col gap-2 border-b border-[#EFEBE0] px-5 py-3.5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">
              Schedule &amp; progress
            </p>
            <h3
              className="mt-0.5 text-[22px] font-medium leading-tight text-[#1A1A1A]"
              style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em', textWrap: 'balance' }}
            >
              {heroMode === 'trend' ? 'Progress trend.' : 'Timeline view.'}
            </h3>
          </div>
          {/* Segmented mode toggle — pill group */}
          <div className="inline-flex items-center self-start rounded-full border border-[#E6E1D4] bg-[#FAF8F2] p-1 gap-0.5">
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
          </div>
        </div>

        {heroMode === 'trend' && (
          <TrendBody
            start={project.startDate}
            end={project.endDate}
            history={totals.trend}
            overall={totals.overall}
            delta={totals.deltaWeek}
          />
        )}
        {heroMode === 'timeline' && (
          <div className="p-2 sm:p-3">
            <SplitPaneGantt
              tasks={tasks}
              zones={zones}
              startDate={project.startDate}
              endDate={project.endDate}
              maxHeight="60vh"
            />
          </div>
        )}
      </div>

      {/* ── Mid grid: Finance · Task breakdown · Watchlist ──────── */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveActivityCard
            events={activity}
            onSelect={(e) => setActiveActivityEvent(e)}
            emptyLabel="Nothing has happened on this project yet."
          />
        </div>

        <div className="flex flex-col gap-3">
          <RecentFilesCard
            files={projectFiles}
            project={project}
            currentUser={currentUser}
            onJumpToTab={onJumpToTab}
          />
          <RecentNotesCard
            projectId={project.id}
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
    <div className={`mb-4 p-4 sm:p-6 ${cardShell}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B6B6B]">Set up</p>
      <h3
        className="mt-2 text-xl font-medium text-[#1A1A1A] sm:text-2xl"
        style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em', textWrap: 'balance' }}
      >
        A clean slate for {project.name}.
      </h3>
      <p className="mt-2 max-w-md text-[13px] text-[#6B6B6B]">
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
                className="flex w-full items-start gap-3 rounded-[12px] border border-[#E6E1D4] bg-white p-4 text-left transition-all hover:border-[#2F8F5C] hover:bg-[#FAF8F2] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#E5F2EA] text-[#246F47]">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#1A1A1A]">{s.title}</p>
                  <p className="mt-0.5 text-[12px] text-[#6B6B6B]">{s.body}</p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#C9C3B4]" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Hero bodies ────────────────────────────────────────────────────────

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

// Build the two-line series for the progress trend over the project window:
//   • planned (red dashed) — the straight baseline 0%→100% from start to end,
//     i.e. where the schedule says you "should" be by any given date.
//   • actual (green) — the real cumulative progress from progressHistory,
//     anchored to the live overall % at today.
// Always returns a usable series, even with no history (green sits at the
// current overall, planned rises toward the deadline — so "behind" reads as a
// green line under the red one).
function buildPlannedVsActual(
  startMs: number, endMs: number, todayMs: number,
  history: { date: string; progress: number }[], overall: number,
): { t: number; planned?: number; actual?: number }[] {
  const span = Math.max(1, endMs - startMs);
  const plannedAt = (ms: number) => clampPct(((ms - startMs) / span) * 100);
  const map = new Map<number, { t: number; planned?: number; actual?: number }>();
  const put = (t: number, patch: Partial<{ planned: number; actual: number }>) =>
    map.set(t, { t, ...(map.get(t) ?? {}), ...patch });

  put(startMs, { planned: 0 });
  put(todayMs, { planned: plannedAt(todayMs) });
  put(endMs, { planned: 100 });

  const pts = history
    .map((h) => ({ t: parseISO(h.date).getTime(), v: h.progress }))
    .filter((p) => Number.isFinite(p.t))
    .map((p) => ({ t: Math.min(endMs, Math.max(startMs, p.t)), v: p.v }))
    .sort((a, b) => a.t - b.t);
  if (pts.length === 0) put(startMs, { actual: 0 });
  for (const p of pts) put(p.t, { actual: p.v });
  put(todayMs, { actual: overall });

  return [...map.values()].sort((a, b) => a.t - b.t);
}

function TrendBody({
  start, end, history, overall, delta,
}: {
  start: string;
  end: string;
  history: { date: string; progress: number }[];
  overall: number;
  delta: number;
}) {
  const startMs = parseISO(start).getTime();
  const endMs = Math.max(startMs + 86_400_000, parseISO(end).getTime());
  const todayMs = Math.min(endMs, Math.max(startMs, Date.now()));
  const plannedToday = Math.round(clampPct(((todayMs - startMs) / Math.max(1, endMs - startMs)) * 100));
  const aheadBy = overall - plannedToday;
  const onTrack = aheadBy >= 0;

  const data = useMemo(
    () => buildPlannedVsActual(startMs, endMs, todayMs, history, overall),
    [startMs, endMs, todayMs, history, overall],
  );

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="text-[34px] font-medium leading-none tabular-nums text-[#1A1A1A]"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {overall}%
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                onTrack ? 'bg-[#E0EBE3] text-[#246F47]' : 'bg-[#FBE5E5] text-[#C44545]'
              }`}
            >
              <ArrowUp className={`h-3 w-3 ${onTrack ? '' : 'rotate-180'}`} />
              {onTrack ? (aheadBy === 0 ? 'On track' : `${aheadBy}% ahead`) : `${Math.abs(aheadBy)}% behind`}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] text-[#A0A0A0]">
            Schedule says {plannedToday}% by today
            {delta !== 0 ? ` · ${delta > 0 ? '+' : ''}${delta}% this week` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#6B6B6B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2F8F5C]" aria-hidden />Actual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[#C44545]" aria-hidden />Planned
          </span>
        </div>
      </div>
      <div className="h-40 sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="ovProg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#2F8F5C" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#2F8F5C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[startMs, endMs]}
              tick={{ fontSize: 10, fill: '#A0A0A0' }}
              tickFormatter={(ms: number) => format(new Date(ms), 'MMM d')}
              tickCount={5}
            />
            <YAxis tick={{ fontSize: 10, fill: '#A0A0A0' }} domain={[0, 100]} ticks={[0, 50, 100]} />
            <RTooltip
              contentStyle={{ background: 'white', border: '1px solid #E6E1D4', borderRadius: 8, fontSize: 12 }}
              formatter={((v: number, name: string) => [`${Math.round(v)}%`, name === 'planned' ? 'Planned' : 'Actual']) as never}
              labelFormatter={((ms: number) => format(new Date(ms), 'MMM d, yyyy')) as never}
            />
            <ReferenceLine
              x={todayMs}
              stroke="#2F8F5C"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              label={{ value: 'TODAY', position: 'top', fill: '#246F47', fontSize: 9, fontWeight: 700 }}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#2F8F5C"
              strokeWidth={2}
              fill="url(#ovProg)"
              connectNulls
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="planned"
              stroke="#C44545"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              connectNulls
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
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
    <div className="rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#EFEBE0]">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[7px] bg-[#E0EBE3]">
            <DollarSign className="h-3.5 w-3.5 text-[#246F47]" />
          </span>
          <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Finance</h3>
        </div>
        <button
          type="button"
          onClick={() => onJumpToTab?.('supplier')}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#246F47] transition-colors hover:text-[#1E5B3A]"
        >
          View all →
        </button>
      </div>

      {/* Sub-rows */}
      <div className="space-y-1.5 p-2.5">
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
          tone={invoicesOverdue > 0 ? 'red' : 'default'}
          onClick={() => onJumpToTab?.('invoices')}
        />
      </div>
    </div>
  );
}

function FinanceRow({
  icon: Icon, label, primary, secondary, onClick, tone = 'default',
}: {
  icon: typeof ShoppingCart; label: string; primary: string; secondary: string;
  onClick?: () => void; tone?: 'default' | 'red';
}) {
  const primaryTone = tone === 'red' ? 'text-[#C44545]' : 'text-[#1A1A1A]';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-[9px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2.5 text-left transition-all hover:bg-[#F4F1E8]"
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[7px] border border-[#E6E1D4] bg-white text-[#3A3A3A] group-hover:text-[#1A1A1A]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          {label}
        </p>
        <p
          className={`mt-0.5 text-[18px] font-medium leading-none tabular-nums ${primaryTone}`}
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {primary}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-[#A0A0A0]">{secondary}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#A0A0A0] transition-colors group-hover:text-[#246F47]" />
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
  // Status palette mirrors the editorial Site Diary tones — warm beige base
  // with calmer accents so the card reads as part of the same surface family.
  const segments: { label: string; value: number; color: string }[] = [
    { label: 'Complete',    value: complete,    color: '#246F47' },
    { label: 'In progress', value: inProgress,  color: '#C8841E' },
    { label: 'Not started', value: notStarted,  color: '#C9BBA0' },
    { label: 'Delayed',     value: delayed,     color: '#C44545' },
    { label: 'Blocked',     value: blocked,     color: '#5A6470' },
  ];
  const denom = Math.max(1, total);
  const pct = total === 0 ? 0 : Math.round((complete / total) * 100);

  return (
    <div className="rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
      <div className="px-4 pt-3.5 pb-3">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[7px] bg-[#FAEBC8]">
              <CheckSquare className="h-3.5 w-3.5 text-[#C8841E]" />
            </span>
            <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Task breakdown</h3>
          </div>
          <button
            type="button"
            onClick={() => onJumpToTab?.('tasks')}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#246F47] transition-colors hover:text-[#1E5B3A]"
          >
            View all →
          </button>
        </div>

        {/* Stacked status bar — beige base shows through when nothing's done */}
        <div className="mb-4 flex h-1.5 w-full overflow-hidden rounded-full bg-[#D6CDB7]">
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

        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px]">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate text-[#3A3A3A]">{s.label}</span>
              </span>
              <span className="tabular-nums font-semibold text-[#1A1A1A]">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer — totals on the left, count fraction on the right */}
      <div className="flex items-center justify-between gap-3 border-t border-dashed border-[#EFEBE0] px-4 py-2.5">
        <span className="text-[12px] text-[#6B6B6B]">
          <span className="font-semibold text-[#1A1A1A]">{total}</span> total task{total === 1 ? '' : 's'}
          {' · '}
          <span className="font-semibold text-[#1A1A1A]">{pct}%</span> complete
        </span>
        <span
          className="text-[18px] font-medium leading-none tabular-nums text-[#1A1A1A]"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {complete}
          <span className="mx-1 text-[#A0A0A0]">/</span>
          {total}
        </span>
      </div>
    </div>
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
    <div className="rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#EFEBE0]">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[7px] bg-[#E5E0F2]">
            <Eye className="h-3.5 w-3.5 text-[#7B5C9C]" />
          </span>
          <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Watchlist</h3>
        </div>
        <button
          type="button"
          onClick={() => onJumpToTab?.('punch_list')}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#246F47] transition-colors hover:text-[#1E5B3A]"
        >
          View all →
        </button>
      </div>

      {/* Sub-rows */}
      <div className="space-y-1.5 p-2.5">
        <WatchRow
          icon={ClipboardList}
          iconTone="green"
          label="Punch list"
          value={String(punchOpen)}
          unit={punchOpen === 1 ? 'open' : punchOpen > 0 ? 'open' : undefined}
          sub={punchOpen === 0 ? '• All clear' : `${punchOpen} open item${punchOpen === 1 ? '' : 's'}`}
          subTone={punchOpen > 0 ? 'amber' : 'emerald'}
          onClick={() => onJumpToTab?.('punch_list')}
        />
        <WatchRow
          icon={ShieldCheck}
          iconTone="amber"
          label="Warranties"
          value={String(warrantiesExpiringSoon)}
          unit="active"
          sub={warrantiesExpiringSoon === 0 ? 'None expiring soon' : 'Expiring in 60 days'}
          subTone={warrantiesExpiringSoon > 0 ? 'amber' : 'muted'}
          onClick={() => onJumpToTab?.('supplier')}
        />
        <WatchRow
          icon={Clock}
          iconTone="blue"
          label="Deadline"
          value={`${daysRemaining}`}
          unit="d"
          sub={`Ends ${format(parseISO(endDate), 'MMM d, yyyy')}`}
          subTone={daysRemaining < 14 ? 'red' : daysRemaining < 30 ? 'amber' : 'muted'}
        />
      </div>
    </div>
  );
}

function WatchRow({
  icon: Icon, iconTone, label, value, unit, sub, subTone, onClick,
}: {
  icon: typeof ClipboardList;
  iconTone: 'green' | 'amber' | 'blue';
  label: string;
  value: string;
  unit?: string;
  sub: string;
  subTone: 'muted' | 'emerald' | 'amber' | 'red';
  onClick?: () => void;
}) {
  const tile = {
    green: { bg: 'bg-[#E0EBE3]', fg: 'text-[#246F47]' },
    amber: { bg: 'bg-[#FAEBC8]', fg: 'text-[#C8841E]' },
    blue:  { bg: 'bg-[#E5EBF7]', fg: 'text-[#4A5DAD]' },
  }[iconTone];
  const subColor = {
    muted:   'text-[#A0A0A0]',
    emerald: 'text-[#246F47] font-semibold',
    amber:   'text-[#C8841E]',
    red:     'text-[#C44545]',
  }[subTone];
  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-[9px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2.5 text-left transition-all ${
        onClick ? 'hover:bg-[#F4F1E8]' : ''
      }`}
    >
      <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-[7px] ${tile.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${tile.fg}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          {label}
        </p>
        <p
          className="mt-0.5 text-[18px] font-medium leading-none tabular-nums text-[#1A1A1A]"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {value}
          {unit ? (
            <span className="ml-1 text-[11px] font-normal text-[#A0A0A0]">{unit}</span>
          ) : null}
        </p>
        <p className={`mt-0.5 truncate text-[11px] ${subColor}`}>{sub}</p>
      </div>
      {onClick ? (
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#A0A0A0] transition-colors group-hover:text-[#246F47]" />
      ) : null}
    </Comp>
  );
}

// ─── Bottom-grid cards ──────────────────────────────────────────────────

function RecentFilesCard({
  files, project, currentUser, onJumpToTab,
}: {
  files: { id: string; name: string; type: 'document' | 'photo' | 'video'; uploadedAt: string; size: number }[];
  project: Project;
  currentUser: User | null;
  onJumpToTab?: (t: TabId) => void;
}) {
  const uploadDocument = useFeatureStore((s) => s.uploadDocument);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const recent = useMemo(
    () => [...files].sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)).slice(0, 4),
    [files],
  );

  const handleFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(picked)) {
        uploadDocument({
          projectId: project.id,
          name: f.name,
          type: f.type.startsWith('image/') ? 'photo' : 'document',
          category: 'other',
          size: f.size,
          uploadedBy: currentUser?.fullName ?? 'me',
          url: URL.createObjectURL(f),
        });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#EFEBE0]">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[7px] bg-[#E5E0F2]">
            <FileText className="h-3.5 w-3.5 text-[#7B5C9C]" />
          </span>
          <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Recent files</h3>
        </div>
        <button
          type="button"
          onClick={() => onJumpToTab?.('files')}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#246F47] transition-colors hover:text-[#1E5B3A]"
        >
          View all →
        </button>
      </div>
      {recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[#E6E1D4] bg-[#FAF8F2]">
            <UploadIcon className="h-3.5 w-3.5 text-[#A0A0A0]" />
          </span>
          <p className="mt-2 text-[12.5px] text-[#6B6B6B]">No files uploaded yet.</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#C9BBA0] px-3.5 py-1.5 text-[12px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-60"
          >
            <Plus className="h-3 w-3" />
            {busy ? 'Uploading…' : 'Upload a file'}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
        </div>
      ) : (
        <ul className="divide-y divide-[#EFEBE0]">
          {recent.map((f) => {
            const Icon = f.type === 'photo' ? ImageIcon : FileText;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onJumpToTab?.('files')}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#FAF8F2]"
                >
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[7px] border border-[#E6E1D4] bg-white text-[#3A3A3A]">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-[#1A1A1A]">{f.name}</p>
                    <p className="text-[11px] text-[#A0A0A0]">
                      {fmtBytes(f.size)} · {timeAgo(f.uploadedAt)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecentNotesCard({
  projectId, onJumpToTab,
}: {
  projectId: string;
  onJumpToTab?: (t: TabId) => void;
}) {
  // "Notes" surface real Site Diary entries — that's where the project's
  // commentary actually lives. Skip conditions-stub entries so they don't
  // show up as blank rows on a fresh project.
  const diary = useDiaryEntries(projectId);
  const recent = useMemo(
    () =>
      [...diary]
        .filter(isVisibleEntry)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 4),
    [diary],
  );

  const goToDiary = () => onJumpToTab?.('site_diary');

  return (
    <div className="rounded-[12px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#EFEBE0]">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[7px] bg-[#E0EBE3]">
            <SquarePen className="h-3.5 w-3.5 text-[#246F47]" />
          </span>
          <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Recent notes</h3>
        </div>
        <button
          type="button"
          onClick={goToDiary}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#246F47] transition-colors hover:text-[#1E5B3A]"
        >
          View all →
        </button>
      </div>

      {recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[#E6E1D4] bg-[#FAF8F2]">
            <FileText className="h-3.5 w-3.5 text-[#A0A0A0]" />
          </span>
          <p className="mt-2 text-[12.5px] text-[#6B6B6B]">No site diary entries yet.</p>
          <button
            type="button"
            onClick={goToDiary}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#C9BBA0] px-3.5 py-1.5 text-[12px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"
          >
            <Plus className="h-3 w-3" />
            Write a note
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-[#EFEBE0]">
          {recent.map((e) => {
            const actor = e.personnel[0]?.workerName ?? '—';
            const role = e.personnel[0]?.role;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={goToDiary}
                  className="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-[#FAF8F2]"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate font-semibold text-[#1A1A1A]">
                      {actor}
                      {role ? <span className="font-normal text-[#A0A0A0]"> · {role}</span> : null}
                    </span>
                    <span className="flex-shrink-0 text-[#A0A0A0]">{timeAgo(e.createdAt)}</span>
                  </div>
                  {e.description ? (
                    <p className="line-clamp-2 text-[12px] text-[#3A3A3A]">{e.description}</p>
                  ) : (
                    <p className="text-[12px] italic text-[#A0A0A0]">No description</p>
                  )}
                  <span className="truncate text-[10px] uppercase tracking-[0.12em] text-[#A0A0A0]">
                    site diary · {format(parseISO(e.date), 'MMM d')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {recent.length > 0 ? (
        <div className="border-t border-[#EFEBE0] px-4 py-2 bg-[#FAF8F2]">
          <button
            type="button"
            onClick={goToDiary}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#246F47] hover:text-[#1E5B3A]"
          >
            <Plus className="h-3 w-3" />
            Write a note
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function KpiCell({
  icon: Icon, label, value, unit, caption, accent, delta,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  /** Optional unit rendered next to the value at a smaller size (e.g. "%"). */
  unit?: string;
  caption: string;
  accent: 'emerald' | 'amber' | 'red' | 'slate';
  /** Optional delta chip — `{ value: 32, suffix: '% wk' }` renders "↑ +32% wk". */
  delta?: { value: number; suffix: string };
}) {
  const accentBar: Partial<Record<typeof accent, string>> = {
    emerald: 'bg-[#246F47]',
    amber:   'bg-[#C8841E]',
    red:     'bg-[#C44545]',
    // 'slate' renders no bar so cards with neutral / "all clear" status read calmer.
  };
  const barClass = accentBar[accent];

  return (
    <div className="relative overflow-hidden rounded-[12px] border border-[#E6E1D4] bg-white p-3.5 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      {barClass ? (
        <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${barClass}`} aria-hidden="true" />
      ) : null}
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-[#6B6B6B]" />
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          {label}
        </p>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p
          className="text-[26px] font-medium leading-none tabular-nums text-[#1A1A1A]"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          title={value}
        >
          {value}
          {unit ? (
            <span className="ml-1 text-[14px] font-normal text-[#6B6B6B]">{unit}</span>
          ) : null}
        </p>
        {delta && delta.value !== 0 ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
              delta.value > 0
                ? 'bg-[#E0EBE3] text-[#246F47]'
                : 'bg-[#FBE5E5] text-[#C44545]'
            }`}
          >
            <ArrowUp className={`h-2.5 w-2.5 ${delta.value < 0 ? 'rotate-180' : ''}`} />
            {delta.value > 0 ? '+' : ''}{delta.value}{delta.suffix}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-[#A0A0A0]">
        {caption}
      </p>
    </div>
  );
}

function ModeButton({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: typeof TrendingUp; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors ${
        active
          ? 'bg-[#1A1A1A] text-white shadow-[0_1px_2px_rgba(20,20,20,0.18)]'
          : 'bg-transparent text-[#6B6B6B] hover:text-[#1A1A1A]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

const fmtUSD = (n: number) =>
  n === 0
    ? '$0'
    : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);

function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function statusTone(status: string | undefined): ToneKey {
  switch (status) {
    case 'on_hold':  return 'amber';
    case 'archived': return 'slate';
    case 'completed':
    case 'active':
    default:         return 'sage';
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
