import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { useDashboardStats, useActiveJobs, useUpcomingTasks } from '../store/dashboard';
import { useProjectActivity } from '../lib/hooks/useProjectActivity';
import { useDashboardCounts } from '../lib/hooks/useDashboardCounts';
import ActivityFeed from '../components/activity/ActivityFeed';
import type { ActivityEvent } from '../lib/activity/types';
import { SECURITY_GROUP_LABELS, canConfirmAIAnalysis, canViewSafetyIncident } from '../lib/permissions';
import type { SecurityGroup } from '../types';
import {
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

// Per-role capability summary shown in the welcome strip. Keep it short —
// the source of truth for actual permissions is `lib/permissions.ts`.
const ROLE_BLURB: Record<SecurityGroup, string> = {
  company_admin:    'Full overview · manage users, projects, finance, and Gantt across every site.',
  administrator:    'Manage users, stakeholders, and suppliers. Full project visibility.',
  construction_mgr: 'Multi-site oversight. Edit projects, tasks, and add comments.',
  project_manager:  'Plan + scheduling. Edit Gantt, run reports, edit tasks.',
  site_manager:     'Run a single site. Update tasks, manage photos and comments.',
  worker:           'Field crew. Upload photos against tasks, leave notes, view your assignments.',
  stakeholder:      'Read-only client view. Track progress and review reports for your linked projects.',
  supplier:         'Read-only vendor view. See your scoped orders, deliveries, invoices, and warranties.',
};
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import WhatsNewCard from '../components/dashboard/WhatsNewCard';
import { EditorialButton } from '../components/editorial';

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  complete:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  delayed:     'border-red-200 bg-red-50 text-red-700',
  blocked:     'border-amber-200 bg-amber-50 text-amber-700',
  not_started: 'border-slate-200 bg-slate-50 text-slate-600',
};

// Phase-accent palette for the Upcoming Tasks left rail. Maps the eight
// ConstructionPhase values onto the editorial slate/emerald/blue/amber/violet
// hues so a glance at the card hints at trade mix without a legend.
const PHASE_ACCENT: Record<string, string> = {
  excavation: 'bg-amber-500',
  foundation: 'bg-slate-500',
  framing:    'bg-orange-500',
  roofing:    'bg-rose-500',
  electrical: 'bg-yellow-500',
  plumbing:   'bg-sky-500',
  drywall:    'bg-violet-500',
  finishing:  'bg-emerald-500',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { users, zones, project, currentProfile } = useAppStore();
  const stats = useDashboardStats();
  const activeJobs = useActiveJobs(3);
  const upcomingTasks = useUpcomingTasks(4);
  const progressTrend = useFeatureStore((s) => s.progressHistory);
  const recentActivity = useProjectActivity(project.id, { limit: 8 });
  const dashboardCounts = useDashboardCounts(project.id);

  const canSeeHazardTile = canViewSafetyIncident(currentProfile);
  const canSeeReviewTile = canConfirmAIAnalysis(currentProfile);

  // Pass 2: pulse the count tiles when a teammate's update flips the value.
  // Two refs hold the last-seen value; comparison runs in a single effect
  // and clears the pulse 700ms later (matches the CSS `statPulse` keyframe).
  const prevHazardsRef = useRef<number | null>(null);
  const prevReviewRef  = useRef<number | null>(null);
  const [hazardPulse,  setHazardPulse]  = useState(false);
  const [reviewPulse,  setReviewPulse]  = useState(false);
  useEffect(() => {
    if (dashboardCounts.loading) return;
    if (prevHazardsRef.current !== null && prevHazardsRef.current !== dashboardCounts.openHazards) {
      setHazardPulse(true);
      const t = window.setTimeout(() => setHazardPulse(false), 700);
      prevHazardsRef.current = dashboardCounts.openHazards;
      return () => window.clearTimeout(t);
    }
    prevHazardsRef.current = dashboardCounts.openHazards;
  }, [dashboardCounts.openHazards, dashboardCounts.loading]);
  useEffect(() => {
    if (dashboardCounts.loading) return;
    if (prevReviewRef.current !== null && prevReviewRef.current !== dashboardCounts.pendingReview) {
      setReviewPulse(true);
      const t = window.setTimeout(() => setReviewPulse(false), 700);
      prevReviewRef.current = dashboardCounts.pendingReview;
      return () => window.clearTimeout(t);
    }
    prevReviewRef.current = dashboardCounts.pendingReview;
  }, [dashboardCounts.pendingReview, dashboardCounts.loading]);

  // Activity row click → deep link to the right surface for that event kind.
  // Pass 2 wires the *receiving* end (URL hydration); the URL params here
  // are forward-compatible — pages that don't yet read them just navigate
  // and ignore the query string.
  const handleActivitySelect = (event: ActivityEvent) => {
    switch (event.targetTabId) {
      case 'tasks':
        navigate(`/gantt?project=${project.id}&tab=tasks&task=${event.targetEntityId}`);
        return;
      case 'uploads':
        if (event.kind === 'safety_flag') {
          navigate(`/safety?project=${project.id}&tab=hazards&incident=${event.targetEntityId}`);
          return;
        }
        navigate(`/gallery?project=${project.id}&photo=${event.targetEntityId}`);
        return;
      case 'overview':
        if (event.kind === 'safety_flag') {
          navigate(`/safety?project=${project.id}&tab=hazards&incident=${event.targetEntityId}`);
          return;
        }
        navigate(`/gantt?project=${project.id}&tab=overview`);
        return;
      default:
        // Generic fallback: jump to the matching Gantt tab.
        navigate(`/gantt?project=${project.id}&tab=${event.targetTabId}`);
    }
  };

  const roleLabel = currentProfile
    ? SECURITY_GROUP_LABELS[currentProfile.securityGroup]
    : null;
  const roleBlurb = currentProfile ? ROLE_BLURB[currentProfile.securityGroup] : null;
  const displayName = currentProfile
    ? [currentProfile.firstName, currentProfile.lastName].filter(Boolean).join(' ').trim()
    : '';

  return (
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      {/* ─── Editorial Header ─── */}
      <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                <span className="inline-block h-px w-6 bg-slate-400" />
                Workspace · {project.name}
              </div>
              <h1
                className="display text-2xl font-medium leading-tight text-slate-900 sm:text-4xl md:text-5xl"
                style={{ textWrap: 'balance' }}
              >
                The <em className="font-normal italic text-emerald-700">brief</em>.
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate-500">
                Today's pulse — what's moving, what's overdue, what's worth your attention before
                the next coffee.
              </p>
              {roleLabel && (
                <div className="mt-5 flex max-w-xl items-start gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
                        Signed in as
                      </span>
                      <span className="display text-sm font-medium text-slate-900">
                        {displayName || currentProfile?.email}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                        {roleLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{roleBlurb}</p>
                  </div>
                </div>
              )}
            </div>

            <EditorialButton
              variant="pill"
              onClick={() => navigate('/reports')}
              className="self-start"
            >
              <Sparkles className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
              Open report deck
            </EditorialButton>
          </div>

          {/* Stat strip — every tile is scoped to the active project. New
              manager-tier tiles (AI hazards, Pending review) lift two of the
              most actionable Phase C states straight onto the Dashboard so
              you don't have to walk to /safety or /review-queue to spot them. */}
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
            <StatCell
              label="Tasks Complete"
              value={`${stats.tasksComplete}/${stats.totalTasks}`}
              caption={`${stats.tasksInProgress} in progress`}
              accent="#0F766E"
            />
            <StatCell
              label="Overall Progress"
              value={`${stats.overallProgress}%`}
              caption={stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'On track'}
              accent={stats.delayedTasks > 0 ? '#BE123C' : '#0F172A'}
            />
            <StatCell
              label="Photos this week"
              value={stats.photosThisWeek.toString()}
              caption={`+${stats.photosToday} today`}
              accent="#0369A1"
            />
            <StatCell
              label="Days remaining"
              value={stats.daysRemaining.toString()}
              caption={stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'Schedule holding'}
              accent="#6D28D9"
            />
            {canSeeHazardTile && (
              <StatCell
                label="Open AI hazards"
                value={dashboardCounts.loading ? '—' : dashboardCounts.openHazards.toString()}
                caption={dashboardCounts.openHazards > 0 ? 'Action required' : 'No open hazards in this project'}
                accent={dashboardCounts.openHazards > 0 ? '#DC2626' : '#10B981'}
                onClick={() => navigate(`/safety?project=${project.id}&tab=hazards`)}
                ariaLabel={`Open AI hazards: ${dashboardCounts.openHazards} in this project`}
                pulse={hazardPulse}
              />
            )}
            {canSeeReviewTile && (
              <StatCell
                label="Pending review"
                value={dashboardCounts.loading ? '—' : dashboardCounts.pendingReview.toString()}
                caption={dashboardCounts.pendingReview > 0 ? 'AI calls awaiting confirmation' : 'No analyses pending in this project'}
                accent={dashboardCounts.pendingReview > 0 ? '#F59E0B' : '#10B981'}
                onClick={() => navigate(`/review-queue?project=${project.id}`)}
                ariaLabel={`Pending review: ${dashboardCounts.pendingReview} AI analyses awaiting your confirmation in this project`}
                pulse={reviewPulse}
              />
            )}
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="grid gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:grid-cols-[1fr_320px]">
        <main className="space-y-6">
          {/* Active Jobs */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <SectionHeader
              eyebrow="On site"
              title="Active jobs"
              description="The work currently in motion"
              actionLabel="View all"
              onAction={() => navigate('/gantt')}
            />
            <div className="divide-y divide-slate-100">
              {activeJobs.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-slate-400 italic">
                  No active tasks right now.
                </p>
              )}
              {activeJobs.map((job) => {
                const zone = zones.find((z) => z.id === job.zoneId);
                const badgeClass = STATUS_BADGE[job.status] ?? STATUS_BADGE.not_started;
                return (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50/60"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{job.name}</p>
                        <p className="text-xs text-slate-500">
                          {zone?.name ?? 'No zone'} · {job.phase}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="num text-lg font-medium text-slate-900">{job.percentComplete}%</p>
                        <p className="text-[11px] text-slate-400">
                          Due {format(parseISO(job.endDate), 'MMM d')}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${badgeClass}`}
                      >
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Progress Chart */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <SectionHeader
              eyebrow="Trend"
              title="Progress over time"
              description="Cumulative completion across every active task"
            />
            <div className="px-2 pb-4">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={progressTrend} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="dashProgress" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => format(new Date(date), 'MMM d')}
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 30px -10px rgb(15 23 42 / 0.15)',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="progress"
                      stroke="#10B981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#dashProgress)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Upcoming Tasks — project-scoped via the TopNav project pill.
              Each row is a button that deep-links into the Gantt task drawer
              so a tester can jump from "what's next" straight into the task
              detail without re-navigating + searching. */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <SectionHeader
              eyebrow="Coming up"
              title="Upcoming tasks"
              description={`Priority milestones for ${project.name}`}
              actionLabel="See all"
              onAction={() => navigate(`/gantt?project=${project.id}&tab=tasks`)}
            />
            <div className="divide-y divide-slate-100">
              {upcomingTasks.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-slate-400 italic">
                  No upcoming tasks for {project.name}.
                </p>
              )}
              {upcomingTasks.map((task) => {
                const zone = zones.find((z) => z.id === task.zoneId);
                const startsIn = differenceInCalendarDays(parseISO(task.startDate), new Date());
                const accent = PHASE_ACCENT[task.phase] ?? 'bg-slate-300';
                const startBadge =
                  startsIn < 0  ? { label: `Overdue · ${Math.abs(startsIn)}d`, tone: 'border-red-200 bg-red-50 text-red-700' }
                  : startsIn === 0 ? { label: 'Starts today',                  tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
                  : startsIn <= 7  ? { label: `In ${startsIn}d`,               tone: 'border-amber-200 bg-amber-50 text-amber-700' }
                  :                  { label: `In ${startsIn}d`,               tone: 'border-slate-200 bg-slate-50 text-slate-600' };
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate(`/gantt?project=${project.id}&tab=tasks&task=${task.id}`)}
                    aria-label={`Open task ${task.name}, ${startBadge.label.toLowerCase()}`}
                    className="group flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-emerald-50/40 active:bg-emerald-50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`block h-8 w-1 flex-shrink-0 rounded-full ${accent}`} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{task.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {zone?.name ?? 'No zone'} · <span className="capitalize">{task.phase}</span>
                          {' · '}Starts {format(parseISO(task.startDate), 'MMM d')}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums ${startBadge.tone}`}>
                        {startBadge.label}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-600" aria-hidden />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </main>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* What's new — auto-generated from git log on each build/dev start. */}
          <WhatsNewCard />

          {/* Recent activity — derived from the active project via
              useProjectActivity. Phase D will swap the hook's body for a
              Supabase audit_log query without changing the props here. */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  In this project
                </p>
                <h3 className="display text-lg font-medium text-slate-900">Recent activity</h3>
              </div>
              <Clock className="h-4 w-4 text-slate-400" aria-hidden />
            </div>
            <ActivityFeed
              events={recentActivity}
              onSelect={handleActivitySelect}
              dense
              emptyLabel="Nothing yet — uploads, comments, and updates will appear here."
            />
          </section>

          {/* Team */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  On the roster
                </p>
                <h3 className="display text-lg font-medium text-slate-900">Team</h3>
              </div>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
            <ul className="space-y-3">
              {users.slice(0, 5).map((user) => (
                <li key={user.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="text-xs">
                        {user.fullName.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
                      <p className="text-[11px] capitalize text-slate-500">{user.role}</p>
                    </div>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </li>
              ))}
            </ul>
          </section>

          {/* Quick stat */}
          <section className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
              Today
            </p>
            <p className="display mt-1 text-2xl font-medium">
              {stats.photosToday} photo{stats.photosToday === 1 ? '' : 's'} captured
            </p>
            <p className="mt-2 text-xs text-slate-300">
              {stats.tasksInProgress} task{stats.tasksInProgress === 1 ? '' : 's'} in motion ·{' '}
              {stats.delayedTasks} delayed
            </p>
            <button
              onClick={() => navigate('/gallery')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Open gallery
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatCell({
  label, value, caption, accent, onClick, ariaLabel, pulse,
}: {
  label: string;
  value: string;
  caption: string;
  accent: string;
  /** When set, the cell renders as a clickable <button> with hover state. */
  onClick?: () => void;
  ariaLabel?: string;
  /** When true, the value briefly pulses (700ms) — fired by the Dashboard
   *  on cross-browser count changes. Driven by the `statPulse` keyframe in
   *  index.css via `data-just-updated`. */
  pulse?: boolean;
}) {
  const inner = (
    <>
      <div className="absolute left-0 top-0 h-1 w-12 rounded-br-full" style={{ backgroundColor: accent }} />
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500 sm:text-[11px] sm:tracking-[0.15em]">{label}</p>
      {/* Scales down on phones so values like "$150,000" or "10 days" don't
          overflow at grid-cols-2 (~150px usable per cell at 375px). */}
      <p
        className="num mt-2 text-2xl font-medium text-slate-900 sm:text-3xl md:text-4xl"
        data-just-updated={pulse ? 'true' : undefined}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? `${label}: ${value}, ${caption}`}
        className="group relative overflow-hidden bg-white p-4 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 sm:p-5"
      >
        {inner}
        <ArrowUpRight className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-700" aria-hidden />
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden bg-white p-4 sm:p-5">
      {inner}
    </div>
  );
}

function SectionHeader({
  eyebrow, title, description, actionLabel, onAction,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-6">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          {eyebrow}
        </p>
        <h2 className="display mt-1 text-xl font-medium text-slate-900" style={{ textWrap: 'balance' }}>{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-900 hover:bg-slate-900 hover:text-white"
        >
          {actionLabel}
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

// Suppress unused import warning — CheckCircle2 reserved for future status block
void CheckCircle2;
