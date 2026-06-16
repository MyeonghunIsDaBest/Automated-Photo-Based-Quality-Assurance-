import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { useDashboardStats, useActiveJobs } from '../store/dashboard';
import { useProjectActivity } from '../lib/hooks/useProjectActivity';
import { useDashboardCounts } from '../lib/hooks/useDashboardCounts';
import { useWeather, type WeatherTone } from '../lib/hooks/useWeather';
import { uploadPhoto } from '../lib/api/photos';
import { supabaseConfigured } from '../lib/supabase';
import ActivityFeed from '../components/activity/ActivityFeed';
import ActivityDetailModal from '../components/activity/ActivityDetailModal';
import type { ActivityEvent } from '../lib/activity/types';
import { SECURITY_GROUP_LABELS, canConfirmAIAnalysis, canViewSafetyIncident, canViewFinance, dashboardLens, isFieldRole } from '../lib/permissions';
import AuditTrailPanel from '../components/audit/AuditTrailPanel';
import type { SecurityGroup } from '../types';
import {
  ArrowUpRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cloud,
  CloudOff,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Image as ImageIcon,
  ListChecks,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Wind,
  Eye,
} from 'lucide-react';
import { PlannedVsActualTrend, plannedPctNow } from '../components/charts/PlannedVsActualTrend';
import { useProjectCrew } from '../lib/hooks/useProjectCrew';
import { format, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import CountUp from '../components/ui/CountUp';
import WhatsNewCard from '../components/dashboard/WhatsNewCard';
import ProjectStatusCard from '../components/ai/ProjectStatusCard';
import DailyBriefCard from '../components/ai/DailyBriefCard';
import AskAnythingCard from '../components/dashboard/AskAnythingCard';
import PortfolioRollupBand from '../components/dashboard/PortfolioRollupBand';
import FinanceSummaryCard from '../components/dashboard/FinanceSummaryCard';
import { FRAUNCES } from './gantt/components/ledger';

// Per-role capability summary shown in the welcome strip. Keep it short —
// the source of truth for actual permissions is `lib/permissions.ts`.
const ROLE_BLURB: Record<SecurityGroup, string> = {
  company_admin:    'Full overview · manage users, projects, finance, and Gantt across every site.',
  administrator:    'Manage users, stakeholders, and suppliers. Full project visibility.',
  construction_mgr: 'Multi-site oversight. Edit projects, tasks, and add comments.',
  project_manager:  'Plan + scheduling. Edit Gantt, run reports, edit tasks.',
  worker:           'Field crew. Upload photos against tasks, leave notes, view your assignments.',
  dev:              'Developer — hidden superuser with full access across every surface.',
  stakeholder:      'Read-only client view. Track progress and review reports for your linked projects.',
  supplier:         'Read-only vendor view. See your scoped orders, deliveries, invoices, and warranties.',
  customer:         'Property owner portal. Log and track maintenance requests for your properties.',
};

const STATUS_BADGE: Record<string, string> = {
  in_progress: 'border-[#C7D2DC] bg-[#EEF1F4] text-[#5B6B7B]',
  complete:    'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  delayed:     'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
  blocked:     'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  not_started: 'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
};

const PHASE_ACCENT: Record<string, string> = {
  excavation: 'bg-[#C8841E]',
  foundation: 'bg-[#5B6B7B]',
  framing:    'bg-[#B5602A]',
  roofing:    'bg-[#C26A6A]',
  electrical: 'bg-[#D69A2E]',
  plumbing:   'bg-[#5B8AA0]',
  drywall:    'bg-[#8A7AA0]',
  finishing:  'bg-[#2F8F5C]',
};

// ─── Helpers ──────────────────────────────────────────────────────────────

// Donut-style circular progress used on Active-Jobs rows. Pure SVG so it
// renders inline without a chart library wrapper.
function ProgressRing({ percent, size = 44, stroke = 4, color = '#2F8F5C' }: {
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
        stroke="#EFEBE0"
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
    case 'sun':    return { Icon: Sun,            color: 'text-[#D69A2E]' };
    case 'partly': return { Icon: Cloud,          color: 'text-[#D69A2E]' };
    case 'cloud':  return { Icon: Cloud,          color: 'text-[#A0A0A0]' };
    case 'rain':   return { Icon: CloudRain,      color: 'text-[#5B8AA0]' };
    case 'storm':  return { Icon: CloudLightning, color: 'text-[#8A7AA0]' };
    case 'snow':   return { Icon: CloudSnow,      color: 'text-[#D8D2C4]' };
    case 'fog':    return { Icon: CloudFog,       color: 'text-[#D8D2C4]' };
    default:       return { Icon: Cloud,          color: 'text-[#A0A0A0]' };
  }
}

// Map a security_group label → short trade chip displayed on the Team row.
function tradeChip(group: SecurityGroup): string {
  switch (group) {
    case 'construction_mgr': return 'GENERAL';
    case 'project_manager':  return 'GENERAL';
    case 'company_admin':    return 'ADMIN';
    case 'administrator':    return 'ADMIN';
    case 'worker':           return 'FIELD';
    case 'stakeholder':      return 'CLIENT';
    case 'supplier':         return 'VENDOR';
    case 'customer':         return 'OWNER';
    default:                 return '—';
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { users, zones, project, auditLogs, currentProfile, currentUser, setNotification } = useAppStore();
  const stats = useDashboardStats();
  // Role-adaptive lens (Phase 1): construction_mgr → portfolio rollup band,
  // project_manager + admins → command (+ finance summary). Managers/admins all
  // share this one Dashboard.
  const lens = dashboardLens(currentProfile);
  const showFinanceSummary = lens === 'command' && canViewFinance(currentUser);
  const activeJobs = useActiveJobs(6);
  const progressTrend = useFeatureStore((s) => s.progressHistory);
  const allTasks = useFeatureStore((s) => s.tasks);
  // Fetch more activity than we show so "Show more" can reveal without a refetch.
  const recentActivity = useProjectActivity(project.id, { limit: 20 });
  const dashboardCounts = useDashboardCounts(project.id);

  // Photo-capture card (replaces the floating FAB) — opens the device camera /
  // file picker and uploads straight to this project, same path as Uploads.
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const [capturing, setCapturing] = useState(false);
  const handleCapture = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!supabaseConfigured()) {
      setNotification({ message: 'Uploads need Supabase configured.', type: 'error' });
      return;
    }
    setCapturing(true);
    try {
      await uploadPhoto({ file, projectId: project.id });
      setNotification({ message: 'Photo uploaded — AI analysis queued.', type: 'success' });
    } catch (e) {
      setNotification({ message: e instanceof Error ? e.message : 'Upload failed.', type: 'error' });
    } finally {
      setCapturing(false);
      if (captureInputRef.current) captureInputRef.current.value = '';
    }
  };

  // Audit trail section expand/collapse (collapsed by default).
  const [auditOpen, setAuditOpen] = useState(false);

  // Recent-activity expand/collapse.
  const [showAllActivity, setShowAllActivity] = useState(false);
  const ACTIVITY_PREVIEW = 5;
  const visibleActivity = showAllActivity ? recentActivity : recentActivity.slice(0, ACTIVITY_PREVIEW);

  // Task progress breakdown — live from the SAME task store the Gantt reads
  // (project-scoped, phase anchors excluded), so the % here matches /gantt/tasks.
  const taskBreakdown = useMemo(() => {
    const pts = allTasks.filter((t) => t.projectId === project.id && !t.isPhaseAnchor);
    const by = (s: string) => pts.filter((t) => t.status === s).length;
    const total = pts.length;
    const pct = total ? Math.round(pts.reduce((s, t) => s + t.percentComplete, 0) / total) : 0;
    return {
      total, pct,
      complete: by('complete'),
      inProgress: by('in_progress'),
      notStarted: by('not_started'),
      delayed: by('delayed'),
      blocked: by('blocked'),
    };
  }, [allTasks, project.id]);

  const taskSegments = useMemo(() => [
    { label: 'Complete',    value: taskBreakdown.complete,   color: '#2F8F5C' },
    { label: 'In progress', value: taskBreakdown.inProgress, color: '#C8841E' },
    { label: 'Not started', value: taskBreakdown.notStarted, color: '#D8D2C4' },
    { label: 'Delayed',     value: taskBreakdown.delayed,    color: '#C44545' },
    { label: 'Blocked',     value: taskBreakdown.blocked,    color: '#5B6B7B' },
  ], [taskBreakdown]);
  const taskDenom = Math.max(1, taskBreakdown.total);

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

  // Crew on site — the real project roster + live clock-ins (same source as
  // Site Diary → Crew), via shared useProjectCrew. No more org-wide guesswork.
  const { roster: crewRoster, total: crewTotal, onSite: crewOnSite } = useProjectCrew(project.id);
  const crewAvatars = crewRoster.slice(0, 5);
  const crewExtra = Math.max(0, crewTotal - crewAvatars.length);

  // Zone activity — counts active tasks per zone for the last-24h heatmap.
  // Scoped to the active project so a brand-new project doesn't show zones
  // belonging to sibling projects in the same store.
  const zoneActivity = useMemo(() => {
    return zones.filter((z) => z.projectId === project.id).slice(0, 10).map((z) => {
      // Derive a "load" number deterministically per zone so demo data
      // still has visual variation. Real impl: photos uploaded per zone.
      const seed = z.id.charCodeAt(z.id.length - 1) + z.id.charCodeAt(0);
      const count = (seed * 13) % 100;
      return { id: z.id, name: z.name, count };
    });
  }, [zones, project.id]);
  const zoneMax = Math.max(1, ...zoneActivity.map((z) => z.count));

  // Schedule variance vs the linear planned baseline — the SAME source the Gantt
  // Overview trend uses (plannedPctNow), so the Dashboard and Overview agree.
  // variance = actual overall − where the schedule says we should be by today.
  const plannedNow = plannedPctNow(project.startDate, project.endDate);
  const variance = stats.overallProgress - plannedNow;
  const behindSchedule = stats.delayedTasks > 0 || variance < 0;

  return (
    <motion.div
      className="editorial-root min-h-full bg-[#FAF8F2]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
    >
      {/* ─── Editorial header ─────────────────────────────────────── */}
      <header className="border-b border-[#E6E1D4] bg-white">
        <div className="relative mx-auto w-full max-w-[1400px] px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          {/* Hero */}
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: '#6B6B6B' }}>
            <span className="inline-block h-px w-6" style={{ backgroundColor: '#A0A0A0' }} />
            Workspace · {project.name}
          </div>
          <h1
            className="display text-2xl font-medium leading-[0.95] tracking-[-0.02em] sm:text-5xl md:text-6xl"
            style={{ textWrap: 'balance', color: '#1A1A1A', fontFamily: FRAUNCES }}
          >
            The <em className="font-normal italic" style={{ color: '#246F47' }}>brief</em>.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed" style={{ color: '#6B6B6B' }}>
            Today's pulse — what's moving, what's overdue, what's worth your attention before
            the next coffee.
          </p>

          {/* Identity strip */}
          {roleLabel && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[14px] border border-[#E6E1D4] bg-white px-4 py-3 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1A1A1A] text-white">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em]" style={{ color: '#A0A0A0' }}>
                    Signed in as
                  </span>
                  <span className="display text-sm font-medium" style={{ color: '#1A1A1A' }}>
                    {displayName || currentProfile?.email}
                  </span>
                  <span className="rounded-full bg-[#E5F2EA] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: '#246F47' }}>
                    {roleLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: '#6B6B6B' }}>{roleBlurb}</p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/gantt?tab=reports')}
                className="group flex shrink-0 items-center gap-1.5 rounded-full bg-[#1A1A1A] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#246F47]"
              >
                <Sparkles className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px" />
                Open report deck
              </button>
            </div>
          )}

          {/* KPI strip */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCell
              label="Tasks Complete"
              value={`${stats.tasksComplete}/${stats.totalTasks}`}
              caption={`${stats.tasksInProgress} in progress`}
              pulse={false}
            />
            <MetricCell
              label="Overall Progress"
              value={`${stats.overallProgress}%`}
              numericValue={stats.overallProgress}
              format={(n) => `${Math.round(n)}%`}
              caption={stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'On track'}
            />
            <MetricCell
              label="Photos this week"
              value={stats.photosThisWeek.toString()}
              numericValue={stats.photosThisWeek}
              caption={`+${stats.photosToday} today`}
            />
            <MetricCell
              label="Days remaining"
              value={stats.daysRemaining.toString()}
              numericValue={stats.daysRemaining}
              caption={stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'Schedule holding'}
            />
            {canSeeHazardTile && (
              <MetricCell
                label="Open AI hazards"
                value={dashboardCounts.loading ? '—' : dashboardCounts.openHazards.toString()}
                numericValue={dashboardCounts.loading ? undefined : dashboardCounts.openHazards}
                caption={dashboardCounts.openHazards > 0 ? 'Action required' : 'No open hazards'}
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
                pulse={reviewPulse}
                onClick={() => navigate(`/review-queue?project=${project.id}`)}
              />
            )}
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
        {/* Construction Manager portfolio lens — multi-project rollup above the
            single-project detail. Renders nothing for other roles. */}
        {lens === 'portfolio' && <PortfolioRollupBand />}

        {/* AI · Today's brief — warm one-paragraph narrative (rides the same daily cache) */}
        <div className="mb-6">
          <DailyBriefCard projectId={project.id} />
        </div>

        {/* AI · Project synthesis — Claude reads confirmed photo evidence per phase */}
        <div className="mb-6">
          <ProjectStatusCard projectId={project.id} />
        </div>

        {/* Conditions + actions — Weather · Crew · Photo capture · Ask anything
            in one equal-height row (4-up on wide, 2-up on tablet, stacked on
            phones). */}
        <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Weather — live from Open-Meteo; geolocation w/ Melbourne fallback */}
          <section className="flex flex-col rounded-[14px] border border-[#E6E1D4] bg-white p-5">
            <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: '#6B6B6B' }}>
              <span className="truncate">
                {weather.locationLabel ? `${weather.locationLabel} weather` : 'On-site weather'}
              </span>
              {weather.current ? (() => {
                const { Icon, color } = weatherIconFor(weather.current.tone);
                return <Icon className={`h-3.5 w-3.5 ${color}`} />;
              })() : (
                <Cloud className="h-3.5 w-3.5" style={{ color: '#D8D2C4' }} />
              )}
            </div>

            {weather.loading && (
              <div className="flex flex-1 items-center justify-center py-8">
                <p className="text-sm" style={{ color: '#A0A0A0' }}>Loading…</p>
              </div>
            )}

            {!weather.loading && weather.error && !weather.current && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                <CloudOff className="h-7 w-7" style={{ color: '#D8D2C4' }} aria-hidden />
                <p className="text-sm font-medium" style={{ color: '#3A3A3A' }}>Weather unavailable</p>
                <p className="max-w-[200px] text-[11px] leading-relaxed" style={{ color: '#A0A0A0' }}>
                  The weather service is momentarily unreachable — this usually clears on its own.
                </p>
                <button
                  type="button"
                  onClick={() => weather.refetch()}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] px-3 py-1 text-xs font-medium transition-colors hover:border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white"
                  style={{ color: '#3A3A3A' }}
                >
                  <RotateCw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}

            {weather.current && (
              <>
                <p className="num text-4xl font-medium" style={{ color: '#1A1A1A' }}>
                  {weather.current.tempC}
                  <span className="ml-0.5 align-top text-base" style={{ color: '#A0A0A0' }}>°C</span>
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: '#6B6B6B' }}>
                  <span className="inline-flex items-center gap-1">
                    <Wind className="h-3 w-3" />{weather.current.windKmh} km/h
                  </span>
                  <span>○ {weather.current.humidity}%</span>
                  <span>◌ {weather.current.precipPct}%</span>
                </div>

                {weather.stale && (
                  <p className="mt-2 inline-flex w-fit items-center rounded-full bg-[#F9EFD9] px-2 py-0.5 text-[10px] font-medium" style={{ color: '#C8841E' }}>
                    Last known — live data unavailable
                  </p>
                )}

                {weather.forecast.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: '#EFEBE0' }}>
                    {weather.forecast.map((f) => {
                      const { Icon, color } = weatherIconFor(f.tone);
                      return (
                        <div key={f.day} className="text-center">
                          <p className="text-[9px] font-medium tracking-[0.15em]" style={{ color: '#A0A0A0' }}>{f.day}</p>
                          <div className="my-1 flex justify-center">
                            <Icon className={`h-4 w-4 ${color}`} />
                          </div>
                          <p className="text-[11px] tabular-nums" style={{ color: '#3A3A3A' }}>
                            {f.high}°<span style={{ color: '#D8D2C4' }}>/{f.low}°</span>
                          </p>
                          {f.alert && (
                            <p className="mt-0.5 text-[9px] font-semibold tracking-wider" style={{ color: '#C44545' }}>{f.alert}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Crew on site */}
          <section className="rounded-[14px] border border-[#E6E1D4] bg-white p-5">
            <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: '#6B6B6B' }}>
              Crew on site
              <Users className="h-3.5 w-3.5" style={{ color: '#A0A0A0' }} />
            </div>
            <p className="num text-4xl font-medium" style={{ color: '#1A1A1A' }}>
              {crewOnSite}<span className="ml-1 align-baseline text-base font-normal" style={{ color: '#A0A0A0' }}>/{crewTotal}</span>
            </p>
            <p className="mt-1 text-sm" style={{ color: '#6B6B6B' }}>
              {Math.round((crewOnSite / Math.max(1, crewTotal)) * 100)}% of registered crew clocked in
            </p>
            <div className="mt-4 flex items-center">
              <div className="flex -space-x-2">
                {crewAvatars.map((m) => (
                  <Avatar key={m.userId} className="h-9 w-9 border-2 border-white">
                    <AvatarImage src={users.find((u) => u.id === m.userId)?.avatar} />
                    <AvatarFallback className="text-[10px]">
                      {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {crewExtra > 0 && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#1A1A1A] text-[10px] font-medium text-white">
                    {crewExtra}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Photo capture — opens the camera/file picker and uploads to this
              project (replaces the old floating FAB). Paired with Ask anything. */}
          <section className="flex flex-col rounded-[14px] border border-[#E6E1D4] bg-white p-5">
            <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: '#6B6B6B' }}>
              Capture
              <Camera className="h-3.5 w-3.5" style={{ color: '#2F8F5C' }} />
            </div>
            <p className="display text-2xl font-medium leading-tight" style={{ color: '#1A1A1A' }}>
              Snap a site photo.
            </p>
            <p className="mt-1.5 text-sm" style={{ color: '#6B6B6B' }}>
              Lands in {project.name}'s gallery and feeds the AI analyzer.
            </p>
            <button
              type="button"
              onClick={() => captureInputRef.current?.click()}
              disabled={capturing}
              className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-[#1A1A1A] px-4 py-2 pt-2 text-xs font-medium text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" />
              {capturing ? 'Uploading…' : 'Capture or upload'}
            </button>
            <input
              ref={captureInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { void handleCapture(e.target.files); }}
            />
          </section>

          {/* Ask anything — real single-turn project Q&A (Tier-3 #14). */}
          <AskAnythingCard projectId={project.id} />
        </div>

        {/* Main two-column grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <main className="space-y-6 min-w-0">

            {/* Command-lens finance summary — PM + admins who can view finance. */}
            {showFinanceSummary && <FinanceSummaryCard projectId={project.id} />}

            {/* Active Jobs */}
            <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white">
              <SectionHeader
                eyebrow="On site"
                title={`Active jobs on ${project.name}`}
                description="The work currently in motion"
                actionLabel="View all"
                onAction={() => navigate('/projects')}
              />
              <div className="divide-y" style={{ borderColor: '#EFEBE0' }}>
                {activeJobs.length === 0 && (
                  <p className="px-6 py-8 text-center text-sm italic" style={{ color: '#A0A0A0' }}>
                    No active tasks right now.
                  </p>
                )}
                {activeJobs.map((job) => {
                  const zone = zones.find((z) => z.id === job.zoneId);
                  const badgeClass = STATUS_BADGE[job.status] ?? STATUS_BADGE.not_started;
                  const ringColor = job.status === 'delayed' ? '#C44545' : '#2F8F5C';
                  return (
                    <motion.div
                      key={job.id}
                      layout
                      transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                      className="group flex flex-wrap items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-[#FAF8F2]/60"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-1 w-1 shrink-0 items-center justify-center">
                          <span className={`h-1 w-1 rounded-full transition-all duration-300 group-hover:h-7 group-hover:w-1.5 ${PHASE_ACCENT[job.phase] ?? 'bg-[#D8D2C4]'}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium" style={{ color: '#1A1A1A' }}>{job.name}</p>
                          <p className="truncate text-xs" style={{ color: '#6B6B6B' }}>
                            {zone?.name ?? 'No zone'} · {job.phase}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center">
                          <ProgressRing percent={job.percentComplete} size={38} stroke={4} color={ringColor} />
                          <span className="absolute text-[11px] font-medium tabular-nums" style={{ color: '#1A1A1A' }}>
                            {job.percentComplete}%
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px]" style={{ color: '#A0A0A0' }}>
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

            {/* Task progress — breakdown that mirrors the Gantt's task %. */}
            <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white">
              <SectionHeader
                eyebrow="Schedule"
                title="Task progress"
                description="Live from the Gantt — this % matches Tasks on the project"
                actionLabel="Open Gantt"
                onAction={() => navigate(`/gantt?project=${project.id}&tab=tasks`)}
              />
              <div className="px-6 py-5">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="num text-4xl font-medium leading-none" style={{ color: '#1A1A1A' }}>
                      {taskBreakdown.pct}<span className="ml-0.5 align-top text-xl" style={{ color: '#A0A0A0' }}>%</span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: '#6B6B6B' }}>
                      {taskBreakdown.complete}/{taskBreakdown.total} task{taskBreakdown.total === 1 ? '' : 's'} complete
                    </p>
                  </div>
                  <ListChecks className="h-5 w-5" style={{ color: '#D8D2C4' }} aria-hidden />
                </div>

                {/* Stacked status bar — proportions of each task status */}
                <div className="mb-4 flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: '#EFEBE0' }}>
                  {taskSegments.map((s) =>
                    s.value > 0 ? (
                      <div
                        key={s.label}
                        className="h-full"
                        style={{ width: `${(s.value / taskDenom) * 100}%`, backgroundColor: s.color }}
                        title={`${s.label}: ${s.value}`}
                      />
                    ) : null,
                  )}
                </div>

                <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                  {taskSegments.map((s) => (
                    <li key={s.label} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="truncate" style={{ color: '#3A3A3A' }}>{s.label}</span>
                      </span>
                      <span className="tabular-nums font-medium" style={{ color: '#1A1A1A' }}>{s.value}</span>
                    </li>
                  ))}
                </ul>

                {taskBreakdown.total === 0 && (
                  <p className="mt-3 text-xs" style={{ color: '#A0A0A0' }}>
                    No tasks yet — add tasks in the Gantt and this breakdown fills in.
                  </p>
                )}
              </div>
            </section>

            {/* Planned vs Actual */}
            <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white">
              <SectionHeader
                eyebrow="Trend"
                title="Planned vs actual"
                description="Schedule baseline (target) vs recorded progress"
              />
              <div className="px-2 pb-4 pt-2">
                <div className="mb-2 flex items-center justify-between gap-3 px-4 text-[11px]" style={{ color: '#6B6B6B' }}>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={
                      behindSchedule
                        ? { backgroundColor: '#FBE5E5', color: '#C44545' }
                        : { backgroundColor: '#E5F2EA', color: '#246F47' }
                    }
                  >
                    {variance < 0 ? `${Math.abs(variance)}% behind` : behindSchedule ? 'Behind schedule' : 'On track'}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#2F8F5C]" /> Actual
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[#C44545]" /> Planned
                    </span>
                  </span>
                </div>
                <PlannedVsActualTrend
                  start={project.startDate}
                  end={project.endDate}
                  history={progressTrend}
                  overall={stats.overallProgress}
                  heightClass="h-64"
                />
              </div>
            </section>

            {/* Zone activity — heatmap row */}
            {zoneActivity.length > 0 && (
              <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white">
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
                            style={{ backgroundColor: `rgba(47, 143, 92, ${intensity})` }}
                            title={`${z.name}: ${z.count} updates`}
                          />
                          <p className="mt-1 text-[10px] font-medium truncate" style={{ color: '#3A3A3A' }}>{z.name}</p>
                          <p className="text-[9px] tabular-nums" style={{ color: '#A0A0A0' }}>{z.count}</p>
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
            <WhatsNewCard />

            {/* Recent activity */}
            <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: '#6B6B6B' }}>
                    In this project
                  </p>
                  <h3 className="display text-lg font-medium" style={{ color: '#1A1A1A' }}>Recent activity</h3>
                </div>
                <Eye className="h-4 w-4" style={{ color: '#A0A0A0' }} aria-hidden />
              </div>
              <ActivityFeed
                events={visibleActivity}
                onSelect={handleActivitySelect}
                dense
                emptyLabel="Nothing yet — uploads, comments, and updates will appear here."
              />
              {recentActivity.length > ACTIVITY_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((v) => !v)}
                  className="flex w-full items-center justify-center gap-1.5 border-t px-5 py-2.5 text-xs font-medium transition-colors hover:bg-[#FAF8F2]"
                  style={{ borderColor: '#EFEBE0', color: '#3A3A3A' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#1A1A1A'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#3A3A3A'; }}
                >
                  {showAllActivity ? (
                    <>Show less <ChevronUp className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Show {recentActivity.length - ACTIVITY_PREVIEW} more <ChevronDown className="h-3.5 w-3.5" /></>
                  )}
                </button>
              )}
            </section>

            {/* Team */}
            <section className="rounded-[14px] border border-[#E6E1D4] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: '#6B6B6B' }}>
                    On the roster
                  </p>
                  <h3 className="display text-lg font-medium" style={{ color: '#1A1A1A' }}>Team</h3>
                </div>
                <Users className="h-4 w-4" style={{ color: '#A0A0A0' }} />
              </div>
              <ul className="space-y-3">
                {crewRoster.length === 0 ? (
                  <li className="text-sm" style={{ color: '#6B6B6B' }}>No one on the roster yet — add a worker from Site Diary → Crew.</li>
                ) : crewRoster.slice(0, 6).map((m) => {
                  const u = users.find((x) => x.id === m.userId);
                  const sg = u?.securityGroup ?? 'worker';
                  return (
                    <li key={m.userId} className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={u?.avatar} />
                          <AvatarFallback className="text-xs">
                            {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" style={{ color: '#1A1A1A' }}>{m.name}</p>
                          <p className="truncate text-[11px] capitalize" style={{ color: '#6B6B6B' }}>{SECURITY_GROUP_LABELS[sg] ?? m.role}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[9px] font-medium tracking-[0.15em]" style={{ color: '#A0A0A0' }}>
                        {tradeChip(sg)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Today */}
            <section className="rounded-[14px] border bg-[#1A1A1A] p-5 text-white" style={{ borderColor: '#1A1A1A' }}>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: '#A8D0B8' }}>
                Today
              </p>
              <p className="display mt-1 text-2xl font-medium">
                {stats.photosToday} photo{stats.photosToday === 1 ? '' : 's'} captured
              </p>
              <p className="mt-2 text-xs" style={{ color: '#D8D2C4' }}>
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

        {/* ─── Audit trail — collapsed section, non-field roles only ─────── */}
        {!isFieldRole(currentProfile) && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setAuditOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#E6E1D4] bg-white px-6 py-4 text-left shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition-colors hover:bg-[#FAF8F2]"
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6B6B6B]">
                  Audit Trail
                </span>
                <span className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[#6B6B6B]">
                  {auditLogs.length}
                </span>
              </div>
              {auditOpen ? (
                <ChevronDown className="h-4 w-4 text-[#A0A0A0]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#A0A0A0]" />
              )}
            </button>
            {auditOpen && (
              <div className="mt-3">
                <AuditTrailPanel />
              </div>
            )}
          </div>
        )}
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
  label, value, numericValue, format, caption, pulse, onClick,
}: {
  label: string;
  value: string;
  numericValue?: number;
  format?: (n: number) => string;
  caption: string;
  pulse?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: '#6B6B6B' }}>
        {label}
      </p>
      <p
        className="num mt-3 text-2xl font-medium sm:text-3xl"
        style={{ color: '#1A1A1A' }}
        data-just-updated={pulse ? 'true' : undefined}
      >
        {numericValue !== undefined ? <CountUp value={numericValue} format={format} /> : value}
      </p>
      <p className="mt-1 text-[11px]" style={{ color: '#A0A0A0' }}>{caption}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white p-4 text-left shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition-all hover:-translate-y-px hover:border-[#D8D2C4] hover:bg-[#FAF8F2] hover:shadow-[0_4px_16px_rgba(20,20,20,0.08)]"
        aria-label={`${label}: ${value}, ${caption}`}
      >
        {body}
        <ArrowUpRight className="absolute right-3 bottom-3 h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" style={{ color: '#D8D2C4' }} aria-hidden />
      </button>
    );
  }

  return (
    <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
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
    <div className="flex flex-col gap-3 border-b px-4 py-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:px-6" style={{ borderColor: '#EFEBE0' }}>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: '#6B6B6B' }}>
          {eyebrow}
        </p>
        <h2 className="display mt-1 text-xl font-medium" style={{ textWrap: 'balance', color: '#1A1A1A', fontFamily: FRAUNCES }}>{title}</h2>
        {description && <p className="mt-1 text-sm" style={{ color: '#6B6B6B' }}>{description}</p>}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="group inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] px-3 py-1.5 text-xs font-medium transition-colors hover:border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white"
          style={{ color: '#3A3A3A' }}
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
