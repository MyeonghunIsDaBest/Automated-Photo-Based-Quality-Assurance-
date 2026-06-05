import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  BarChart3,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Filter,
  FolderKanban,
  Lock,
  PenLine,
  Plus,
  Printer,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useProjectAccessGuard } from '../lib/hooks/useProjectAccessGuard';
import { useFeatureStore } from '../store/features';
import { useFinanceStore, InvoiceStatus } from '../store/finance';
import { useProjectsListStore } from './projects/store';
import { canViewFinance, canEditFinance } from '../lib/permissions';
import { updateProject } from '../lib/api/projects';
import { supabaseConfigured } from '../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { GanttChart } from '../components/ui/GanttChart';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AuditLog, Report } from '../types';
import { EditorialButton, StatCell } from '../components/editorial';
import { useEffect } from 'react';
import { listProjectReports, generateReportNow } from '../lib/api/reports';
import { listSafetyIncidents, type SafetyIncident } from '../lib/api/safetyIncidents';
import { listSignoffs, type Signoff } from '../lib/api/signoffs';
import { FRAUNCES } from './gantt/components/ledger';
import { PlannedVsActualTrend } from '../components/charts/PlannedVsActualTrend';

// ─────────────────────────────────────────────────────────────────────────────
// Tokens & helpers

type ReportTab = 'progress' | 'financial' | 'audit' | 'safety' | 'signoffs';
type ReportType = Report['reportType']; // 'daily' | 'weekly' | 'monthly'
type EntityFilter = 'all' | AuditLog['entityType'];

const REPORT_TYPE_META: Record<ReportType, { label: string; window: string; Icon: typeof CalendarDays; accent: string }> = {
  daily:   { label: 'Daily',   window: 'Today',             Icon: CalendarDays,  accent: '#2F8F5C' },
  weekly:  { label: 'Weekly',  window: 'Last 7 days',       Icon: CalendarRange, accent: '#246F47' },
  monthly: { label: 'Monthly', window: 'Last 30 days',      Icon: Calendar,      accent: '#6B6B6B' },
};

const ENTITY_FILTERS: { value: EntityFilter; label: string }[] = [
  { value: 'all',     label: 'All' },
  { value: 'project', label: 'Project' },
  { value: 'task',    label: 'Task' },
  { value: 'photo',   label: 'Photo' },
  { value: 'user',    label: 'User' },
];

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  paid:    'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  pending: 'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  overdue: 'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
  draft:   'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
};

// Real `safety_incidents` rendering on the Safety tab (P1.8).
const INCIDENT_STATUS_TONE: Record<SafetyIncident['status'], string> = {
  open:         'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
  acknowledged: 'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  resolved:     'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  dismissed:    'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
};
const INCIDENT_FLAG_LABEL: Record<string, string> = {
  no_hard_hat:     'No hard hat',
  exposed_wiring:  'Exposed wiring',
  fall_hazard:     'Fall hazard',
  unsecured_load:  'Unsecured load',
  housekeeping:    'Housekeeping',
  signage_missing: 'Signage missing',
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);


const TABS: { key: ReportTab; label: string; Icon: typeof BarChart3 }[] = [
  { key: 'progress',  label: 'Progress',  Icon: BarChart3 },
  { key: 'financial', label: 'Financial', Icon: FileText  },
  { key: 'audit',     label: 'Audit',     Icon: Activity  },
  { key: 'safety',    label: 'Safety',    Icon: Shield    },
  { key: 'signoffs',  label: 'Sign-offs', Icon: PenLine   },
];

// ═════════════════════════════════════════════════════════════════════════════

export default function Reports() {
  const { project, auditLogs, users, currentUser } = useAppStore();
  const projectsList = useProjectsListStore((s) => s.projects);

  // Bounce field-role users away from projects they weren't invited to.
  useProjectAccessGuard(project?.id);
  const tasks = useFeatureStore((s) => s.tasks);
  const progressTrend = useFeatureStore((s) => s.progressHistory);
  const budgets = useFinanceStore((s) => s.budgets);
  const invoices = useFinanceStore((s) => s.invoices);
  const setBudget = useFinanceStore((s) => s.setBudget);

  // Backs the "Set budget" flow on the Financial tab. Replaces the old
  // window.prompt() (P-Tier2 #10) with the warm SetBudgetModal below; this
  // just performs the persistence once the modal returns a validated amount.
  // Updates the local Zustand store (so the tab refreshes immediately) and,
  // on real Supabase projects, also persists to `projects.budget` so the
  // value survives a reload.
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const persistBudget = async (total: number) => {
    if (!financialProjectId) return;
    setBudget({ projectId: financialProjectId, total, spent: 0, committed: 0 });
    if (supabaseConfigured() && UUID_RE.test(financialProjectId)) {
      try {
        await updateProject(financialProjectId, { budget: total });
      } catch (e) {
        window.alert(
          `Saved locally but could not persist to the server: ${e instanceof Error ? e.message : 'unknown error'}.`,
        );
      }
    }
  };

  const [activeTab, setActiveTab] = useState<ReportTab>('progress');

  // Per-tab project selection (independent of the global active project)
  const [progressProjectId, setProgressProjectId] = useState<string | null>(project.id);
  const [financialProjectId, setFinancialProjectId] = useState<string | null>(null);

  // Generate / preview state
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);

  // Real reports for the selected progress project, from the `project_reports`
  // table (migration 10). Replaces the old client-only Zustand fakes — the
  // "Generate" buttons now invoke the real `generate-reports` Edge Function
  // (P1.8). Reloads when the project changes or after a generate.
  const [reports, setReports] = useState<Report[]>([]);
  useEffect(() => {
    if (!progressProjectId) { setReports([]); return; }
    let cancelled = false;
    listProjectReports(progressProjectId, 24)
      .then((d) => { if (!cancelled) setReports(d); })
      .catch((e) => { console.warn('[reports] load failed:', e); if (!cancelled) setReports([]); });
    return () => { cancelled = true; };
  }, [progressProjectId]);

  // Real safety incidents (AI + manual) for the active project — drives the
  // Safety tab + the header "open flags" stat. Replaces the hardcoded empty
  // seed + the "45 days" placeholder.
  const [safetyIncidents, setSafetyIncidents] = useState<SafetyIncident[]>([]);
  useEffect(() => {
    if (!project?.id) { setSafetyIncidents([]); return; }
    let cancelled = false;
    listSafetyIncidents(project.id)
      .then((l) => { if (!cancelled) setSafetyIncidents(l); })
      .catch((e) => { console.warn('[reports] safety load failed:', e); if (!cancelled) setSafetyIncidents([]); });
    return () => { cancelled = true; };
  }, [project?.id]);

  // Audit filters
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [auditSearch, setAuditSearch] = useState('');

  const userCanViewFinance = canViewFinance(currentUser);
  // Sponsors (stakeholders) can VIEW finance but not edit it — hide write actions.
  const userCanEditFinance = canEditFinance(currentUser);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const projectName = (id: string | null) =>
    !id ? '' : projectsList.find((p) => p.id === id)?.name ?? (id === project.id ? project.name : id);

  const progressReports = useMemo(
    () => reports.filter((r) => !progressProjectId || r.projectId === progressProjectId),
    [reports, progressProjectId]
  );

  // The selected progress project (for the planned-vs-actual baseline dates).
  // Falls back to the active project when the picker matches it.
  const progressProject = useMemo(
    () => projectsList.find((p) => p.id === progressProjectId) ?? (progressProjectId === project.id ? project : null),
    [projectsList, progressProjectId, project],
  );
  // Actual overall % = the latest recorded progress point (0 if no history yet).
  const progressOverall = progressTrend.length ? progressTrend[progressTrend.length - 1].progress : 0;

  const financeBudget = financialProjectId ? budgets[financialProjectId] : undefined;
  const financeInvoices = useMemo(
    () => (financialProjectId ? invoices.filter((i) => i.projectId === financialProjectId) : []),
    [invoices, financialProjectId]
  );

  const financeTotals = useMemo(() => {
    const paid    = financeInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const pending = financeInvoices.filter((i) => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
    const overdue = financeInvoices.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
    return { paid, pending, overdue };
  }, [financeInvoices]);

  const remaining = financeBudget ? financeBudget.total - financeBudget.spent - financeBudget.committed : 0;
  const spentPct = financeBudget && financeBudget.total > 0 ? Math.round((financeBudget.spent / financeBudget.total) * 100) : 0;
  const committedPct = financeBudget && financeBudget.total > 0 ? Math.round((financeBudget.committed / financeBudget.total) * 100) : 0;

  const auditUsers = useMemo(() => Array.from(new Set(auditLogs.map((l) => l.userId))), [auditLogs]);
  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
      if (userFilter !== 'all' && log.userId !== userFilter) return false;
      if (q) {
        const haystack = `${log.action} ${log.notes ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, entityFilter, userFilter, auditSearch]);

  const safetyStats = useMemo(() => {
    const open = safetyIncidents.filter((f) => f.status === 'open' || f.status === 'acknowledged').length;
    const resolved = safetyIncidents.filter((f) => f.status === 'resolved').length;
    return { open, resolved, total: safetyIncidents.length };
  }, [safetyIncidents]);

  const daysWithoutIncident = useMemo(() => {
    if (safetyIncidents.length === 0) return null;
    const latest = Math.max(...safetyIncidents.map((i) => new Date(i.createdAt).getTime()));
    return Math.max(0, Math.floor((Date.now() - latest) / 86_400_000));
  }, [safetyIncidents]);

  // Header stat strip values
  const totalSpend = useMemo(() => {
    return Object.values(budgets).reduce((s, b) => s + (b?.spent ?? 0), 0);
  }, [budgets]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const userName = (id: string) => {
    if (id === 'system') return 'System';
    return users.find((u) => u.id === id)?.fullName ?? 'Unknown';
  };

  const handleGenerate = async (type: ReportType) => {
    if (!progressProjectId) return;
    setGenerating(type);
    try {
      await generateReportNow(progressProjectId, type);
      const fresh = await listProjectReports(progressProjectId, 24);
      setReports(fresh);
    } catch (e) {
      window.alert(
        `Could not generate the ${REPORT_TYPE_META[type].label.toLowerCase()} report: ` +
          `${e instanceof Error ? e.message : 'unknown error'}.`,
      );
    } finally {
      setGenerating(null);
    }
  };

  const handlePrint = () => window.print();

  const actionIcon = (action: string) => {
    if (action.includes('photo'))   return '📷';
    if (action.includes('ai'))      return '🤖';
    if (action.includes('task'))    return '📋';
    if (action.includes('comment')) return '💬';
    if (action.includes('report'))  return '📄';
    if (action.includes('project')) return '🏗️';
    return '📌';
  };

  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="editorial-root min-h-full bg-[#FAF8F2]">
      {/* ─── Editorial Header ─── */}
      <header className="relative overflow-hidden border-b border-[#E6E1D4] bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#E5F2EA]/40 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[1400px] px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                <span className="inline-block h-px w-6 bg-[#A0A0A0]" />
                Workspace · Reports &amp; Audit
              </div>
              <h1
                className="display text-2xl sm:text-4xl md:text-5xl font-medium leading-tight text-[#1A1A1A]"
                style={{ textWrap: 'balance', fontFamily: FRAUNCES }}
              >
                The <em className="font-normal italic text-[#2F8F5C]">record</em>.
              </h1>
              <p className="mt-3 max-w-md text-sm sm:text-[15px] leading-relaxed text-[#6B6B6B]">
                Progress, finance, and the audit trail — every shovel of dirt, every dollar spent,
                every safety flag, in one ledger.
              </p>
            </div>

            <EditorialButton
              variant="pill"
              onClick={() => handleGenerate('weekly')}
              disabled={!progressProjectId || generating !== null}
              className="self-start"
            >
              <Sparkles className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
              {generating === 'weekly' ? 'Generating…' : 'Quick weekly report'}
            </EditorialButton>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#E6E1D4] md:grid-cols-4">
            <StatCell
              label="Reports"
              value={reports.length.toString()}
              caption={`${reports.filter((r) => r.reportType === 'weekly').length} weekly`}
              accentColor="#1A1A1A"
            />
            <StatCell
              label="Audit entries"
              value={auditLogs.length.toString()}
              caption={`${auditLogs.filter((l) => l.entityType === 'photo').length} from photos`}
              accentColor="#5B6B7B"
            />
            <StatCell
              label="Open safety flags"
              value={safetyStats.open.toString()}
              caption={`${safetyStats.resolved} resolved`}
              accentColor="#C44545"
            />
            <StatCell
              label="Total spend"
              value={fmtCurrency(totalSpend).replace('$', '$')}
              caption={`${Object.keys(budgets).length} project budgets`}
              accentColor="#C8841E"
            />
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">
        {/* Round pill tabs */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
              {TABS.map((t) => {
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex min-h-11 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all sm:min-h-0 ${
                      isActive ? 'bg-[#1A1A1A] text-white shadow-sm' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                    }`}
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ════════════ PROGRESS ════════════ */}
        {activeTab === 'progress' && (
          <div className="space-y-8">
            <SectionHeader
              eyebrow="Progress"
              title="Project pulse."
              subtitle="Pick a project to see its progress trajectory and generate dated reports."
              right={
                <ProjectSelectorPill
                  projects={projectsList}
                  value={progressProjectId}
                  onChange={setProgressProjectId}
                />
              }
            />

            <ScheduledReportsCard projectId={progressProjectId} />

            {!progressProjectId ? (
              <BlankState
                icon={FolderKanban}
                title="Pick a project to begin."
                body="Daily, weekly, and monthly progress reports are scoped per project. Choose one above to draw its progress curve."
              />
            ) : (
              <>
                {/* Progress trend graph */}
                <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="display text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Progress Trend</h3>
                      <p className="text-sm text-[#6B6B6B]">{projectName(progressProjectId)}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#6B6B6B]">
                      <TrendingUp className="h-3.5 w-3.5 text-[#2F8F5C]" />
                      <span className="num text-base text-[#1A1A1A]">
                        {progressTrend.length > 0 ? `${progressTrend[progressTrend.length - 1].progress}%` : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="mb-2 flex items-center justify-end gap-4 text-[11px] text-[#6B6B6B]">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#2F8F5C]" /> Actual
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-0 w-4 border-t-2 border-dashed border-[#C44545]" /> Planned
                    </span>
                  </div>
                  {progressProject ? (
                    <PlannedVsActualTrend
                      start={progressProject.startDate}
                      end={progressProject.endDate}
                      history={progressTrend}
                      overall={progressOverall}
                      heightClass="h-64"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-[#A0A0A0]">
                      No schedule dates on file for this project.
                    </div>
                  )}
                </div>

                {/* Three report-type cards */}
                <div>
                  <h3 className="display mb-4 text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Generate a report</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(Object.keys(REPORT_TYPE_META) as ReportType[]).map((type) => {
                      const meta = REPORT_TYPE_META[type];
                      const isBusy = generating === type;
                      const lastForType = progressReports.find((r) => r.reportType === type);
                      return (
                        <article
                          key={type}
                          className="group relative overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(20,20,20,0.08)]"
                        >
                          <div className="absolute left-0 top-0 h-px w-12" style={{ backgroundColor: meta.accent }} />
                          <div className="flex items-start justify-between">
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-[11px]"
                              style={{ backgroundColor: `${meta.accent}18`, color: meta.accent }}
                            >
                              <meta.Icon className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#A0A0A0]">
                              {meta.window}
                            </span>
                          </div>
                          <h4 className="display mt-4 text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{meta.label} report</h4>
                          <p className="mt-1 text-sm text-[#6B6B6B]">
                            {lastForType
                              ? `Last generated ${format(new Date(lastForType.generatedAt), 'MMM d, h:mm a')}`
                              : 'Not yet generated for this project.'}
                          </p>
                          <div className="mt-5 flex items-center gap-2">
                            <button
                              onClick={() => handleGenerate(type)}
                              disabled={isBusy || generating !== null}
                              className="flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isBusy ? 'Generating…' : <><Sparkles className="h-3 w-3" />Generate</>}
                            </button>
                            <button
                              onClick={() => lastForType && setPreviewReport(lastForType)}
                              disabled={!lastForType}
                              className="flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3A3A3A] transition-colors hover:border-[#D8D2C4] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Eye className="h-3 w-3" />
                              Preview
                            </button>
                            <button
                              onClick={() => lastForType && setPreviewReport(lastForType)}
                              disabled={!lastForType}
                              className="flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3A3A3A] transition-colors hover:border-[#D8D2C4] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Download className="h-3 w-3" />
                              PDF
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                {/* Recently generated list */}
                <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="flex items-center justify-between border-b border-[#EFEBE0] px-6 py-4">
                    <div>
                      <h3 className="display text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Recently generated</h3>
                      <p className="tabular-nums text-xs text-[#6B6B6B]">
                        {progressReports.length} report{progressReports.length === 1 ? '' : 's'} for this project
                      </p>
                    </div>
                  </div>
                  {progressReports.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                      <FileText className="mx-auto h-10 w-10 text-[#A0A0A0]" />
                      <p className="mt-3 text-sm font-medium text-[#1A1A1A]">No reports yet for this project.</p>
                      <p className="mt-1 text-xs text-[#6B6B6B]">Generate one above to see it here.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#EFEBE0]">
                      {progressReports.map((r) => {
                        const meta = REPORT_TYPE_META[r.reportType];
                        return (
                          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div
                                className="flex h-10 w-10 items-center justify-center rounded-[11px]"
                                style={{ backgroundColor: `${meta.accent}18`, color: meta.accent }}
                              >
                                <meta.Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-medium text-[#1A1A1A]">{meta.label} report</p>
                                <p className="tabular-nums text-xs text-[#6B6B6B]">
                                  {format(new Date(r.dateFrom), 'MMM d')} – {format(new Date(r.dateTo), 'MMM d, yyyy')}
                                  {' · '}
                                  {format(new Date(r.generatedAt), 'h:mm a')}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-3 text-xs text-[#3A3A3A]">
                                  <span><strong className="num text-[#1A1A1A]">{r.summary.photosUploaded}</strong> photos</span>
                                  <span><strong className="num text-[#1A1A1A]">{r.summary.tasksUpdated}</strong> tasks</span>
                                  <span><strong className="num text-[#1A1A1A]">{r.summary.overallProgress}%</strong> progress</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setPreviewReport(r)}
                                className="flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3A3A3A] transition-colors hover:border-[#D8D2C4]"
                              >
                                <Eye className="h-3 w-3" />
                                Preview
                              </button>
                              <button
                                onClick={() => setPreviewReport(r)}
                                className="flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#246F47]"
                              >
                                <Download className="h-3 w-3" />
                                PDF
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════ FINANCIAL ════════════ */}
        {activeTab === 'financial' && (
          <div className="space-y-8">
            <SectionHeader
              eyebrow="Financial"
              title="Where the money goes."
              subtitle="Pick the project you're working on. Budget, spend, and invoices live here — no redirects."
              right={
                <ProjectSelectorPill
                  projects={projectsList}
                  value={financialProjectId}
                  onChange={setFinancialProjectId}
                />
              }
            />

            {!userCanViewFinance ? (
              <BlankState
                icon={Lock}
                title="Finance access required."
                body="Your account doesn't have the Finance permission. Ask an administrator to grant access."
                accent="rose"
              />
            ) : !financialProjectId ? (
              <BlankState
                icon={FolderKanban}
                title="Select a project to see its finances."
                body="Each project carries its own budget and invoices. Pick one from the dropdown above and the numbers will appear here."
              />
            ) : !financeBudget ? (
              <div className="rounded-[14px] border border-dashed border-[#E6E1D4] bg-white py-16 text-center shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[14px] border border-[#E6E1D4] bg-[#FAF8F2]">
                  <FileText className="h-7 w-7 text-[#A0A0A0]" strokeWidth={1.5} />
                </div>
                <h3 className="display text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>No budget set yet.</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-[#6B6B6B]">
                  {userCanEditFinance
                    ? `Set a budget for ${projectName(financialProjectId)} to begin tracking spend and recording invoices.`
                    : `No budget has been set for ${projectName(financialProjectId)} yet. The project team will set it.`}
                </p>
                {userCanEditFinance && (
                  <button
                    type="button"
                    onClick={() => setBudgetModalOpen(true)}
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2F8F5C] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#246F47]"
                  >
                    <Plus className="h-4 w-4" />
                    Set budget
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#E6E1D4] md:grid-cols-4">
                  <StatCell
                    label="Total budget"
                    value={fmtCurrency(financeBudget.total)}
                    caption={projectName(financialProjectId)}
                    accentColor="#1A1A1A"
                  />
                  <StatCell
                    label="Spent"
                    value={fmtCurrency(financeBudget.spent)}
                    caption={`${spentPct}% of budget`}
                    accentColor="#2F8F5C"
                  />
                  <StatCell
                    label="Committed"
                    value={fmtCurrency(financeBudget.committed)}
                    caption={`${committedPct}% pending`}
                    accentColor="#5B6B7B"
                  />
                  <StatCell
                    label="Remaining"
                    value={fmtCurrency(remaining)}
                    caption={remaining < 0 ? 'Over budget' : 'Available to allocate'}
                    accentColor={remaining < 0 ? '#C44545' : '#C8841E'}
                  />
                </div>

                <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="mb-3 flex items-center justify-between text-xs font-medium text-[#6B6B6B]">
                    <span className="display text-base font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Budget utilisation</span>
                    <span className="tabular-nums">{spentPct + committedPct}% allocated</span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#F0EDE4]">
                    <div className="h-full bg-[#2F8F5C]" style={{ width: `${Math.min(100, spentPct)}%` }} />
                    <div className="h-full bg-[#C8841E]" style={{ width: `${Math.min(100, committedPct)}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-[#6B6B6B]">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#2F8F5C]" /> Spent {fmtCurrency(financeBudget.spent)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#C8841E]" /> Committed {fmtCurrency(financeBudget.committed)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#E6E1D4]" /> Remaining {fmtCurrency(remaining)}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <InvoiceTotalCell label="Paid"    value={fmtCurrency(financeTotals.paid)}    color="bg-[#E5F2EA] text-[#246F47] border-[#A8D0B8]" />
                  <InvoiceTotalCell label="Pending" value={fmtCurrency(financeTotals.pending)} color="bg-[#F9EFD9] text-[#C8841E] border-[#F0D5A0]" />
                  <InvoiceTotalCell label="Overdue" value={fmtCurrency(financeTotals.overdue)} color="bg-[#FBE5E5] text-[#C44545] border-[#F0BFBF]" />
                </div>

                <div className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEBE0] px-6 py-4">
                    <div>
                      <h3 className="display text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Invoices</h3>
                      <p className="tabular-nums text-xs text-[#6B6B6B]">
                        {financeInvoices.length} vendor invoice{financeInvoices.length === 1 ? '' : 's'} for this project
                      </p>
                    </div>
                    {userCanEditFinance && (
                      <button className="flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#246F47]">
                        <Plus className="h-3.5 w-3.5" />
                        New invoice
                      </button>
                    )}
                  </div>
                  {financeInvoices.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                      <FileText className="mx-auto h-10 w-10 text-[#A0A0A0]" />
                      <p className="mt-3 text-sm font-medium text-[#1A1A1A]">No invoices yet</p>
                      <p className="mt-1 text-xs text-[#6B6B6B]">Vendor invoices for this project will appear here.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-[#EFEBE0] bg-[#FAF8F2] text-left text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                          <tr>
                            <th className="px-6 py-3">Reference</th>
                            <th className="px-6 py-3">Vendor</th>
                            <th className="px-6 py-3">Category</th>
                            <th className="px-6 py-3">Issued</th>
                            <th className="px-6 py-3">Due</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFEBE0]">
                          {financeInvoices.map((inv) => (
                            <tr key={inv.id} className="hover:bg-[#FAF8F2]">
                              <td className="px-6 py-3 font-mono text-xs text-[#6B6B6B]">{inv.reference ?? '—'}</td>
                              <td className="px-6 py-3 font-medium text-[#1A1A1A]">{inv.vendor}</td>
                              <td className="px-6 py-3 text-[#3A3A3A]">{inv.category}</td>
                              <td className="px-6 py-3 tabular-nums text-[#3A3A3A]">{format(new Date(inv.issuedAt), 'MMM d, yyyy')}</td>
                              <td className="px-6 py-3 tabular-nums text-[#3A3A3A]">{format(new Date(inv.dueAt),    'MMM d, yyyy')}</td>
                              <td className="px-6 py-3 text-right font-medium tabular-nums text-[#1A1A1A]">{fmtCurrency(inv.amount)}</td>
                              <td className="px-6 py-3">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[inv.status]}`}>
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ════════════ AUDIT ════════════ */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Audit"
              title="Every change, every keystroke."
              subtitle="Filter by entity, user, or text. Each line is the receipt of a change someone made."
            />

            <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#EFEBE0] p-4">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[#6B6B6B]">
                  <Filter className="h-3.5 w-3.5" /> Filters
                </div>
                <div className="overflow-x-auto">
                  <div className="inline-flex min-w-max rounded-full border border-[#E6E1D4] bg-white p-0.5">
                    {ENTITY_FILTERS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setEntityFilter(opt.value)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          entityFilter === opt.value ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A0A0]" />
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="h-8 appearance-none rounded-full border border-[#E6E1D4] bg-white pl-3 pr-8 text-xs text-[#3A3A3A] focus:outline-none focus:ring-2 focus:ring-[#2F8F5C] focus:ring-offset-1"
                  >
                    <option value="all">All users</option>
                    {auditUsers.map((id) => (
                      <option key={id} value={id}>{userName(id)}</option>
                    ))}
                  </select>
                </div>
                <div className="relative w-full sm:ml-auto sm:w-auto">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A0A0]" />
                  <input
                    placeholder="Search action or notes…"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    className="h-9 w-full rounded-full border border-[#E6E1D4] bg-white pl-9 pr-3 text-base focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-xs sm:w-64"
                  />
                </div>
              </div>

              {filteredAudit.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <Activity className="mx-auto h-10 w-10 text-[#A0A0A0]" />
                  <p className="mt-3 text-sm font-medium text-[#1A1A1A]">No entries match your filters.</p>
                  <p className="mt-1 text-xs text-[#6B6B6B]">Try widening the entity, user, or search criteria.</p>
                </div>
              ) : (
                <ul className="max-h-[640px] divide-y divide-[#EFEBE0] overflow-y-auto">
                  {filteredAudit.map((log) => (
                    <li key={log.id} className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-[#FAF8F2]">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-[#F0EDE4] text-xl">
                        {actionIcon(log.action)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="font-medium capitalize text-[#1A1A1A]">{log.action.replace(/_/g, ' ')}</p>
                            <span className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                              {log.entityType}
                            </span>
                          </div>
                          <span className="tabular-nums text-xs text-[#6B6B6B]">
                            {format(new Date(log.createdAt), 'MMM d, h:mm:ss a')}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-[#3A3A3A]">{log.notes || 'No details'}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-[#6B6B6B]">
                          <Users className="h-3 w-3" />
                          <span>{userName(log.userId)}</span>
                          {log.ipAddress && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{log.ipAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ════════════ SAFETY ════════════ */}
        {activeTab === 'safety' && (
          <div className="space-y-6">
            <SectionHeader
              eyebrow="Safety"
              title="Eyes on the line."
              subtitle="Open hazards, recent resolutions, and the streak we're trying to keep."
            />

            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#E6E1D4] md:grid-cols-3">
              <StatCell label="Open flags"          value={safetyStats.open.toString()}     caption="Need attention"        accentColor="#C44545" />
              <StatCell label="Resolved"            value={safetyStats.resolved.toString()} caption="Successfully closed"   accentColor="#C8841E" />
              <StatCell label="Days w/o incident"   value={daysWithoutIncident === null ? '—' : daysWithoutIncident.toString()} caption={daysWithoutIncident === null ? 'No incidents logged' : 'Since the last flag'} accentColor="#2F8F5C" />
            </div>

            <div className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
              <div className="border-b border-[#EFEBE0] px-6 py-4">
                <h3 className="display text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Safety flags</h3>
                <p className="tabular-nums text-xs text-[#6B6B6B]">
                  {safetyIncidents.length} flag{safetyIncidents.length === 1 ? '' : 's'} on the books
                </p>
              </div>
              {safetyIncidents.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Shield className="mx-auto h-10 w-10 text-[#A0A0A0]" />
                  <p className="mt-3 text-sm font-medium text-[#1A1A1A]">No safety flags on this project.</p>
                  <p className="mt-1 text-xs text-[#6B6B6B]">
                    Flags surface here automatically when photo analysis raises a hazard, or when one is logged manually on the Safety page.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#EFEBE0]">
                  {safetyIncidents.map((flag) => (
                    <li key={flag.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                      <div className="min-w-0">
                        <p className="font-medium text-[#1A1A1A]">
                          {flag.flags.length
                            ? flag.flags.map((f) => INCIDENT_FLAG_LABEL[f] ?? f).join(', ')
                            : 'Safety incident'}
                        </p>
                        <p className="text-sm capitalize text-[#3A3A3A]">{flag.severity} severity</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-xs text-[#6B6B6B]">{format(new Date(flag.createdAt), 'MMM d')}</span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${INCIDENT_STATUS_TONE[flag.status]}`}
                        >
                          {flag.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ════════════ SIGN-OFFS (ITP) ════════════ */}
        {activeTab === 'signoffs' && (
          <SignoffsPanel projectId={project.id} projectName={project.name} onPrint={handlePrint} />
        )}
      </div>

      {/* ─── Report preview modal ─── */}
      {previewReport && (
        <ReportPreviewModal
          report={previewReport}
          tasks={tasks}
          progressTrend={progressTrend}
          projectName={projectName(previewReport.projectId)}
          onClose={() => setPreviewReport(null)}
          onPrint={handlePrint}
          onDownload={handlePrint}
        />
      )}

      {/* ─── Set-budget modal (replaces window.prompt) ─── */}
      {budgetModalOpen && financialProjectId && (
        <SetBudgetModal
          projectName={projectName(financialProjectId)}
          current={financeBudget?.total}
          onClose={() => setBudgetModalOpen(false)}
          onSave={async (total) => {
            await persistBudget(total);
            setBudgetModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Set-budget modal ────────────────────────────────────────────────────────
// Warm replacement for the old window.prompt() flow. Validates a positive
// number client-side and hands the parsed total back to the caller.
function SetBudgetModal({
  projectName, current, onClose, onSave,
}: {
  projectName: string;
  current?: number;
  onClose: () => void;
  onSave: (total: number) => void | Promise<void>;
}) {
  const [raw, setRaw] = useState(current ? String(current) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(raw.replace(/[,_$\s]/g, ''));
    if (!Number.isFinite(total) || total <= 0) {
      setError('Enter a positive dollar amount.');
      return;
    }
    setSaving(true);
    try {
      await onSave(total);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editorial-root fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
        <div className="flex items-center justify-between border-b border-[#EFEBE0] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#246F47]">Finance</p>
            <h3 className="display mt-0.5 text-xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
              Set project budget
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#3A3A3A]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5">
          <p className="text-sm text-[#6B6B6B]">
            Total budget for <span className="font-medium text-[#1A1A1A]">{projectName}</span>. This seeds spend
            tracking and the invoice ledger.
          </p>
          <label className="mt-4 block">
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">Amount (USD)</span>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#A0A0A0]">$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={raw}
                onChange={(e) => { setRaw(e.target.value); setError(''); }}
                placeholder="250000"
                className="w-full rounded-[10px] border border-[#E6E1D4] bg-white py-2.5 pl-7 pr-3 text-sm text-[#1A1A1A] tabular-nums focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
            </div>
          </label>
          {error && <p className="mt-2 text-xs text-[#C44545]">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-sm font-medium text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#2F8F5C] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#246F47]">{eyebrow}</p>
        <h2
          className="display mt-1 text-2xl font-medium leading-tight text-[#1A1A1A] sm:text-3xl"
          style={{ textWrap: 'balance', fontFamily: FRAUNCES }}
        >
          {title}
        </h2>
        <p className="mt-2 max-w-xl text-sm text-[#6B6B6B]">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

function BlankState({
  icon: Icon,
  title,
  body,
  accent = 'slate',
}: {
  icon: typeof FolderKanban;
  title: string;
  body: string;
  accent?: 'slate' | 'rose';
}) {
  const accentClasses =
    accent === 'rose' ? 'bg-[#FBE5E5] text-[#C44545] border-[#F0BFBF]' : 'bg-[#FAF8F2] text-[#A0A0A0] border-[#E6E1D4]';
  return (
    <div className="rounded-[14px] border-2 border-dashed border-[#E6E1D4] bg-white py-16 text-center">
      <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[14px] border ${accentClasses}`}>
        <Icon className="h-7 w-7" strokeWidth={1.5} />
      </div>
      <h3 className="display text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#6B6B6B]">{body}</p>
    </div>
  );
}

function ProjectSelectorPill({
  projects,
  value,
  onChange,
}: {
  projects: { id: string; name: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <FolderKanban className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 w-full appearance-none rounded-full border border-[#E6E1D4] bg-white pl-11 pr-9 text-base font-medium text-[#3A3A3A] shadow-sm transition-colors hover:bg-[#FAF8F2] focus:outline-none focus:ring-2 focus:ring-[#2F8F5C] focus:ring-offset-1 sm:w-72 sm:text-sm"
      >
        <option value="">Select a project…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

function InvoiceTotalCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-[14px] border px-5 py-4 ${color}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] opacity-80">{label}</p>
      <p className="num mt-1 text-2xl font-medium" style={{ fontFamily: FRAUNCES }}>{value}</p>
    </div>
  );
}

// ─── Report preview modal ───────────────────────────────────────────────────

interface ReportPreviewProps {
  report: Report;
  tasks: any[];
  progressTrend: { date: string; progress: number }[];
  projectName: string;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
}

function ReportPreviewModal({ report, tasks, progressTrend, projectName, onClose, onPrint, onDownload }: ReportPreviewProps) {
  const meta = REPORT_TYPE_META[report.reportType];
  return (
    <div className="editorial-root fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-[#1A1A1A]/50 p-2 backdrop-blur-sm sm:p-4">
      <div className="my-4 w-full max-w-6xl overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)] sm:my-8">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#EFEBE0] bg-white px-4 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#246F47]">{meta.label} report</p>
            <h3 className="display mt-0.5 truncate text-lg font-medium text-[#1A1A1A] sm:text-2xl" style={{ fontFamily: FRAUNCES }}>{projectName || 'Report preview'}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onPrint}
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#3A3A3A] hover:border-[#D8D2C4] sm:min-h-0 sm:px-4"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onDownload}
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#246F47] sm:min-h-0 sm:px-4"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={onClose} className="min-h-11 rounded-full p-2 text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#3A3A3A] sm:min-h-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-140px)] overflow-auto p-4 sm:max-h-[calc(100vh-200px)] sm:p-8">
          <div className="mb-8 border-b-2 border-[#2F8F5C] pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="display text-3xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{meta.label} progress report</h1>
                <p className="mt-1 text-lg text-[#3A3A3A]">{projectName}</p>
              </div>
              <div className="text-right">
                <p className="num text-base text-[#3A3A3A]">{format(new Date(report.generatedAt), 'MMMM d, yyyy')}</p>
                <p className="tabular-nums text-xs text-[#6B6B6B]">
                  {format(new Date(report.dateFrom), 'MMM d')} – {format(new Date(report.dateTo), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-4">
            <ReportKpi tone="sage"   label="Overall progress" value={`${report.summary.overallProgress}%`} hint={`${report.summary.progressChange >= 0 ? '+' : ''}${report.summary.progressChange}% this period`} />
            <ReportKpi tone="slate"  label="Photos uploaded" value={report.summary.photosUploaded.toString()} />
            <ReportKpi tone="amber"  label="Tasks updated"   value={report.summary.tasksUpdated.toString()} />
            <ReportKpi tone="red"    label="Safety flags"    value={report.summary.safetyFlags.toString()} />
          </div>

          <div className="mb-8">
            <h2 className="display mb-4 text-xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Progress trend</h2>
            <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-6">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={progressTrend}>
                    <defs>
                      <linearGradient id="previewProgressGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2F8F5C" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#2F8F5C" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EFEBE0" />
                    <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), 'MMM d')} stroke="#6B6B6B" fontSize={12} />
                    <YAxis stroke="#6B6B6B" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E6E1D4', borderRadius: 12 }} />
                    <Area type="monotone" dataKey="progress" stroke="#2F8F5C" strokeWidth={2} fill="url(#previewProgressGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="display mb-4 text-xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Project timeline</h2>
            <GanttChart tasks={tasks} startDate={report.dateFrom} endDate={report.dateTo} compact={false} />
          </div>

          <div className="mt-12 border-t border-[#EFEBE0] pt-6 text-center text-sm text-[#6B6B6B]">
            <p className="font-medium text-[#3A3A3A]">SiteProof — Automated Photo-Based QA System</p>
            <p className="tabular-nums">Report ID: {report.id}</p>
            <p className="tabular-nums">Generated {format(new Date(report.generatedAt), "MMMM d, yyyy 'at' h:mm a")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const KPI_TONES: Record<string, string> = {
  sage:  'bg-[#E5F2EA] text-[#246F47]',
  slate: 'bg-[#EEF1F4] text-[#5B6B7B]',
  amber: 'bg-[#F9EFD9] text-[#C8841E]',
  red:   'bg-[#FBE5E5] text-[#C44545]',
};

function ReportKpi({ tone, label, value, hint }: { tone: string; label: string; value: string; hint?: string }) {
  return (
    <div className={`rounded-[14px] p-6 text-center ${KPI_TONES[tone] ?? KPI_TONES.slate}`}>
      <p className="num text-4xl font-medium" style={{ fontFamily: FRAUNCES }}>{value}</p>
      <p className="mt-1 text-sm">{label}</p>
      {hint && <p className="mt-2 text-xs opacity-80">{hint}</p>}
    </div>
  );
}

// Scheduled reports — populated by the `generate-reports` Edge Function based
// on each project's `report_cadence`. Reads `project_reports` rows (migration
// 10) for the active project. Renders quietly when none exist so the section
// only shows up once a cadence has fired at least once.
function ScheduledReportsCard({ projectId }: { projectId: string | null }) {
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listProjectReports(projectId, 8)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[reports] listProjectReports failed:', e instanceof Error ? e.message : e);
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;
  if (loading && rows.length === 0) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
            Scheduled reports
          </p>
          <p className="mt-1 text-xs text-[#6B6B6B]">
            Generated automatically per the project&apos;s configured cadence ({rows.length} recent).
          </p>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-[11px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                {r.reportType}
              </span>
              <span className="text-[11px] text-[#A0A0A0]">
                {format(new Date(r.generatedAt), 'MMM d, HH:mm')}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#3A3A3A]">
              {format(new Date(r.dateFrom), 'MMM d')} → {format(new Date(r.dateTo), 'MMM d, yyyy')}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#6B6B6B]">
              <span>📷 {r.summary.photosUploaded}</span>
              <span>📋 {r.summary.tasksUpdated}</span>
              <span>⚠️ {r.summary.safetyFlags}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── ITP sign-off register (P4.2) ───────────────────────────────────────────
// Lists the immutable signoffs captured at photo-confirm and renders a clean
// printable register (browser print / Save-as-PDF — the no-server-PDF path).
function SignoffsPanel({
  projectId, projectName, onPrint,
}: {
  projectId: string;
  projectName: string;
  onPrint: () => void;
}) {
  const [rows, setRows] = useState<Signoff[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listSignoffs(projectId)
      .then((d) => { if (!cancelled) setRows(d); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Sign-offs"
        title="ITP register."
        subtitle="Signed inspection & test approvals captured at photo confirm. Print or Save-as-PDF for the compliance file."
        right={
          rows.length > 0 ? (
            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47]"
            >
              <Printer className="h-4 w-4" />
              Print ITP register
            </button>
          ) : undefined
        }
      />

      {loading && rows.length === 0 ? null : rows.length === 0 ? (
        <BlankState
          icon={PenLine}
          title="No sign-offs yet."
          body="Capture an ITP sign-off when confirming a photo in the AI-Analysis review — signed approvals collect here for the compliance record."
        />
      ) : (
        <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-6 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          <div className="mb-6 border-b-2 border-[#2F8F5C] pb-4">
            <h1 className="display text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>ITP sign-off register</h1>
            <p className="text-sm text-[#3A3A3A]">{projectName}</p>
            <p className="tabular-nums text-xs text-[#6B6B6B]">
              {rows.length} sign-off{rows.length === 1 ? '' : 's'} · generated {format(new Date(), 'MMMM d, yyyy')}
            </p>
          </div>
          <ul className="divide-y divide-[#EFEBE0]">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-[#1A1A1A]">{s.signerName}</p>
                  <p className="tabular-nums text-xs text-[#6B6B6B]">
                    {format(new Date(s.createdAt), "MMM d, yyyy · h:mm a")}
                    {typeof s.pct === 'number' ? ` · confirmed ${s.pct}%` : ''}
                  </p>
                  {s.notes && <p className="mt-0.5 text-xs text-[#3A3A3A]">{s.notes}</p>}
                </div>
                <img
                  src={s.signatureData}
                  alt={`Signature — ${s.signerName}`}
                  className="h-16 w-40 rounded-md border border-[#E6E1D4] bg-white object-contain"
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
