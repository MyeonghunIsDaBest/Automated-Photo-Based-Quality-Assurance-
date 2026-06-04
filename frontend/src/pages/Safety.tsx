import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Bug,
  CheckCircle2,
  FileText,
  HardHat,
  Image as ImageIcon,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '../store';
import { useUrlHydration } from '../lib/hooks/useUrlHydration';
import { useProjectAccessGuard } from '../lib/hooks/useProjectAccessGuard';
import { canEditProjects, canResolveSafetyIncident, canViewSafetyIncident } from '../lib/permissions';
import {
  listSafetyDocuments,
  deleteSafetyDocument,
  subscribeToProjectSafetyDocuments,
} from '../lib/api/safetyDocuments';
import {
  listIncidentReports,
  setIncidentReportStatus,
  subscribeToProjectIncidentReports,
} from '../lib/api/incidentReports';
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  IncidentReport,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  SafetyDocCategory,
  SafetyDocument,
  SEVERITY_LABEL,
  STATUS_LABEL,
} from './safety/types';
import { SafetyDocumentModal } from './safety/components/SafetyDocumentModal';
import { IncidentFormModal } from './safety/components/IncidentFormModal';
import {
  acknowledgeIncident,
  dismissIncident,
  listSafetyIncidents,
  resolveIncident,
  type SafetyIncident,
} from '../lib/api/safetyIncidents';
import { useSafetyRealtime } from '../lib/hooks/useSafetyRealtime';
import { createDefect } from '../lib/api/defects';
import type { SafetyFlag, SafetySeverity } from '../types';
import { FRAUNCES } from './gantt/components/ledger';

type TabKey = 'documents' | 'incidents' | 'hazards';

const HAZARD_SEVERITY_TONE: Record<SafetySeverity, string> = {
  critical: 'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
  high:     'border-[#F3D0BE] bg-[#F6E7DA] text-[#B5602A]',
  medium:   'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  low:      'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
};

const HAZARD_STATUS_TONE: Record<SafetyIncident['status'], string> = {
  open:         'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
  acknowledged: 'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  resolved:     'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  dismissed:    'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
};

const HAZARD_FLAG_LABEL: Record<SafetyFlag, string> = {
  no_hard_hat:     'No hard hat',
  exposed_wiring:  'Exposed wiring',
  fall_hazard:     'Fall hazard',
  unsecured_load:  'Unsecured load',
  housekeeping:    'Housekeeping',
  signage_missing: 'Signage missing',
};

const SEVERITY_BADGE: Record<IncidentSeverity, string> = {
  low:      'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
  medium:   'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  high:     'border-[#F3D0BE] bg-[#F6E7DA] text-[#B5602A]',
  critical: 'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
};

const STATUS_BADGE: Record<IncidentStatus, string> = {
  open:          'border-[#F0BFBF] bg-[#FBE5E5] text-[#C44545]',
  investigating: 'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  closed:        'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const daysSince = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
};

export default function Safety() {
  const currentUser = useAppStore((s) => s.currentUser);
  const currentProfile = useAppStore((s) => s.currentProfile);
  const project = useAppStore((s) => s.project);
  const setNotification = useAppStore((s) => s.setNotification);

  // Bounce field-role users away from projects they weren't invited to.
  useProjectAccessGuard(project?.id);

  // Safety documents + WHS incident reports persist to Supabase (roadmap P1.7 —
  // legal/insurance critical). Full-swap: the page owns the data (no Zustand
  // mirror) — hydrate on mount + subscribe to realtime, mirroring the
  // AI-hazards pattern below. Mock mode / demo (non-UUID) projects return empty
  // (the lib guards on supabaseConfigured + isUuid).
  const [documents, setDocuments] = useState<SafetyDocument[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listSafetyDocuments(project.id)
      .then((d) => { if (!cancelled) setDocuments(d); })
      .catch((e) => console.warn('[safety] documents load failed:', e));
    void listIncidentReports(project.id)
      .then((i) => { if (!cancelled) setIncidents(i); })
      .catch((e) => console.warn('[safety] incidents load failed:', e));

    const unsubDocs = subscribeToProjectSafetyDocuments(project.id, {
      onInsert: (doc) =>
        setDocuments((prev) => (prev.some((d) => d.id === doc.id) ? prev : [doc, ...prev])),
      onDelete: (id) => setDocuments((prev) => prev.filter((d) => d.id !== id)),
    });
    const unsubInc = subscribeToProjectIncidentReports(project.id, {
      onUpsert: (inc) =>
        setIncidents((prev) =>
          prev.some((i) => i.id === inc.id)
            ? prev.map((i) => (i.id === inc.id ? inc : i))
            : [inc, ...prev],
        ),
      onDelete: (id) => setIncidents((prev) => prev.filter((i) => i.id !== id)),
    });
    return () => { cancelled = true; unsubDocs(); unsubInc(); };
  }, [project.id]);

  // Delete a document — server is authoritative; the realtime DELETE also
  // reconciles other devices. On failure the row stays (no destructive
  // optimistic removal of a legal record).
  const handleRemoveDocument = async (id: string) => {
    try {
      await deleteSafetyDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.warn('[safety] document delete failed:', e);
    }
  };

  // Incident status transition — optimistic (the <select> reflects instantly);
  // realtime UPDATE reconciles the canonical row. On failure we log; the next
  // hydrate corrects any drift.
  const handleIncidentStatus = async (id: string, status: IncidentStatus) => {
    setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      const updated = await setIncidentReportStatus(id, status);
      setIncidents((prev) => prev.map((i) => (i.id === id ? updated : i)));
    } catch (e) {
      console.warn('[safety] incident status update failed:', e);
    }
  };

  const canEdit = canEditProjects(currentUser);
  const canSeeHazards = canViewSafetyIncident(currentProfile);
  const canResolveHazards = canResolveSafetyIncident(currentProfile);

  // AI-detected hazards (Phase C). Read-only for workers; manager+ can
  // acknowledge / resolve / dismiss. The Realtime hook fires a toast on
  // every new INSERT regardless of which page is active.
  const [hazards, setHazards] = useState<SafetyIncident[]>([]);
  const [hazardsLoading, setHazardsLoading] = useState(false);
  const [hazardsError, setHazardsError] = useState<string | null>(null);
  const [hazardActing, setHazardActing] = useState<string | null>(null);
  // P4.3 — raise a QA defect from a hazard. Track in-flight + already-raised ids
  // so the button gives feedback and avoids accidental same-session duplicates.
  const [raisingDefectId, setRaisingDefectId] = useState<string | null>(null);
  const [raisedDefectIds, setRaisedDefectIds] = useState<Set<string>>(new Set());

  useSafetyRealtime(canSeeHazards ? project.id : null);

  useEffect(() => {
    if (!canSeeHazards) return;
    let cancelled = false;
    setHazardsLoading(true);
    setHazardsError(null);
    listSafetyIncidents(project.id)
      .then((list) => { if (!cancelled) setHazards(list); })
      .catch((e) => { if (!cancelled) setHazardsError(e instanceof Error ? e.message : 'Failed to load.'); })
      .finally(() => { if (!cancelled) setHazardsLoading(false); });
    return () => { cancelled = true; };
  }, [project.id, canSeeHazards]);

  const handleHazardAction = async (
    id: string,
    fn: (id: string, notes?: string) => Promise<SafetyIncident>,
  ) => {
    setHazardActing(id);
    setHazardsError(null);
    try {
      const updated = await fn(id);
      setHazards((prev) => prev.map((h) => (h.id === id ? updated : h)));
    } catch (e) {
      setHazardsError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setHazardActing(null);
    }
  };

  // Raise a QA defect from an AI hazard — pre-linked to the hazard's photo, with
  // the flags as the title and the (shared) severity carried across. The defect
  // surfaces on the Gantt Defects board via realtime (P4.3).
  const handleRaiseDefect = async (h: SafetyIncident) => {
    setRaisingDefectId(h.id);
    try {
      const title = h.flags.length
        ? `Safety: ${h.flags.map((f) => HAZARD_FLAG_LABEL[f] ?? f).join(', ')}`
        : 'Safety hazard';
      await createDefect(project.id, {
        title,
        description: h.notes ?? undefined,
        severity: h.severity,
        photoId: h.photoId ?? undefined,
        createdBy: currentUser?.id ?? 'system',
      });
      setRaisedDefectIds((prev) => new Set(prev).add(h.id));
      setNotification({ message: 'Defect raised from this hazard — see the Defects tab.', type: 'success' });
    } catch (e) {
      setNotification({ message: e instanceof Error ? e.message : 'Could not raise defect.', type: 'error' });
    } finally {
      setRaisingDefectId(null);
    }
  };

  const [activeTab, setActiveTab] = useState<TabKey>('documents');
  const [highlightedIncidentId, setHighlightedIncidentId] = useState<string | null>(null);
  const incidentRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const navigate = useNavigate();

  // Connectedness Pass 2: hydrate `?tab=&incident=`. The incident scroll
  // requires the hazards list to have loaded; this effect retries once
  // hazards land. Manager-tier-only deep links — workers don't see hazards.
  useUrlHydration({
    onApplyExtras: ({ tab, incident }) => {
      if (tab === 'documents' || tab === 'incidents' || tab === 'hazards') {
        setActiveTab(tab);
      }
      if (incident) setHighlightedIncidentId(incident);
    },
  });

  useEffect(() => {
    if (!highlightedIncidentId) return;
    const el = incidentRefs.current.get(highlightedIncidentId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Keep the highlight ring for 3s then fade. Stale URLs that point at a
    // missing incident silently no-op (no toast — see URL schema).
    const timer = window.setTimeout(() => setHighlightedIncidentId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [highlightedIncidentId, hazards.length]);
  const [docFilter, setDocFilter] = useState<SafetyDocCategory | 'all'>('all');
  const [incidentFilter, setIncidentFilter] = useState<IncidentType | 'all'>('all');
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docModalCategory, setDocModalCategory] = useState<SafetyDocCategory | undefined>();
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [incidentModalType, setIncidentModalType] = useState<IncidentType | undefined>();

  const stats = useMemo(() => {
    const swms = documents.filter((d) => d.category === 'swms').length;
    const msds = documents.filter((d) => d.category === 'msds').length;
    const open = incidents.filter((i) => i.status !== 'closed').length;
    const lastIncident = incidents.length
      ? Math.min(...incidents.map((i) => daysSince(i.occurredAt)))
      : null;
    return { swms, msds, open, lastIncident };
  }, [documents, incidents]);

  const filteredDocs = useMemo(
    () => (docFilter === 'all' ? documents : documents.filter((d) => d.category === docFilter)),
    [documents, docFilter]
  );

  const filteredIncidents = useMemo(
    () =>
      incidentFilter === 'all'
        ? incidents
        : incidents.filter((i) => i.type === incidentFilter),
    [incidents, incidentFilter]
  );

  const openDocModal = (category?: SafetyDocCategory) => {
    setDocModalCategory(category);
    setDocModalOpen(true);
  };

  const openIncidentModal = (type?: IncidentType) => {
    setIncidentModalType(type);
    setIncidentModalOpen(true);
  };

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
                Workspace · Safety
              </div>
              <h1
                className="display text-2xl sm:text-4xl md:text-5xl font-medium leading-tight text-[#1A1A1A]"
                style={{ textWrap: 'balance', fontFamily: FRAUNCES }}
              >
                Safety, <em className="font-normal italic text-[#2F8F5C]">on the record</em>.
              </h1>
              <p className="mt-3 max-w-md text-sm sm:text-[15px] leading-relaxed text-[#6B6B6B]">
                OHS&amp;E policies, SWMS for high-risk tasks, MSDS for hazardous materials, and a
                paper trail of every injury and near miss. All in one place.
              </p>
            </div>

            {canEdit ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openDocModal()}
                  className="group flex items-center gap-2 rounded-full border border-[#E6E1D4] bg-white px-4 py-2.5 text-sm font-medium text-[#3A3A3A] transition-all hover:border-[#D8D2C4] hover:text-[#1A1A1A] hover:shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  Upload document
                </button>
                <button
                  onClick={() => openIncidentModal()}
                  className="group inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-[#2F8F5C] px-5 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-[#246F47] hover:shadow-lg hover:shadow-[#2F8F5C]/20 active:bg-[#246F47]"
                >
                  <AlertTriangle className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
                  Log incident
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-[#E6E1D4] bg-white px-4 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#A0A0A0]" />
                Read-only access
              </div>
            )}
          </div>

          {/* Stat strip */}
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-[#E6E1D4] md:grid-cols-4">
            <StatCell label="Active SWMS" value={stats.swms.toString()} caption="Per high-risk task" accent="#2F8F5C" />
            <StatCell label="MSDS on file" value={stats.msds.toString()} caption="Hazardous materials" accent="#5B6B7B" />
            <StatCell label="Open incidents" value={stats.open.toString()} caption="Awaiting close-out" accent="#C44545" />
            <StatCell
              label="Days since last incident"
              value={stats.lastIncident === null ? '—' : stats.lastIncident.toString()}
              caption={stats.lastIncident === null ? 'No incidents logged' : 'Across the project'}
              accent="#1A1A1A"
            />
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Glossary card */}
        <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          <div className="border-b border-[#EFEBE0] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
              Quick reference
            </p>
            <h2 className="display mt-1 text-xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>What goes where</h2>
          </div>
          <div className="grid gap-px bg-[#EFEBE0] sm:grid-cols-3">
            <GlossaryCell
              Icon={ShieldCheck}
              title="OHS&E"
              caption="Occupational Health, Safety & Environment — site policies, inductions, environmental controls."
            />
            <GlossaryCell
              Icon={HardHat}
              title="SWMS"
              caption="Safe Work Method Statement — how a high-risk task is done safely (e.g. working at heights)."
            />
            <GlossaryCell
              Icon={FileText}
              title="MSDS / SDS"
              caption="Material/Safety Data Sheet — hazard info for chemicals and materials kept on site."
            />
          </div>
        </section>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-[#E6E1D4] bg-white p-1 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
          <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')}>
            <FileText className="h-3.5 w-3.5" />
            Documents
          </TabButton>
          <TabButton active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Incidents
          </TabButton>
          {canSeeHazards && (
            <TabButton active={activeTab === 'hazards'} onClick={() => setActiveTab('hazards')}>
              <ShieldCheck className="h-3.5 w-3.5" />
              AI hazards
              {hazards.filter((h) => h.status === 'open').length > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#C44545] px-1 text-[10px] font-semibold text-white">
                  {hazards.filter((h) => h.status === 'open').length}
                </span>
              )}
            </TabButton>
          )}
        </div>

        {activeTab === 'documents' && (
          <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEBE0] px-6 py-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'ohse', 'swms', 'msds'] as const).map((cat) => {
                  const isActive = docFilter === cat;
                  const count =
                    cat === 'all'
                      ? documents.length
                      : documents.filter((d) => d.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setDocFilter(cat)}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#1A1A1A] text-white shadow-sm'
                          : 'text-[#6B6B6B] hover:bg-[#FAF8F2]'
                      }`}
                    >
                      {cat === 'all' ? 'All' : CATEGORY_LABEL[cat]}
                      <span className={isActive ? 'text-white/60' : 'text-[#A0A0A0]'}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center bg-[#FAF8F2] px-6 py-16 text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                  {docFilter === 'all' ? 'No safety documents yet' : `No ${CATEGORY_LABEL[docFilter as SafetyDocCategory]} documents yet`}
                </p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-[#6B6B6B]">
                  {docFilter === 'all'
                    ? 'Upload OHS&E policies, SWMS, and MSDS so the crew has a single source of truth.'
                    : CATEGORY_BLURB[docFilter as SafetyDocCategory]}
                </p>
                {canEdit && (
                  <button
                    onClick={() =>
                      openDocModal(docFilter === 'all' ? undefined : (docFilter as SafetyDocCategory))
                    }
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#2F8F5C] px-4 py-2 text-xs font-medium text-white transition-all hover:bg-[#246F47]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Upload {docFilter === 'all' ? 'document' : CATEGORY_LABEL[docFilter as SafetyDocCategory]}
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-[#EFEBE0]">
                {filteredDocs.map((doc) => (
                  <DocRow key={doc.id} doc={doc} canEdit={canEdit} onRemove={handleRemoveDocument} />
                ))}
              </ul>
            )}
          </section>
        )}

        {activeTab === 'incidents' && (
          <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEBE0] px-6 py-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'injury', 'near_miss'] as const).map((t) => {
                  const isActive = incidentFilter === t;
                  const count =
                    t === 'all' ? incidents.length : incidents.filter((i) => i.type === t).length;
                  const label = t === 'all' ? 'All' : t === 'injury' ? 'Injury' : 'Near Miss';
                  return (
                    <button
                      key={t}
                      onClick={() => setIncidentFilter(t)}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-[#1A1A1A] text-white shadow-sm'
                          : 'text-[#6B6B6B] hover:bg-[#FAF8F2]'
                      }`}
                    >
                      {label}
                      <span className={isActive ? 'text-white/60' : 'text-[#A0A0A0]'}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center bg-[#FAF8F2] px-6 py-16 text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                  No incidents logged
                </p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-[#6B6B6B]">
                  Use the form to log an injury or a near miss. Near misses are gold — they catch
                  the things that almost went wrong before they do.
                </p>
                {canEdit && (
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => openIncidentModal('injury')}
                      className="inline-flex items-center gap-2 rounded-full border border-[#E6E1D4] px-4 py-2 text-xs font-medium text-[#3A3A3A] transition-all hover:border-[#D8D2C4] hover:text-[#1A1A1A]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Injury form
                    </button>
                    <button
                      onClick={() => openIncidentModal('near_miss')}
                      className="inline-flex items-center gap-2 rounded-full bg-[#2F8F5C] px-4 py-2 text-xs font-medium text-white transition-all hover:bg-[#246F47]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Near miss form
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-[#EFEBE0]">
                {filteredIncidents.map((incident) => (
                  <IncidentRow
                    key={incident.id}
                    incident={incident}
                    canEdit={canEdit}
                    onStatusChange={handleIncidentStatus}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {activeTab === 'hazards' && canSeeHazards && (
        <section className="mx-4 mb-6 overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] sm:mx-8">
          <div className="border-b border-[#EFEBE0] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
              — AI-detected hazards
            </p>
            <h3 className="display mt-1 text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
              Flags surfaced by photo analysis
            </h3>
            <p className="mt-1 text-sm text-[#6B6B6B]">
              Inserted automatically when the AI sees something on a site photo. Manager+ can
              acknowledge, resolve, or dismiss. Drives the realtime safety toast pipeline.
            </p>
          </div>

          {hazardsError && (
            <div className="border-b border-[#F0BFBF] bg-[#FBE5E5] px-6 py-2 text-sm text-[#C44545]">
              {hazardsError}
            </div>
          )}

          {hazardsLoading ? (
            <div className="px-6 py-12 text-center text-sm text-[#A0A0A0]">Loading…</div>
          ) : hazards.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">No AI hazards yet</p>
              <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
                The AI hasn't flagged anything on this project. Photos with critical or
                high-severity flags surface here automatically once analysed.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EFEBE0]">
              {hazards.map((h) => (
                <li
                  key={h.id}
                  ref={(el) => {
                    if (el) incidentRefs.current.set(h.id, el);
                    else incidentRefs.current.delete(h.id);
                  }}
                  className={`px-4 py-4 transition-colors sm:px-6 ${
                    highlightedIncidentId === h.id ? 'bg-[#E5F2EA]/60 ring-2 ring-[#A8D0B8] ring-inset' : ''
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${HAZARD_SEVERITY_TONE[h.severity]}`}>
                          {h.severity}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${HAZARD_STATUS_TONE[h.status]}`}>
                          {h.status}
                        </span>
                        {h.aiAnalysisId && (
                          <span className="inline-flex rounded-full border border-[#EEF1F4] bg-[#EEF1F4] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#5B6B7B]">
                            AI
                          </span>
                        )}
                        {h.photoId && (
                          /* Cross-link from incident to its source photo. Plain
                             <a> for middle-click / cmd-click → new tab. */
                          <a
                            href={`/gallery?project=${h.projectId}&photo=${h.photoId}`}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(`/gallery?project=${h.projectId}&photo=${h.photoId}`);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
                          >
                            <ImageIcon className="h-3 w-3" aria-hidden />
                            View photo
                          </a>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {h.flags.map((f) => (
                          <span
                            key={f}
                            className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2 py-0.5 text-[11px] font-medium text-[#3A3A3A]"
                          >
                            <AlertTriangle className="h-3 w-3 text-[#6B6B6B]" aria-hidden />
                            {HAZARD_FLAG_LABEL[f] ?? f}
                          </span>
                        ))}
                      </div>
                      {h.notes && (
                        <p className="mt-2 line-clamp-2 text-sm text-[#3A3A3A]">{h.notes}</p>
                      )}
                      <p className="mt-1 text-[11px] text-[#A0A0A0]">
                        {fmtDateTime(h.createdAt)}
                      </p>
                    </div>
                    {canResolveHazards && h.status !== 'resolved' && h.status !== 'dismissed' && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {canEdit && (
                          <button
                            type="button"
                            disabled={raisingDefectId === h.id || raisedDefectIds.has(h.id)}
                            onClick={() => handleRaiseDefect(h)}
                            className="inline-flex items-center justify-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#3A3A3A] hover:border-[#D8D2C4] disabled:opacity-50"
                          >
                            <Bug className="h-3.5 w-3.5" />
                            {raisedDefectIds.has(h.id) ? 'Defect raised' : 'Raise defect'}
                          </button>
                        )}
                        {h.status === 'open' && (
                          <button
                            type="button"
                            disabled={hazardActing === h.id}
                            onClick={() => handleHazardAction(h.id, acknowledgeIncident)}
                            className="inline-flex items-center justify-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#3A3A3A] hover:border-[#D8D2C4] disabled:opacity-50"
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={hazardActing === h.id}
                          onClick={() => handleHazardAction(h.id, resolveIncident)}
                          className="inline-flex items-center justify-center gap-1 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#246F47] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolve
                        </button>
                        <button
                          type="button"
                          disabled={hazardActing === h.id}
                          onClick={() => handleHazardAction(h.id, dismissIncident)}
                          className="inline-flex items-center justify-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#6B6B6B] hover:bg-[#FAF8F2] disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <SafetyDocumentModal
        open={docModalOpen}
        projectId={project.id}
        initialCategory={docModalCategory}
        onClose={() => setDocModalOpen(false)}
        onCreated={(doc) =>
          setDocuments((prev) => (prev.some((d) => d.id === doc.id) ? prev : [doc, ...prev]))
        }
      />
      <IncidentFormModal
        open={incidentModalOpen}
        projectId={project.id}
        initialType={incidentModalType}
        onClose={() => setIncidentModalOpen(false)}
        onCreated={(inc) =>
          setIncidents((prev) => (prev.some((i) => i.id === inc.id) ? prev : [inc, ...prev]))
        }
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: string;
  caption: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden bg-white p-5">
      <div className="absolute left-0 top-0 h-px w-8" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">{label}</p>
      <p className="num mt-2 text-4xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{value}</p>
      <p className="mt-1 text-xs text-[#A0A0A0]">{caption}</p>
    </div>
  );
}

function GlossaryCell({
  Icon,
  title,
  caption,
}: {
  Icon: typeof ShieldCheck;
  title: string;
  caption: string;
}) {
  return (
    <div className="bg-white p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#1A1A1A] text-white">
        <Icon className="h-4 w-4" />
      </div>
      <p className="display mt-3 text-base font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#6B6B6B]">{caption}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
        active ? 'bg-[#1A1A1A] text-white shadow-sm' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
      }`}
    >
      {children}
    </button>
  );
}

function DocRow({
  doc,
  canEdit,
  onRemove,
}: {
  doc: SafetyDocument;
  canEdit: boolean;
  onRemove: (id: string) => void;
}) {
  const expired = doc.expiryDate ? new Date(doc.expiryDate) < new Date() : false;

  return (
    <li className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-[#FAF8F2]">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] bg-[#F0EDE4] text-[#3A3A3A]">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="display text-base font-medium text-[#1A1A1A]">{doc.title}</p>
          <span className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">
            {CATEGORY_LABEL[doc.category]}
          </span>
          {doc.reference && <span className="text-xs text-[#A0A0A0]">· {doc.reference}</span>}
        </div>
        <p className="mt-0.5 text-xs text-[#6B6B6B]">
          {doc.fileName}
          {doc.fileSizeKb ? ` · ${doc.fileSizeKb} KB` : ''} · uploaded by {doc.uploadedBy} on{' '}
          {fmtDate(doc.uploadedAt)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-[#6B6B6B]">Effective {fmtDate(doc.effectiveDate)}</p>
        {doc.expiryDate && (
          <p className={`text-xs ${expired ? 'font-medium text-[#C44545]' : 'text-[#A0A0A0]'}`}>
            {expired ? 'Expired' : 'Expires'} {fmtDate(doc.expiryDate)}
          </p>
        )}
      </div>
      {canEdit && (
        <button
          onClick={() => onRemove(doc.id)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[#A0A0A0] transition-colors hover:bg-[#FBE5E5] hover:text-[#C44545]"
          title="Remove document"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function IncidentRow({
  incident,
  canEdit,
  onStatusChange,
}: {
  incident: IncidentReport;
  canEdit: boolean;
  onStatusChange: (id: string, status: IncidentStatus) => void;
}) {
  return (
    <li className="px-6 py-4 hover:bg-[#FAF8F2]">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[11px] ${
            incident.type === 'injury' ? 'bg-[#FBE5E5] text-[#C44545]' : 'bg-[#F9EFD9] text-[#C8841E]'
          }`}
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">
              {incident.type === 'injury' ? 'Injury' : 'Near Miss'}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_BADGE[incident.severity]}`}
            >
              {SEVERITY_LABEL[incident.severity]}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[incident.status]}`}
            >
              {STATUS_LABEL[incident.status]}
            </span>
            <span className="text-xs text-[#A0A0A0]">· {fmtDateTime(incident.occurredAt)}</span>
          </div>
          <p className="mt-1.5 text-sm text-[#1A1A1A]">{incident.description}</p>
          <p className="mt-0.5 text-xs text-[#6B6B6B]">
            {incident.location}
            {incident.personInvolved ? ` · ${incident.personInvolved}` : ''}
            {' · '}reported by {incident.reportedBy}
          </p>
          {(incident.treatmentGiven ||
            incident.contributingFactors ||
            incident.recommendedAction) && (
            <div className="mt-2 grid gap-1 rounded-[9px] bg-[#FAF8F2] px-3 py-2 text-xs text-[#3A3A3A] sm:grid-cols-2">
              {incident.treatmentGiven && (
                <p>
                  <span className="font-medium text-[#1A1A1A]">Treatment:</span>{' '}
                  {incident.treatmentGiven}
                </p>
              )}
              {incident.contributingFactors && (
                <p>
                  <span className="font-medium text-[#1A1A1A]">Contributing factors:</span>{' '}
                  {incident.contributingFactors}
                </p>
              )}
              {incident.recommendedAction && (
                <p>
                  <span className="font-medium text-[#1A1A1A]">Recommended action:</span>{' '}
                  {incident.recommendedAction}
                </p>
              )}
              {incident.witnesses && (
                <p>
                  <span className="font-medium text-[#1A1A1A]">Witnesses:</span>{' '}
                  {incident.witnesses}
                </p>
              )}
              {incident.photoNames && incident.photoNames.length > 0 && (
                <p>
                  <span className="font-medium text-[#1A1A1A]">Photos:</span>{' '}
                  {incident.photoNames.length} attached
                </p>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <select
            value={incident.status}
            onChange={(e) => onStatusChange(incident.id, e.target.value as IncidentStatus)}
            className="h-8 rounded-md border border-[#E6E1D4] bg-white px-2 text-xs font-medium text-[#3A3A3A] shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          >
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="closed">Closed</option>
          </select>
        )}
      </div>
    </li>
  );
}
