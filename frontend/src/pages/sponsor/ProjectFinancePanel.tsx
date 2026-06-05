// ProjectFinancePanel — the shared "money view": spend-vs-progress headline,
// read-only budget health, payment milestones (with sign-off release), invoices,
// and an assurance feed. Extracted from SponsorCockpit so BOTH the stakeholder's
// /sponsor cockpit AND the Gantt "Finance" tab render the exact same surface
// from one source of truth.
//
// Read-only finance everywhere; the only write is the milestone fund release,
// gated by canReleasePaymentMilestone + deploy-gated to migration 49 (degrades
// gracefully). Reads the active project from the store, so consumers just drop
// it in — no prop drilling.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, CheckCircle2, Lock, FileText, Image as ImageIcon, Activity, X, PenLine, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';
import { useFeatureStore } from '../../store/features';
import { useFinanceStore } from '../../store/finance';
import { useDashboardStats } from '../../store/dashboard';
import { PlannedVsActualTrend, plannedPctNow } from '../../components/charts/PlannedVsActualTrend';
import { listPhaseStatuses } from '../../lib/api/phaseStatus';
import { listMilestoneReleases, releaseMilestone, type MilestoneRelease } from '../../lib/api/paymentMilestones';
import { canReleasePaymentMilestone } from '../../lib/permissions';
import { phaseColor } from '../../lib/construction/phaseColors';
import type { ConstructionPhase } from '../../lib/ai/contract';
import SignaturePad from '../../components/ui/SignaturePad';
import { cardShell, StatusPill, FRAUNCES, type ToneKey } from '../gantt/components/ledger';

const PHASES: ConstructionPhase[] = ['excavation', 'foundation', 'framing', 'roofing', 'electrical', 'plumbing', 'drywall', 'finishing'];
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

type MilestoneState = 'released' | 'ready' | 'locked';
interface Milestone {
  phase: string;
  label: string;
  amount: number;
  state: MilestoneState;
  release?: MilestoneRelease;
}

export default function ProjectFinancePanel() {
  const navigate = useNavigate();
  const project = useAppStore((s) => s.project);
  const currentProfile = useAppStore((s) => s.currentProfile);
  const stats = useDashboardStats();
  const history = useFeatureStore((s) => s.progressHistory);
  const budget = useFinanceStore((s) => (project?.id ? s.budgets[project.id] : undefined));
  const allInvoices = useFinanceStore((s) => s.invoices);

  const projectId = project?.id;
  const canRelease = canReleasePaymentMilestone(currentProfile);

  const [phaseStatus, setPhaseStatus] = useState<Record<string, string>>({});
  const [releases, setReleases] = useState<MilestoneRelease[]>([]);
  const [releasing, setReleasing] = useState<Milestone | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const rows = await listPhaseStatuses(projectId);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.phase] = r.status;
      setPhaseStatus(map);
    } catch { /* non-fatal */ }
    setReleases(await listMilestoneReleases(projectId));
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const invoices = useMemo(() => allInvoices.filter((i) => i.projectId === projectId), [allInvoices, projectId]);

  // Spend-vs-progress: where the money's gone vs how much work is done.
  const overall = stats.overallProgress;
  const spentPct = budget && budget.total > 0 ? Math.round((budget.spent / budget.total) * 100) : 0;
  const planned = project ? plannedPctNow(project.startDate, project.endDate) : 0;
  const variance = overall - planned;
  const spendAhead = spentPct - overall; // >0 means money is outrunning progress

  // Milestones = the project's phases, one per phase, with their release/verdict state.
  const milestones = useMemo<Milestone[]>(() => {
    const perPhase = budget && budget.total > 0 ? Math.round(budget.total / PHASES.length) : 0;
    return PHASES.map((p) => {
      const release = releases.find((r) => r.phase === p);
      const verified = phaseStatus[p] === 'complete';
      const state: MilestoneState = release ? 'released' : verified ? 'ready' : 'locked';
      return { phase: p, label: phaseColor(p).label, amount: release?.amount ?? perPhase, state, release };
    });
  }, [releases, phaseStatus, budget]);

  const releasedTotal = releases.reduce((s, r) => s + r.amount, 0);
  const readyCount = milestones.filter((m) => m.state === 'ready').length;

  if (!projectId || !project) return null;

  return (
    <>
      {/* Spend vs progress headline */}
      <section className={`mb-4 overflow-hidden ${cardShell}`}>
        <div className="grid gap-px bg-[#EFEBE0] sm:grid-cols-[1fr_1fr_1.4fr]">
          <HeadlineCell label="Budget spent" value={budget ? `${spentPct}%` : '—'} sub={budget ? fmt(budget.spent) : 'No budget set'} tone="amber" />
          <HeadlineCell label="Work complete" value={`${overall}%`} sub={variance < 0 ? `${Math.abs(variance)}% behind schedule` : 'on / ahead of schedule'} tone={variance < 0 ? 'red' : 'sage'} />
          <div className="bg-white p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Spend vs progress</span>
              {budget && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${spendAhead > 10 ? 'bg-[#FBE5E5] text-[#C44545]' : 'bg-[#E5F2EA] text-[#246F47]'}`}>
                  {spendAhead > 10 ? `spend ${spendAhead}% ahead of work` : 'value on track'}
                </span>
              )}
            </div>
            <PlannedVsActualTrend start={project.startDate} end={project.endDate} history={history} overall={overall} heightClass="h-32" />
          </div>
        </div>
      </section>

      {/* Budget health (read-only) */}
      {budget && (
        <section className={`mb-4 p-5 ${cardShell}`}>
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.16em] text-[#6B6B6B]">
            <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-[#2F8F5C]" /> Budget</span>
            <span className="tabular-nums">{fmt(budget.total)} authorised</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#F0EDE4]">
            <div className="h-full bg-[#2F8F5C]" style={{ width: `${Math.min(100, spentPct)}%` }} title="Spent" />
            <div className="h-full bg-[#C8841E]" style={{ width: `${Math.min(100 - Math.min(100, spentPct), budget.total > 0 ? Math.round((budget.committed / budget.total) * 100) : 0)}%` }} title="Committed" />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px] text-[#6B6B6B]">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#2F8F5C]" /> Spent {fmt(budget.spent)}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#C8841E]" /> Committed {fmt(budget.committed)}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#E6E1D4]" /> Remaining {fmt(budget.total - budget.spent - budget.committed)}</span>
          </div>
        </section>
      )}

      {/* Payment milestones — the sponsor's fund-release action */}
      <section className={`mb-4 overflow-hidden ${cardShell}`}>
        <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
          <div>
            <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Payment milestones</h2>
            <p className="text-[12px] text-[#6B6B6B]">Release funds as each phase is AI-verified complete. {fmt(releasedTotal)} released{readyCount > 0 ? ` · ${readyCount} ready` : ''}.</p>
          </div>
        </div>
        <ul className="divide-y divide-[#EFEBE0]">
          {milestones.map((m) => {
            const pc = phaseColor(m.phase as ConstructionPhase);
            return (
              <li key={m.phase} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="inline-block h-2 w-2 flex-shrink-0 rounded-full" style={{ background: pc.color }} />
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium capitalize text-[#1A1A1A]">{m.label}</p>
                    <p className="text-[11.5px] text-[#6B6B6B]">
                      {m.amount > 0 ? fmt(m.amount) : '—'}
                      {m.release ? ` · released ${format(new Date(m.release.releasedAt), 'MMM d')}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2.5">
                  {m.state === 'released' && <StatusPill tone="sage"><CheckCircle2 className="h-3 w-3" /> Released</StatusPill>}
                  {m.state === 'locked' && <StatusPill tone="slate"><Lock className="h-3 w-3" /> Awaiting verification</StatusPill>}
                  {m.state === 'ready' && (
                    canRelease ? (
                      <button
                        type="button"
                        onClick={() => setReleasing(m)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#246F47]"
                      >
                        <PenLine className="h-3.5 w-3.5" /> Release payment
                      </button>
                    ) : <StatusPill tone="amber">Ready to release</StatusPill>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Invoices (read-only) */}
      <section className={`mb-4 overflow-hidden ${cardShell}`}>
        <div className="border-b border-[#EFEBE0] px-5 py-3">
          <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-[#6B6B6B]">No invoices on this project yet.</p>
        ) : (
          <ul className="divide-y divide-[#EFEBE0]">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#1A1A1A]">{inv.vendor}</p>
                  <p className="text-[11.5px] text-[#6B6B6B]">{inv.category} · due {format(new Date(inv.dueAt), 'MMM d')}</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="tabular-nums text-[13px] font-medium text-[#1A1A1A]">{fmt(inv.amount)}</span>
                  <StatusPill tone={inv.status === 'paid' ? 'sage' : inv.status === 'overdue' ? 'red' : inv.status === 'pending' ? 'amber' : 'slate'} className="capitalize">{inv.status}</StatusPill>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assurance feed — proof the money built something real */}
      <section className={`p-5 ${cardShell}`}>
        <h2 className="mb-3 text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Assurance</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { icon: FileText, label: 'Reports', to: '/reports' },
            { icon: ImageIcon, label: 'Photo gallery', to: '/gantt?tab=uploads' },
            { icon: Activity, label: 'Progress & schedule', to: '/gantt' },
          ].map((a) => (
            <button key={a.label} type="button" onClick={() => navigate(a.to)}
              className="flex items-center gap-2.5 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3 text-left transition-colors hover:border-[#2F8F5C] hover:bg-[#E5F2EA]/50">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-white text-[#246F47]"><a.icon className="h-4 w-4" /></span>
              <span className="text-[13px] font-medium text-[#1A1A1A]">{a.label}</span>
            </button>
          ))}
        </div>
      </section>

      {releasing && (
        <ReleaseModal
          milestone={releasing}
          projectId={projectId}
          onClose={() => setReleasing(null)}
          onReleased={() => { setReleasing(null); void load(); }}
          notify={(message, type) => useAppStore.getState().setNotification({ message, type })}
        />
      )}
    </>
  );
}

function HeadlineCell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: ToneKey }) {
  const color = tone === 'red' ? '#C44545' : tone === 'amber' ? '#C8841E' : '#246F47';
  return (
    <div className="bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">{label}</p>
      <p className="mt-1 text-[32px] font-medium leading-none tabular-nums" style={{ fontFamily: FRAUNCES, color }}>{value}</p>
      <p className="mt-1.5 text-[11.5px] text-[#6B6B6B]">{sub}</p>
    </div>
  );
}

function ReleaseModal({
  milestone, projectId, onClose, onReleased, notify,
}: {
  milestone: Milestone;
  projectId: string;
  onClose: () => void;
  onReleased: () => void;
  notify: (message: string, type: 'success' | 'error') => void;
}) {
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await releaseMilestone({ projectId, phase: milestone.phase, label: milestone.label, amount: milestone.amount, signatureData: sig });
      notify(`Released ${milestone.label} payment.`, 'success');
      onReleased();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not release the milestone.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editorial-root fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#246F47]">Release payment</p>
            <h3 className="display mt-0.5 text-xl font-medium capitalize text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{milestone.label}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#3A3A3A]"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">
          <p className="text-[13px] text-[#3A3A3A]">
            You're authorising release of <span className="font-semibold text-[#1A1A1A]">{milestone.amount > 0 ? fmt(milestone.amount) : 'this milestone'}</span> for the
            <span className="font-semibold capitalize"> {milestone.label}</span> phase — AI-verified complete. Sign below to confirm.
          </p>
          <div className="mt-3">
            <SignaturePad onChange={setSig} height={140} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-[13px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]">Cancel</button>
            <button type="button" onClick={() => void confirm()} disabled={busy || !sig}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {busy ? 'Releasing…' : 'Confirm release'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
