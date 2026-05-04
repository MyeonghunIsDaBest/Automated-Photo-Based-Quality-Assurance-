import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  FileText,
  HardHat,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '../store';
import { canEditProjects } from '../lib/permissions';
import { useSafetyStore } from './safety/store';
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

type TabKey = 'documents' | 'incidents';

const FONT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
  .safety-root { font-family: 'DM Sans', system-ui, sans-serif; }
  .safety-root .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
  .safety-root .num     { font-family: 'Fraunces', Georgia, serif; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
  .safety-root .grid-bg {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
  }
`;

const SEVERITY_BADGE: Record<IncidentSeverity, string> = {
  low: 'border-slate-200 bg-slate-50 text-slate-600',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  critical: 'border-red-200 bg-red-50 text-red-700',
};

const STATUS_BADGE: Record<IncidentStatus, string> = {
  open: 'border-red-200 bg-red-50 text-red-700',
  investigating: 'border-amber-200 bg-amber-50 text-amber-700',
  closed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
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
  const documents = useSafetyStore((s) => s.documents);
  const incidents = useSafetyStore((s) => s.incidents);
  const removeDocument = useSafetyStore((s) => s.removeDocument);
  const setIncidentStatus = useSafetyStore((s) => s.setIncidentStatus);

  const canEdit = canEditProjects(currentUser);

  const [activeTab, setActiveTab] = useState<TabKey>('documents');
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
    <div className="safety-root min-h-full bg-[#FAFAF7]">
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
                Workspace · Safety
              </div>
              <h1
                className="display text-2xl sm:text-4xl md:text-5xl font-medium leading-tight text-slate-900"
                style={{ textWrap: 'balance' }}
              >
                Safety, <em className="font-normal italic text-emerald-700">on the record</em>.
              </h1>
              <p className="mt-3 max-w-md text-sm sm:text-[15px] leading-relaxed text-slate-500">
                OHS&E policies, SWMS for high-risk tasks, MSDS for hazardous materials, and a
                paper trail of every injury and near miss. All in one place.
              </p>
            </div>

            {canEdit ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openDocModal()}
                  className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:text-slate-900 hover:shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  Upload document
                </button>
                <button
                  onClick={() => openIncidentModal()}
                  className="group inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 active:bg-emerald-800"
                >
                  <AlertTriangle className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
                  Log incident
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-slate-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400" />
                Read-only access
              </div>
            )}
          </div>

          {/* Stat strip */}
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-4">
            <StatCell label="Active SWMS" value={stats.swms.toString()} caption="Per high-risk task" accent="#0F766E" />
            <StatCell label="MSDS on file" value={stats.msds.toString()} caption="Hazardous materials" accent="#1E40AF" />
            <StatCell label="Open incidents" value={stats.open.toString()} caption="Awaiting close-out" accent="#DC2626" />
            <StatCell
              label="Days since last incident"
              value={stats.lastIncident === null ? '—' : stats.lastIncident.toString()}
              caption={stats.lastIncident === null ? 'No incidents logged' : 'Across the project'}
              accent="#0F172A"
            />
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Glossary card */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Quick reference
            </p>
            <h2 className="display mt-1 text-xl font-medium text-slate-900">What goes where</h2>
          </div>
          <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
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
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')}>
            <FileText className="h-3.5 w-3.5" />
            Documents
          </TabButton>
          <TabButton active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Incidents
          </TabButton>
        </div>

        {activeTab === 'documents' && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
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
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cat === 'all' ? 'All' : CATEGORY_LABEL[cat]}
                      <span className={isActive ? 'text-slate-300' : 'text-slate-400'}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center bg-slate-50/60 px-6 py-16 text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                  {docFilter === 'all' ? 'No safety documents yet' : `No ${CATEGORY_LABEL[docFilter as SafetyDocCategory]} documents yet`}
                </p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  {docFilter === 'all'
                    ? 'Upload OHS&E policies, SWMS, and MSDS so the crew has a single source of truth.'
                    : CATEGORY_BLURB[docFilter as SafetyDocCategory]}
                </p>
                {canEdit && (
                  <button
                    onClick={() =>
                      openDocModal(docFilter === 'all' ? undefined : (docFilter as SafetyDocCategory))
                    }
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-emerald-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Upload {docFilter === 'all' ? 'document' : CATEGORY_LABEL[docFilter as SafetyDocCategory]}
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredDocs.map((doc) => (
                  <DocRow key={doc.id} doc={doc} canEdit={canEdit} onRemove={removeDocument} />
                ))}
              </ul>
            )}
          </section>
        )}

        {activeTab === 'incidents' && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
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
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                      <span className={isActive ? 'text-slate-300' : 'text-slate-400'}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center bg-slate-50/60 px-6 py-16 text-center">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                  No incidents logged
                </p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  Use the form to log an injury or a near miss. Near misses are gold — they catch
                  the things that almost went wrong before they do.
                </p>
                {canEdit && (
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={() => openIncidentModal('injury')}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition-all hover:border-slate-300 hover:text-slate-900"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Injury form
                    </button>
                    <button
                      onClick={() => openIncidentModal('near_miss')}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-emerald-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Near miss form
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredIncidents.map((incident) => (
                  <IncidentRow
                    key={incident.id}
                    incident={incident}
                    canEdit={canEdit}
                    onStatusChange={setIncidentStatus}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <SafetyDocumentModal
        open={docModalOpen}
        initialCategory={docModalCategory}
        onClose={() => setDocModalOpen(false)}
      />
      <IncidentFormModal
        open={incidentModalOpen}
        initialType={incidentModalType}
        onClose={() => setIncidentModalOpen(false)}
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
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="num mt-2 text-4xl font-medium text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
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
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icon className="h-4 w-4" />
      </div>
      <p className="display mt-3 text-base font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{caption}</p>
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
        active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
    <li className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-slate-50/60">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="display text-base font-medium text-slate-900">{doc.title}</p>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
            {CATEGORY_LABEL[doc.category]}
          </span>
          {doc.reference && <span className="text-xs text-slate-400">· {doc.reference}</span>}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {doc.fileName}
          {doc.fileSizeKb ? ` · ${doc.fileSizeKb} KB` : ''} · uploaded by {doc.uploadedBy} on{' '}
          {fmtDate(doc.uploadedAt)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-500">Effective {fmtDate(doc.effectiveDate)}</p>
        {doc.expiryDate && (
          <p className={`text-xs ${expired ? 'font-medium text-red-600' : 'text-slate-400'}`}>
            {expired ? 'Expired' : 'Expires'} {fmtDate(doc.expiryDate)}
          </p>
        )}
      </div>
      {canEdit && (
        <button
          onClick={() => onRemove(doc.id)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
    <li className="px-6 py-4 hover:bg-slate-50/60">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
            incident.type === 'injury' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
          }`}
        >
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
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
            <span className="text-xs text-slate-400">· {fmtDateTime(incident.occurredAt)}</span>
          </div>
          <p className="mt-1.5 text-sm text-slate-900">{incident.description}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {incident.location}
            {incident.personInvolved ? ` · ${incident.personInvolved}` : ''}
            {' · '}reported by {incident.reportedBy}
          </p>
          {(incident.treatmentGiven ||
            incident.contributingFactors ||
            incident.recommendedAction) && (
            <div className="mt-2 grid gap-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:grid-cols-2">
              {incident.treatmentGiven && (
                <p>
                  <span className="font-medium text-slate-700">Treatment:</span>{' '}
                  {incident.treatmentGiven}
                </p>
              )}
              {incident.contributingFactors && (
                <p>
                  <span className="font-medium text-slate-700">Contributing factors:</span>{' '}
                  {incident.contributingFactors}
                </p>
              )}
              {incident.recommendedAction && (
                <p>
                  <span className="font-medium text-slate-700">Recommended action:</span>{' '}
                  {incident.recommendedAction}
                </p>
              )}
              {incident.witnesses && (
                <p>
                  <span className="font-medium text-slate-700">Witnesses:</span>{' '}
                  {incident.witnesses}
                </p>
              )}
              {incident.photoNames && incident.photoNames.length > 0 && (
                <p>
                  <span className="font-medium text-slate-700">Photos:</span>{' '}
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
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
