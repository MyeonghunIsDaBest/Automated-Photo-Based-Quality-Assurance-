import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { useDashboardStats, useActiveJobs, useUpcomingTasks } from '../store/dashboard';
import { useProjectActivity } from '../lib/hooks/useProjectActivity';
import { useDashboardCounts } from '../lib/hooks/useDashboardCounts';
import { useWeather, type WeatherTone } from '../lib/hooks/useWeather';
import ActivityFeed from '../components/activity/ActivityFeed';
import ActivityDetailModal from '../components/activity/ActivityDetailModal';
import type { ActivityEvent } from '../lib/activity/types';
import { SECURITY_GROUP_LABELS, canConfirmAIAnalysis, canViewSafetyIncident } from '../lib/permissions';
import type { SecurityGroup } from '../types';
import {
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Image as ImageIcon,
  Mic,
  Package,
  ShieldCheck,
  Sparkles,
  Sun,
  Truck,
  Users,
  Wind,
  Eye,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import CountUp from '../components/ui/CountUp';
import WhatsNewCard from '../components/dashboard/WhatsNewCard';

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

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  complete:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  delayed:     'border-red-200 bg-red-50 text-red-700',
  blocked:     'border-amber-200 bg-amber-50 text-amber-700',
  not_started: 'border-slate-200 bg-slate-50 text-slate-600',
};

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

// ─── Demo-data — clearly stubbed sections waiting for real wiring ──────────
// Weather is live via `useWeather()` (Open-Meteo). Everything below is DEMO
// until the relevant store / API is wired.
const DEMO_DELIVERIES = [
  { id: 'd1', name: '40 yd³ concrete',    vendor: 'NorthCrete',   when: 'Today · 13:30', status: 'ON ROUTE',  tone: 'emerald' },
  { id: 'd2', name: 'Rebar #5 (3 tons)',  vendor: 'SteelHaus',    when: 'Wed · 06:00',  status: 'CONFIRMED', tone: 'slate'   },
  { id: 'd3', name: 'Light fixtures (L12)', vendor: 'LuxCo',      when: 'Thu · 10:00',  status: 'PENDING',   tone: 'amber'   },
];

const DEMO_BUDGET = {
  spent: 10_100_000,
  total: 18_400_000,
  pctSpent: 55,
  pctCommitted: 77,
  weeks: [42, 48, 55, 51, 72, 58, 64, 78],
  weekColor: (pct: number) => (pct < 55 ? '#10B981' : pct < 70 ? '#F59E0B' : '#DC2626'),
  contingencyNote: 'Aug 14. Two pour delays could compress that by 12 days.',
};

const SUGGESTED_QUESTIONS = [
  "Today's safety flags",
  'Critical path slip?',
  'Crew on L14',
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function shortMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

// Deterministic pseudo-random walk so each KPI gets a unique sparkline
// shape that lands at the live value, without flickering between renders.
function seededTrend(value: number, seed: number, n = 12): number[] {
  const out: number[] = [];
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let v = value * (0.55 + rnd() * 0.2);
  for (let i = 0; i < n - 1; i++) {
    v += (value - v) * 0.22 + (rnd() - 0.5) * Math.max(value, 1) * 0.1;
    out.push(Math.max(0, v));
  }
  out.push(value);
  return out;
}

// Lightweight inline-SVG sparkline. Used in every KPI cell — keeps the
// header strip lean (no per-cell Recharts ResponsiveContainer overhead).
function Sparkline({ data, color, width = 64, height = 20 }: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r={1.8}
        fill={color}
      />
    </svg>
  );
}

// Donut-style circular progress used on Active-Jobs rows. Pure SVG so it
// renders inline without a chart library wrapper.
function ProgressRing({ percent, size = 44, stroke = 4, color = '#10B981' }: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const dash = (clamped / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#E2E8F0"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

// Map a weather tone to a matching lucide icon + accent color.
function weatherIconFor(tone: WeatherTone) {
  switch (tone) {
    case 'sun':    return { Icon: Sun,            color: 'text-amber-400' };
    case 'partly': return { Icon: Cloud,          color: 'text-amber-400' };
    case 'cloud':  return { Icon: Cloud,          color: 'text-slate-400' };
    case 'rain':   return { Icon: CloudRain,      color: 'text-sky-500' };
    case 'storm':  return { Icon: CloudLightning, color: 'text-violet-500' };
    case 'snow':   return { Icon: CloudSnow,      color: 'text-slate-300' };
    case 'fog':    return { Icon: CloudFog,       color: 'text-slate-300' };
    default:       return { Icon: Cloud,          color: 'text-slate-400' };
  }
}

// Map a security_group label → short trade chip displayed on the Team row.
function tradeChip(group: SecurityGroup): string {
  switch (group) {
    case 'site_manager':     return 'GENERAL';
    case 'construction_mgr': return 'GENERAL';
    case 'project_manager':  return 'GENERAL';
    case 'company_admin':    return 'ADMIN';
    case 'administrator':    return 'ADMIN';
    case 'worker':           return 'FIELD';
    case 'stakeholder':      return 'CLIENT';
    case 'supplier':         return 'VENDOR';
    default:                 return '—';
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────

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

  // Live weather — geolocation w/ Melbourne fallback, 30-min session cache.
  const weather = useWeather();

  // Pulse the count tiles when a teammate's update flips the value.
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

  // Activity row click → open the detail modal. The modal surfaces full
  // event metadata (who/what/when) and exposes a single "Open detail"
  // button that does the deep-link via the shared router. Switching from
  // immediate-navigate to modal-first means users get the full context
  // before being redirected to the entity that was made or updated.
  const [activeActivityEvent, setActiveActivityEvent] = useState<ActivityEvent | null>(null);
  const handleActivitySelect = (event: ActivityEvent) => {
    setActiveActivityEvent(event);
  };
  const closeActivityModal = () => setActiveActivityEvent(null);

  const roleLabel = currentProfile
    ? SECURITY_GROUP_LABELS[currentProfile.securityGroup]
    : null;
  const roleBlurb = currentProfile ? ROLE_BLURB[currentProfile.securityGroup] : null;
  const displayName = currentProfile
    ? [currentProfile.firstName, currentProfile.lastName].filter(Boolean).join(' ').trim()
    : '';

  // Safety streak — DEMO. Real implementation: select the most recent
  // incident from `useSafetyIncidentsCache` and count days since.
  const safetyStreakDays = 47;
  const safetyBestStreak = 62;

  // Crew on site — derive from team count. Without a real time-clock the
  // "checked in" number is a 73% approximation.
  const crewTotal = users.length;
  const crewOnSite = Math.max(1, Math.round(crewTotal * 0.73));
  const crewAvatars = users.slice(0, 5);
  const crewExtra = Math.max(0, crewTotal - crewAvatars.length);

  // Zone activity — counts active tasks per zone for the last-24h heatmap.
  // Falls back to an empty list if no zones exist.
  const zoneActivity = useMemo(() => {
    return zones.slice(0, 10).map((z) => {
      // Derive a "load" number deterministically per zone so demo data
      // still has visual variation. Real impl: photos uploaded per zone.
      const seed = z.id.charCodeAt(z.id.length - 1) + z.id.charCodeAt(0);
      const count = (seed * 13) % 100;
      return { id: z.id, name: z.name, count };
    });
  }, [zones]);
  const zoneMax = Math.max(1, ...zoneActivity.map((z) => z.count));

  // Build the Planned vs Actual chart data. Reuses progressHistory for the
  // actual line; the "planned" series is a straight-line target from 0 →
  // the latest actual value over the same number of points. Replace with a
  // real planned-progress feed once we capture baselines.
  const plannedVsActual = useMemo(() => {
    if (progressTrend.length === 0) return [];
    const last = progressTrend[progressTrend.length - 1]?.progress ?? 0;
    return progressTrend.map((row, i) => ({
      date: row.date,
      actual: row.progress,
      planned: ((i + 1) / progressTrend.length) * last * 1.05, // slight over-plan
    }));
  }, [progressTrend]);

  // Stable sparkline series — one per KPI tile. Seeded on the live value
  // so each tile gets its own shape without flickering between renders.
  const sparks = useMemo(() => ({
    tasks:    seededTrend(stats.tasksComplete, 7,  12),
    progress: seededTrend(stats.overallProgress, 13, 12),
    photos:   seededTrend(stats.photosThisWeek, 23, 12),
    days:     seededTrend(stats.daysRemaining, 31, 12),
    hazards:  seededTrend(Math.max(1, dashboardCounts.openHazards * 4), 37, 12),
    review:   seededTrend(Math.max(1, dashboardCounts.pendingReview * 3), 41, 12),
  }), [stats, dashboardCounts.openHazards, dashboardCounts.pendingReview]);

  return (
    <motion.div
      className="editorial-root min-h-full bg-[#FAFAF7]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
    >
      {/* ─── Alert ribbon — site-wide live conditions ─────────────── */}
      <div className="border-b border-slate-800 bg-slate-900 text-white">
        <div className="flex items-center gap-6 overflow-x-auto px-4 py-2 text-[11px] font-medium sm:px-8">
          <span className="flex flex-shrink-0 items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="tracking-[0.18em] text-emerald-300">LIVE</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-200">L15 begins 13:30</span>
          </span>
          <span className="hidden flex-shrink-0 text-slate-300 md:inline">
            <span className="text-emerald-300">Safety</span> · {safetyStreakDays} days incident-free
          </span>
          <span className="hidden flex-shrink-0 text-slate-300 lg:inline">
            <span className="text-amber-300">Weather alert</span> · Thursday rain, pour postponed
          </span>
          <span className="hidden flex-shrink-0 text-slate-300 lg:inline">
            <span className="text-slate-100">Inspection</span> · MEP rough-in Friday 09:00
          </span>
          {dashboardCounts.openHazards > 0 && (
            <span className="flex-shrink-0 text-slate-300">
              <span className="text-red-300">{dashboardCounts.openHazards} hazard{dashboardCounts.openHazards === 1 ? '' : 's'}</span> waiting confirmation
            </span>
          )}
          <span className="ml-auto hidden flex-shrink-0 items-center gap-1 text-slate-400 lg:flex">
            <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] tracking-wider">⌘K</kbd>
          </span>
        </div>
      </div>

      {/* ─── Editorial header ─────────────────────────────────────── */}
      <header className="border-b border-slate-200/70 bg-white">
        <div className="relative px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          {/* Hero */}
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            <span className="inline-block h-px w-6 bg-slate-400" />
            Workspace · {project.name}
          </div>
          <h1
            className="display text-2xl font-medium leading-[0.95] tracking-[-0.02em] text-slate-900 sm:text-5xl md:text-6xl"
            style={{ textWrap: 'balance' }}
          >
            The <em className="font-normal italic text-emerald-700">brief</em>.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate-500">
            Today's pulse — what's moving, what's overdue, what's worth your attention before
            the next coffee.
          </p>

          {/* Identity strip */}
          {roleLabel && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
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

              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="group flex flex-shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <Sparkles className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px" />
                Open report deck
              </button>
            </div>
          )}

          {/* KPI strip with sparklines */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCell
              label="Tasks Complete"
              value={`${stats.tasksComplete}/${stats.totalTasks}`}
              caption={`${stats.tasksInProgress} in progress`}
              spark={sparks.tasks}
              color="#10B981"
              pulse={false}
            />
            <MetricCell
              label="Overall Progress"
              value={`${stats.overallProgress}%`}
              numericValue={stats.overallProgress}
              format={(n) => `${Math.round(n)}%`}
              caption={stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'On track'}
              spark={sparks.progress}
              color={stats.delayedTasks > 0 ? '#DC2626' : '#0F172A'}
            />
            <MetricCell
              label="Photos this week"
              value={stats.photosThisWeek.toString()}
              numericValue={stats.photosThisWeek}
              caption={`+${stats.photosToday} today`}
              spark={sparks.photos}
              color="#2563EB"
            />
            <MetricCell
              label="Days remaining"
              value={stats.daysRemaining.toString()}
              numericValue={stats.daysRemaining}
              caption={stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'Schedule holding'}
              spark={sparks.days}
              color="#7C3AED"
            />
            {canSeeHazardTile && (
              <MetricCell
                label="Open AI hazards"
                value={dashboardCounts.loading ? '—' : dashboardCounts.openHazards.toString()}
                numericValue={dashboardCounts.loading ? undefined : dashboardCounts.openHazards}
                caption={dashboardCounts.openHazards > 0 ? 'Action required' : 'No open hazards'}
                spark={sparks.hazards}
                color="#DC2626"
                pulse={hazardPulse}
                onClick={() => navigate(`/safety?project=${project.id}&tab=hazards`)}
              />
            )}
            {canSeeReviewTile && (
              <MetricCell
                label="Pending review"
                value={dashboardCounts.loading ? '—' : dashboardCounts.pendingReview.toString()}
                numericValue={dashboardCounts.loading ? undefined : dashboardCounts.pendingReview}
                caption={dashboardCounts.pendingReview > 0 ? 'AI calls awaiting you' : 'All caught up'}
                spark={sparks.review}
                color="#F59E0B"
                pulse={reviewPulse}
                onClick={() => navigate(`/review-queue?project=${project.id}`)}
              />
            )}
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        {/* Trio: Weather · Safety streak · Crew · Ask anything */}
        <div className="grid gap-4 lg:grid-cols-4">
          {/* Weather — live from Open-Meteo; geolocation w/ Melbourne fallback */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              <span className="truncate">
                {weather.locationLabel ? `${weather.locationLabel} weather` : 'On-site weather'}
              </span>
              {weather.current ? (() => {
                const { Icon, color } = weatherIconFor(weather.current.tone);
                return <Icon className={`h-3.5 w-3.5 ${color}`} />;
              })() : (
                <Cloud className="h-3.5 w-3.5 text-slate-300" />
              )}
            </div>

            {weather.loading && (
              <p className="text-sm text-slate-400">Loading…</p>
            )}

            {weather.error && !weather.current && (
              <div>
                <p className="text-sm text-slate-700">Weather unavailable</p>
                <p className="mt-1 text-[11px] text-slate-400">Open-Meteo returned an error. Try again later.</p>
              </div>
            )}

            {weather.current && (
              <>
                <p className="num text-3xl font-medium text-slate-900">
                  {weather.current.tempC}
                  <span className="ml-0.5 align-top text-base text-slate-400">°C</span>
                </p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Wind className="h-3 w-3" />{weather.current.windKmh} km/h
                  </span>
                  <span>○ {weather.current.humidity}%</span>
                  <span>◌ {weather.current.precipPct}%</span>
                </div>

                {weather.forecast.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                    {weather.forecast.map((f) => {
                      const { Icon, color } = weatherIconFor(f.tone);
                      return (
                        <div key={f.day} className="text-center">
                          <p className="text-[9px] font-medium tracking-[0.15em] text-slate-400">{f.day}</p>
                          <div className="my-1 flex justify-center">
                            <Icon className={`h-4 w-4 ${color}`} />
                          </div>
                          <p className="text-[11px] tabular-nums text-slate-700">
                            {f.high}°<span className="text-slate-300">/{f.low}°</span>
                          </p>
                          {f.alert && (
                            <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-red-600">{f.alert}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Safety streak */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Safety streak
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <p className="num text-3xl font-medium text-slate-900">
              {safetyStreakDays}<span className="ml-1 align-baseline text-sm font-normal text-slate-400">days</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Without a recordable incident</p>
            {/* Bar viz — 30 segments, last `streak` filled */}
            <div className="mt-4 flex gap-[3px]">
              {Array.from({ length: 30 }).map((_, i) => {
                const filled = i < Math.min(30, safetyStreakDays);
                return (
                  <span
                    key={i}
                    className={`h-7 flex-1 rounded-sm ${filled ? 'bg-emerald-400' : 'bg-slate-100'}`}
                  />
                );
              })}
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-slate-400">
              Previous best: <span className="text-slate-600">{safetyBestStreak} days</span>
            </p>
          </section>

          {/* Crew on site */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Crew on site
              <Users className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="num text-3xl font-medium text-slate-900">
              {crewOnSite}<span className="ml-1 align-baseline text-sm font-normal text-slate-400">/{crewTotal}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {Math.round((crewOnSite / Math.max(1, crewTotal)) * 100)}% of registered crew clocked in
            </p>
            <div className="mt-4 flex items-center">
              <div className="flex -space-x-2">
                {crewAvatars.map((u) => (
                  <Avatar key={u.id} className="h-9 w-9 border-2 border-white">
                    <AvatarImage src={u.avatar} />
                    <AvatarFallback className="text-[10px]">
                      {u.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {crewExtra > 0 && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-medium text-white">
                    {crewExtra}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Ask anything — decorative, sets up future AI Q&A surface */}
          <section className="relative overflow-hidden rounded-xl bg-slate-900 p-5 text-white">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                <Sparkles className="h-3 w-3" />
                Ask anything
              </div>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="New question"
              >
                +
              </button>
            </div>
            <p className="display text-lg font-medium leading-tight">
              What changed on site today?
            </p>
            <div className="relative mt-4">
              <input
                type="text"
                placeholder="&quot;Tasks blocked by rebar&quot;"
                className="h-9 w-full rounded-full border border-white/10 bg-white/5 px-3 pr-9 text-xs text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
              />
              <button
                type="button"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                aria-label="Voice"
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <span
                  key={q}
                  className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
                >
                  {q}
                </span>
              ))}
            </div>
          </section>
        </div>

        {/* Main two-column grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <main className="space-y-6 min-w-0">

            {/* Active Jobs */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="On site"
                title="Active jobs"
                description="The work currently in motion"
                actionLabel="View all"
                onAction={() => navigate('/projects')}
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
                  const ringColor = job.status === 'delayed' ? '#DC2626' : '#10B981';
                  return (
                    <motion.div
                      key={job.id}
                      layout
                      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                      className="group flex flex-wrap items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-slate-50/60"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-1 w-1 flex-shrink-0 items-center justify-center">
                          <span className={`h-1 w-1 rounded-full transition-all duration-300 group-hover:h-7 group-hover:w-1.5 ${PHASE_ACCENT[job.phase] ?? 'bg-slate-300'}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{job.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {zone?.name ?? 'No zone'} · {job.phase}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center">
                          <ProgressRing percent={job.percentComplete} size={44} stroke={4} color={ringColor} />
                          <span className="absolute text-[11px] font-medium tabular-nums text-slate-900">
                            {job.percentComplete}%
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-slate-400">
                            Due {format(parseISO(job.endDate), 'MMM d')}
                          </p>
                          <span className={`mt-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badgeClass}`}>
                            {job.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* Planned vs Actual */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="Trend"
                title="Planned vs actual"
                description="Cumulative completion across every active task"
              />
              <div className="px-2 pb-4 pt-2">
                <div className="mb-2 flex items-center justify-end gap-4 px-4 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Actual
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-px w-4 border-t border-dashed border-slate-400" /> Planned
                  </span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={plannedVsActual} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="dashActual" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) => format(new Date(date), 'MMM d')}
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
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
                        dataKey="actual"
                        stroke="#10B981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#dashActual)"
                      />
                      <Line
                        type="monotone"
                        dataKey="planned"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Budget burndown — DEMO bars; wire to finance store later */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="Finance"
                title="Budget burndown"
                description="Weekly spend against committed contracts"
                actionLabel="Open ledger"
                onAction={() => navigate('/reports')}
              />
              <div className="grid gap-6 px-6 py-5 md:grid-cols-[1fr_2fr]">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    Spent / Total
                  </p>
                  <p className="num mt-1 text-3xl font-medium text-slate-900">
                    {shortMoney(DEMO_BUDGET.spent)}
                    <span className="text-slate-400"> / </span>
                    <span className="text-slate-500">{shortMoney(DEMO_BUDGET.total)}</span>
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${DEMO_BUDGET.pctSpent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">{DEMO_BUDGET.pctSpent}% spent</span>
                    <span className="mx-2 text-slate-300">▮</span>
                    {DEMO_BUDGET.pctCommitted}% committed
                  </p>
                  <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                    At current burn rate, contingency holds until <span className="font-medium text-slate-700">{DEMO_BUDGET.contingencyNote}</span>
                  </p>
                </div>

                <div>
                  <div className="flex h-32 items-end gap-3">
                    {DEMO_BUDGET.weeks.map((pct, i) => (
                      <div key={i} className="group relative flex flex-1 flex-col items-center">
                        <div
                          className="w-full rounded-t-sm transition-opacity group-hover:opacity-80"
                          style={{ height: `${pct}%`, backgroundColor: DEMO_BUDGET.weekColor(pct) }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-3 text-[10px] uppercase tracking-wider text-slate-400">
                    {DEMO_BUDGET.weeks.map((_, i) => (
                      <span key={i} className="flex-1 text-center">W{i + 1}</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Upcoming tasks */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                      <div className="flex flex-shrink-0 items-center gap-3">
                        {/* Tiny accent line — matches reference's mini sparkline marks */}
                        <Sparkline data={seededTrend(50, task.id.charCodeAt(0) + task.id.length, 10)} color="#10B981" width={50} height={14} />
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

            {/* Zone activity — heatmap row */}
            {zoneActivity.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <SectionHeader
                  eyebrow="Spatial"
                  title="Zone activity (last 24h)"
                  description="Where the work concentrated"
                />
                <div className="px-6 pb-6 pt-2">
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                    {zoneActivity.map((z) => {
                      const intensity = Math.max(0.15, z.count / zoneMax);
                      return (
                        <div key={z.id} className="text-center">
                          <div
                            className="aspect-square rounded-md"
                            style={{ backgroundColor: `rgba(16, 185, 129, ${intensity})` }}
                            title={`${z.name}: ${z.count} updates`}
                          />
                          <p className="mt-1 text-[10px] font-medium text-slate-600 truncate">{z.name}</p>
                          <p className="text-[9px] tabular-nums text-slate-400">{z.count}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}
          </main>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Next deliveries — DEMO. Wire to gantt deliveries when ready. */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    Inbound
                  </p>
                  <h3 className="display text-lg font-medium text-slate-900">Next deliveries</h3>
                </div>
                <Truck className="h-4 w-4 text-slate-400" aria-hidden />
              </div>
              <ul className="divide-y divide-slate-100">
                {DEMO_DELIVERIES.map((d) => (
                  <li key={d.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{d.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {d.vendor} · {d.when}
                      </p>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                        d.tone === 'emerald' ? 'bg-emerald-50 text-emerald-700'
                        : d.tone === 'amber' ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {d.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <WhatsNewCard />

            {/* Recent activity */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    In this project
                  </p>
                  <h3 className="display text-lg font-medium text-slate-900">Recent activity</h3>
                </div>
                <Eye className="h-4 w-4 text-slate-400" aria-hidden />
              </div>
              <ActivityFeed
                events={recentActivity}
                onSelect={handleActivitySelect}
                dense
                emptyLabel="Nothing yet — uploads, comments, and updates will appear here."
              />
            </section>

            {/* Team */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
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
                {users.slice(0, 5).map((user) => {
                  const profile = currentProfile && currentProfile.id === user.id ? currentProfile : null;
                  const sg = profile?.securityGroup ?? 'site_manager';
                  return (
                    <li key={user.id} className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9 flex-shrink-0">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="text-xs">
                            {user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
                          <p className="truncate text-[11px] capitalize text-slate-500">{user.role}</p>
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-[9px] font-medium tracking-[0.15em] text-slate-400">
                        {tradeChip(sg)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Today */}
            <section className="rounded-xl border border-slate-900 bg-slate-900 p-5 text-white">
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

      <ActivityDetailModal
        event={activeActivityEvent}
        projectId={project.id}
        navigate={navigate}
        onClose={closeActivityModal}
      />
    </motion.div>
  );
}

// ─── Reusable cells ──────────────────────────────────────────────────────

function MetricCell({
  label, value, numericValue, format, caption, spark, color, pulse, onClick,
}: {
  label: string;
  value: string;
  numericValue?: number;
  format?: (n: number) => string;
  caption: string;
  spark: number[];
  color: string;
  pulse?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
          {label}
        </p>
        <Sparkline data={spark} color={color} width={56} height={18} />
      </div>
      <p
        className="num mt-3 text-2xl font-medium text-slate-900 sm:text-3xl"
        data-just-updated={pulse ? 'true' : undefined}
      >
        {numericValue !== undefined ? <CountUp value={numericValue} format={format} /> : value}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{caption}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 text-left shadow-elev-1 transition-all hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow-elev-2"
        aria-label={`${label}: ${value}, ${caption}`}
      >
        {body}
        <ArrowUpRight className="absolute right-3 bottom-3 h-3 w-3 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-700" aria-hidden />
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-elev-1">
      {body}
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
