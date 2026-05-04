import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { useDashboardStats, useActiveJobs, useUpcomingTasks } from '../store/dashboard';
import { SECURITY_GROUP_LABELS } from '../lib/permissions';
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
import { format, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';

const FONT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
  .dashboard-root { font-family: 'DM Sans', system-ui, sans-serif; }
  .dashboard-root .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
  .dashboard-root .num     { font-family: 'Fraunces', Georgia, serif; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
  .dashboard-root .grid-bg {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
  }
`;

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  complete:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  delayed:     'border-red-200 bg-red-50 text-red-700',
  blocked:     'border-amber-200 bg-amber-50 text-amber-700',
  not_started: 'border-slate-200 bg-slate-50 text-slate-600',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { activityFeed, users, zones, project, currentProfile } = useAppStore();
  const stats = useDashboardStats();
  const activeJobs = useActiveJobs(3);
  const upcomingTasks = useUpcomingTasks(4);
  const progressTrend = useFeatureStore((s) => s.progressHistory);

  const roleLabel = currentProfile
    ? SECURITY_GROUP_LABELS[currentProfile.securityGroup]
    : null;
  const roleBlurb = currentProfile ? ROLE_BLURB[currentProfile.securityGroup] : null;
  const displayName = currentProfile
    ? [currentProfile.firstName, currentProfile.lastName].filter(Boolean).join(' ').trim()
    : '';

  return (
    <div className="dashboard-root min-h-full bg-[#FAFAF7]">
      <style>{FONT_STYLES}</style>

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

            <button
              onClick={() => navigate('/reports')}
              className="group inline-flex items-center justify-center gap-2.5 self-start whitespace-nowrap rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 active:bg-emerald-800"
            >
              <Sparkles className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
              Open report deck
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>

          {/* Stat strip */}
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-4">
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

          {/* Upcoming Tasks */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <SectionHeader
              eyebrow="Coming up"
              title="Upcoming tasks"
              description="Priority milestones and deadlines"
              actionLabel="See all"
              onAction={() => navigate('/gantt')}
            />
            <div className="divide-y divide-slate-100">
              {upcomingTasks.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-slate-400 italic">
                  No upcoming tasks.
                </p>
              )}
              {upcomingTasks.map((task) => {
                const zone = zones.find((z) => z.id === task.zoneId);
                return (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-slate-50/60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                        <div className="h-3.5 w-3.5 rounded border-2 border-slate-300" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{task.name}</p>
                        <p className="text-xs text-slate-500">
                          {zone?.name ?? 'No zone'} · {task.phase}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium capitalize text-slate-600">
                        {task.phase}
                      </span>
                      <span className="text-xs tabular-nums text-slate-500">
                        Starts {format(parseISO(task.startDate), 'MMM d')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Recent activity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Live feed
                </p>
                <h3 className="display text-lg font-medium text-slate-900">Recent activity</h3>
              </div>
              <Clock className="h-4 w-4 text-slate-400" />
            </div>
            <ul className="space-y-4">
              {activityFeed.slice(0, 6).map((activity) => {
                const user = users.find((u) => u.id === activity.userId);
                return (
                  <li key={activity.id} className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback className="text-[10px]">
                        {user?.fullName.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium text-slate-900">{activity.userName}</span>{' '}
                        <span className="text-slate-500">{activity.message}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {format(new Date(activity.timestamp), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </li>
                );
              })}
              {activityFeed.length === 0 && (
                <li className="text-sm text-slate-400 italic">Nothing yet.</li>
              )}
            </ul>
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
  label, value, caption, accent,
}: { label: string; value: string; caption: string; accent: string }) {
  return (
    <div className="relative overflow-hidden bg-white p-5">
      <div className="absolute left-0 top-0 h-px w-8" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="num mt-2 text-4xl font-medium text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
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
