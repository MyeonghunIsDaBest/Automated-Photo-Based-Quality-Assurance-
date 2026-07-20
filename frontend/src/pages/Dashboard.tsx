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
import ActivityDetailModal from '../components/activity/ActivityDetailModal';
import type { ActivityEvent } from '../lib/activity/types';
import { SECURITY_GROUP_LABELS, canConfirmAIAnalysis, canViewSafetyIncident, canViewFinance, dashboardLens, isFieldRole } from '../lib/permissions';
import AuditTrailPanel from '../components/audit/AuditTrailPanel';
import type { SecurityGroup } from '../types';
import {
  ArrowUpRight,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronDown,
  Cloud,
  CloudOff,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  Wind,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PlannedVsActualTrend, plannedPctNow } from '../components/charts/PlannedVsActualTrend';
import { useProjectCrew } from '../lib/hooks/useProjectCrew';
import { format, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import CountUp from '../components/ui/CountUp';
import UpdatesCard from '../components/dashboard/UpdatesCard';
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
  in_progress: 'bg-[#EEF1F4] text-[#5B6B7B]',
  complete:    'bg-[#E5F2EA] text-[#246F47]',
  delayed:     'bg-[#FBE5E5] text-[#C44545]',
  blocked:     'bg-[#F9EFD9] text-[#9A6B12]',
  not_started: 'border border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
};

// Primary card chrome from the reference comp: 16px radius + layered paper
// shadow. (cardShell stays 14px app-wide; the Dashboard opts into 16px locally.)
const CARD =
  'rounded-[16px] border border-[#E6E1D4] bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.04),0_1px_2px_-1px_rgba(15,23,42,0.06)]';

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

  // (Activity expand/collapse + the What's-new card now live inside UpdatesCard.)

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

  // Zone-activity heatmap removed pending real zone telemetry (its counts were synthetic char-code demo data).

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
            <div className={`mt-6 flex flex-wrap items-center gap-3.5 ${CARD} px-4 py-3.5`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#1A1A1A] text-white">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#A0A0A0' }}>
                    Signed in as
                  </span>
                  <span className="text-sm font-semibold" style={{ color: '#1A1A1A', fontFamily: FRAUNCES }}>
                    {displayName || currentProfile?.email}
                  </span>
                  <span className="rounded-full bg-[#E5F2EA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: '#246F47' }}>
                    {roleLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: '#6B6B6B' }}>{roleBlurb}</p>
              </div>

              <button
                type="button"
                onClick={() => navigate('/gantt?tab=reports')}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#1A1A1A] px-4 py-2 text-[12.5px] font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:bg-[#246F47]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Open report deck
              </button>
            </div>
          )}

          {/* KPI strip */}
          <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
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
          <section className={`flex flex-col ${CARD} p-5`}>
            <div className="mb-3 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6B6B' }}>
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
                <p className="num text-[34px] font-semibold leading-none" style={{ color: '#1A1A1A' }}>
                  {weather.current.tempC}
                  <span className="ml-0.5 align-top text-base font-medium" style={{ color: '#A0A0A0' }}>°C</span>
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
          <section className={`${CARD} p-5`}>
            <div className="mb-3 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6B6B' }}>
              Crew on site
              <Users className="h-3.5 w-3.5" style={{ color: '#A0A0A0' }} />
            </div>
            <p className="num text-[32px] font-semibold leading-none" style={{ color: '#1A1A1A' }}>
              {crewOnSite}<span className="ml-1 align-baseline text-sm font-medium" style={{ color: '#A0A0A0' }}>/{crewTotal}</span>
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
          <section className={`flex flex-col ${CARD} p-5`}>
            <div className="mb-3 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6B6B' }}>
              Capture
              <Camera className="h-3.5 w-3.5" style={{ color: '#2F8F5C' }} />
            </div>
            <p className="display text-[18px] font-semibold leading-tight" style={{ color: '#1A1A1A' }}>
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
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="space-y-6 min-w-0">

            {/* Command-lens finance summary — PM + admins who can view finance. */}
            {showFinanceSummary && <FinanceSummaryCard projectId={project.id} />}

            {/* Active Jobs */}
            <section className={`overflow-hidden ${CARD}`}>
              <SectionHeader
                eyebrow="On site"
                title={`Active jobs on ${project.name}`}
                description="The work currently in motion"
                icon={Briefcase}
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
                          {/* No bare `border` here — Tailwind v4 defaults border
                              colour to currentColor, which gave the toned chips a
                              heavy saturated outline; not_started brings its own. */}
                          <span className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badgeClass}`}>
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
            <section className={`overflow-hidden ${CARD}`}>
              <SectionHeader
                eyebrow="Schedule"
                title="Task progress"
                description="Live from the Gantt — this % matches Tasks on the project"
                icon={CheckCircle2}
                actionLabel="Open Gantt"
                onAction={() => navigate(`/gantt?project=${project.id}&tab=tasks`)}
              />
              <div className="px-6 py-5">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="num text-[32px] font-semibold leading-none" style={{ color: '#1A1A1A' }}>
                      {taskBreakdown.pct}<span className="ml-0.5 align-top text-base font-medium" style={{ color: '#A0A0A0' }}>%</span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: '#6B6B6B' }}>
                      {taskBreakdown.complete}/{taskBreakdown.total} task{taskBreakdown.total === 1 ? '' : 's'} complete
                    </p>
                  </div>
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
            <section className={`overflow-hidden ${CARD}`}>
              <SectionHeader
                eyebrow="Trend"
                title="Planned vs actual"
                description="Schedule baseline (target) vs recorded progress"
                icon={TrendingUp}
              />
              <div className="px-2 pb-4 pt-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 text-[11px]" style={{ color: '#6B6B6B' }}>
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
                      <span className="inline-block h-0 w-4 border-t-2 border-[#2F8F5C]" /> Actual
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

          </main>

          {/* Sidebar — min-w-0 so a wide child (long feed strings, tabular
              numerals) can never stretch this grid track past the viewport. */}
          <aside className="min-w-0 space-y-6">
            {/* Updates — Activity + What's-new merged behind one toggle, with
                the "you were last here" catch-up line (P9.B dashboard rework) */}
            <UpdatesCard
              events={recentActivity}
              onSelect={handleActivitySelect}
              userId={currentProfile?.id ?? null}
            />

            {/* Team */}
            <section className={`${CARD} p-5`}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6B6B' }}>
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
            <section className="rounded-[16px] bg-[#1A1A1A] p-5 text-white">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#A8D0B8' }}>
                Today
              </p>
              <p className="display mt-2 text-[20px] font-semibold">
                {stats.photosToday} photo{stats.photosToday === 1 ? '' : 's'} captured
              </p>
              <p className="mt-1 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {stats.tasksInProgress} task{stats.tasksInProgress === 1 ? '' : 's'} in motion ·{' '}
                {stats.delayedTasks} delayed
              </p>
              <button
                onClick={() => navigate('/gallery')}
                className="mt-3.5 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-white/10"
              >
                <Camera className="h-3.5 w-3.5" />
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
              aria-expanded={auditOpen}
              className={`flex w-full items-center justify-between gap-3 ${CARD} px-5 py-3.5 text-left transition-colors hover:bg-[#FAF8F2]`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Audit trail
                </span>
                <span className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#A0A0A0]">
                  {auditLogs.length}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-[#A0A0A0] transition-transform duration-200 ${auditOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
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
      <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6B6B' }}>
        {label}
      </p>
      <p
        className="num mt-2 text-2xl font-semibold"
        style={{ color: '#1A1A1A' }}
        data-just-updated={pulse ? 'true' : undefined}
      >
        {numericValue !== undefined ? <CountUp value={numericValue} format={format} /> : value}
      </p>
      <p className="mt-0.5 text-[11px]" style={{ color: '#A0A0A0' }}>{caption}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`group relative overflow-hidden ${CARD} p-3.5 text-left transition-all hover:-translate-y-px hover:border-[#D8D2C4] hover:bg-[#FAF8F2] hover:shadow-[0_4px_16px_rgba(20,20,20,0.08)]`}
        aria-label={`${label}: ${value}, ${caption}`}
      >
        {body}
        <ArrowUpRight className="absolute right-2.5 bottom-2.5 h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" style={{ color: '#D8D2C4' }} aria-hidden />
      </button>
    );
  }

  return (
    <div className={`${CARD} p-3.5`}>
      {body}
    </div>
  );
}

function SectionHeader({
  eyebrow, title, description, icon: Icon, actionLabel, onAction,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5" style={{ borderColor: '#E6E1D4' }}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#1A1A1A] text-white" aria-hidden>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6B6B' }}>
            {eyebrow}
          </p>
          <h2 className="mt-px text-[18px] font-medium" style={{ textWrap: 'balance', color: '#1A1A1A', fontFamily: FRAUNCES }}>{title}</h2>
          {description && <p className="mt-0.5 text-[12px]" style={{ color: '#6B6B6B' }}>{description}</p>}
        </div>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold transition-colors hover:border-[#D8D2C4] hover:bg-[#FAF8F2]"
          style={{ color: '#3A3A3A' }}
        >
          {actionLabel}
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
