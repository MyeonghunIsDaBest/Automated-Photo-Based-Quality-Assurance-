// ServiceJobDrawer — right-side slide-over detail panel for a service job.
//
// Shell: MotionDrawer (matches DiaryEntryDrawer's pattern).
// Sections:
//   1. Header: title + status pill + "Service" badge + close button.
//   2. Details: client name/phone/address/description (inline-editable by managers).
//   3. Status buttons: 5 statuses, gated canLogServiceJobWork.
//   4. Schedule date: manager only → scheduleServiceJob.
//   5. Assignee: manager only → updateServiceJob({ assignedTo }).
//   6. Materials + Notes: editable when canLogServiceJobWork, explicit Save buttons.
//   7. Photos: JobPhotosSection (before/after/other).
//   8. Time entries: TimeEntriesSection.
//   9. Delete: manager only, inline confirm.
//
// Gate matrix
//   Control              Worker  Manager
//   ─────────────────────────────────────
//   Flip status          ✅      ✅
//   Edit details         ✗       ✅
//   Schedule date        ✗       ✅
//   Assignee             ✗       ✅
//   Materials/Notes      ✅      ✅
//   Add photos           ✅      ✅
//   Delete photos        ✅      ✅  (uploader OR manager; RLS enforces real rule)
//   Log time (own)       ✅      ✅
//   Pick tech (time)     ✗       ✅
//   Delete job           ✗       ✅

import { useCallback, useEffect, useState } from 'react';
import { X, Trash2, Loader2, Pencil, Check, X as XIcon, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MotionDrawer from '../../components/ui/MotionDrawer';
import { inputField } from '../gantt/components/ledger';
import { cn } from '../../lib/cn';
import { useAppStore } from '../../store';
import {
  canManageServiceJobs,
  canLogServiceJobWork,
  canManageSales,
} from '../../lib/permissions';
import {
  listQuotes, createQuote, getQuoteForJob, listVariations, listInvoices, listQuoteSections,
  type Quote, type Variation, type Invoice, type QuoteSection,
} from '../../lib/api/commercial';
import {
  getServiceJob,
  updateServiceJob,
  updateServiceJobStatus,
  scheduleServiceJob,
  deleteServiceJob,
  listServiceJobPhotos,
  listTimeEntries,
  setContractValue,
  setMaterialsCost,
  displayJobNumber,
  type ServiceJob,
  type ServiceJobStatus,
  type ServiceJobPhoto,
  type ServiceJobTimeEntry,
} from '../../lib/api/serviceJobs';
import {
  getServiceJobProfit,
  type JobProfitResult,
} from '../../lib/api/labourRates';
import { listProfiles } from '../../lib/api/profiles';
import type { Profile } from '../../types';
import { JobPhotosSection } from './JobPhotosSection';
import { TimeEntriesSection } from './TimeEntriesSection';
import { JobBoxSection } from './JobBoxSection';
import ProfitSummaryCard from './ProfitSummaryCard';

// ─── Status metadata ──────────────────────────────────────────────────────────

const STATUS_META: Record<ServiceJobStatus, { label: string; pill: string }> = {
  pending:     { label: 'Pending',     pill: 'bg-[#EEF1F4] text-[#5B6B7B] border-[#D8DFE8]' },
  scheduled:   { label: 'Scheduled',   pill: 'bg-[#F9EFD9] text-[#C8841E] border-[#E8D8B5]' },
  in_progress: { label: 'In Progress', pill: 'bg-[#E5F2EA] text-[#246F47] border-[#C8E0D2]' },
  done:        { label: 'Completed',   pill: 'bg-[#E5F2EA] text-[#246F47] border-[#C8E0D2]' },
  invoiced:    { label: 'Invoiced',    pill: 'bg-[#F6E7DA] text-[#A35C2B] border-[#E8D0BB]' },
  paid:        { label: 'Paid',        pill: 'bg-[#E5F2EA] text-[#246F47] border-[#C8E0D2]' },
  archived:    { label: 'Archived',    pill: 'bg-[#ECE8DE] text-[#6B6B6B] border-[#DAD3C4]' },
  cancelled:   { label: 'Cancelled',   pill: 'bg-[#FBE5E5] text-[#C44545] border-[#F0C8C8]' },
};

const ALL_STATUSES: ServiceJobStatus[] =
  ['pending', 'scheduled', 'in_progress', 'done', 'invoiced', 'paid', 'archived', 'cancelled'];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobId: string;
  onClose: () => void;
  /** Called after any mutation that affects board columns/titles. */
  onChanged: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ServiceJobDrawer({ jobId, onClose, onChanged }: Props) {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const canManage = canManageServiceJobs(currentProfile);
  const canLog    = canLogServiceJobWork(currentProfile);
  const canSell   = canManageSales(currentProfile);
  const navigate  = useNavigate();

  // ── Remote data ────────────────────────────────────────────────────────────
  const [job,      setJob]      = useState<ServiceJob | null>(null);
  const [photos,   setPhotos]   = useState<(ServiceJobPhoto & { url: string | null })[]>([]);
  const [entries,  setEntries]  = useState<ServiceJobTimeEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [j, ph, te, pr] = await Promise.all([
        getServiceJob(jobId),
        listServiceJobPhotos(jobId),
        listTimeEntries(jobId),
        listProfiles(),
      ]);
      if (!j) {
        setLoadError('Job not found.');
      } else {
        setJob(j);
        setPhotos(ph);
        setEntries(te);
        setProfiles(pr);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load job.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Linked quotes (manager-sales only) ─────────────────────────────────────
  const [jobQuotes, setJobQuotes]       = useState<Quote[]>([]);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [quoteError, setQuoteError]     = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || !canSell) { setJobQuotes([]); return; }
    let alive = true;
    listQuotes({ serviceJobId: jobId })
      .then((qs) => { if (alive) setJobQuotes(qs); })
      .catch(() => { /* non-fatal — section just shows empty */ });
    return () => { alive = false; };
  }, [jobId, canSell]);

  // ── Sales thread: originating quote → variations → invoices (manager-sales) ──
  const [originQuote, setOriginQuote]     = useState<Quote | null>(null);
  const [originSections, setOriginSections] = useState<QuoteSection[]>([]);
  const [jobVariations, setJobVariations] = useState<Variation[]>([]);
  const [jobInvoices, setJobInvoices]     = useState<Invoice[]>([]);

  useEffect(() => {
    if (!jobId || !canSell) { setOriginQuote(null); setOriginSections([]); setJobVariations([]); setJobInvoices([]); return; }
    let alive = true;
    void (async () => {
      // Server-scoped reads — client-side filtering would silently truncate at
      // PostgREST's 1000-row cap once the tables grow.
      const [origin, variations, invoices] = await Promise.all([
        getQuoteForJob(jobId).catch(() => null),
        listVariations({ serviceJobId: jobId }).catch(() => [] as Variation[]),
        listInvoices({ serviceJobId: jobId }).catch(() => [] as Invoice[]),
      ]);
      if (!alive) return;
      setOriginQuote(origin);
      setJobVariations(variations);
      setJobInvoices(invoices);
      if (origin) {
        const sections = await listQuoteSections(origin.id).catch(() => [] as QuoteSection[]);
        if (alive) setOriginSections(sections);
      } else {
        setOriginSections([]);
      }
    })();
    return () => { alive = false; };
  }, [jobId, canSell]);

  async function handleNewQuote() {
    if (!job) return;
    setCreatingQuote(true);
    setQuoteError(null);
    try {
      const q = await createQuote({
        serviceJobId: jobId,
        customerId: job.customerId ?? undefined,
        clientName: job.clientName ?? undefined,
        title: job.title,
      });
      navigate(`/quotes?quote=${q.id}`);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Failed to create quote.');
    } finally {
      setCreatingQuote(false);
    }
  }

  // ── Detail edit state ──────────────────────────────────────────────────────
  const [editingDetails, setEditingDetails] = useState(false);
  const [draftClientName,  setDraftClientName]  = useState('');
  const [draftClientPhone, setDraftClientPhone] = useState('');
  const [draftAddress,     setDraftAddress]     = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [detailSaving,     setDetailSaving]     = useState(false);
  const [detailError,      setDetailError]      = useState<string | null>(null);

  // Populate draft fields whenever job loads / reloads
  useEffect(() => {
    if (!job) return;
    setDraftClientName(job.clientName ?? '');
    setDraftClientPhone(job.clientPhone ?? '');
    setDraftAddress(job.address ?? '');
    setDraftDescription(job.description ?? '');
  }, [job]);

  const openDetails = () => {
    if (!job) return;
    setDraftClientName(job.clientName ?? '');
    setDraftClientPhone(job.clientPhone ?? '');
    setDraftAddress(job.address ?? '');
    setDraftDescription(job.description ?? '');
    setDetailError(null);
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!job) return;
    setDetailSaving(true);
    setDetailError(null);
    try {
      const updated = await updateServiceJob(job.id, {
        clientName:  draftClientName  || null,
        clientPhone: draftClientPhone || null,
        address:     draftAddress     || null,
        description: draftDescription || null,
      });
      setJob(updated);
      setEditingDetails(false);
      onChanged();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setDetailSaving(false);
    }
  };

  // ── Status ─────────────────────────────────────────────────────────────────
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const handleStatusChange = async (status: ServiceJobStatus) => {
    if (!job || !canLog) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const updated = await updateServiceJobStatus(job.id, status);
      setJob(updated);
      onChanged();
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Status update failed.');
    } finally {
      setStatusBusy(false);
    }
  };

  // ── Schedule ───────────────────────────────────────────────────────────────
  const [scheduleDateInput, setScheduleDateInput] = useState('');
  const [scheduleSaving,    setScheduleSaving]    = useState(false);
  const [scheduleError,     setScheduleError]     = useState<string | null>(null);

  useEffect(() => {
    if (job?.scheduledFor) setScheduleDateInput(job.scheduledFor);
  }, [job?.scheduledFor]);

  const handleScheduleSave = async () => {
    if (!job || !scheduleDateInput) return;
    setScheduleSaving(true);
    setScheduleError(null);
    try {
      const updated = await scheduleServiceJob(job.id, scheduleDateInput);
      setJob(updated);
      onChanged();
    } catch (e) {
      setScheduleError(e instanceof Error ? e.message : 'Schedule update failed.');
    } finally {
      setScheduleSaving(false);
    }
  };

  // ── Assignee ───────────────────────────────────────────────────────────────
  const [assigneeSaving, setAssigneeSaving] = useState(false);
  const [assigneeError,  setAssigneeError]  = useState<string | null>(null);

  const internalProfiles = profiles.filter(
    (p) => p.isActive !== false &&
      !['customer', 'supplier', 'stakeholder'].includes(p.securityGroup ?? ''),
  );

  const handleAssigneeChange = async (userId: string) => {
    if (!job || !canManage) return;
    setAssigneeSaving(true);
    setAssigneeError(null);
    try {
      const updated = await updateServiceJob(job.id, {
        assignedTo: userId || null,
      });
      setJob(updated);
      onChanged();
    } catch (e) {
      setAssigneeError(e instanceof Error ? e.message : 'Assignee update failed.');
    } finally {
      setAssigneeSaving(false);
    }
  };

  // ── Materials + Notes ──────────────────────────────────────────────────────
  const [materialsValue, setMaterialsValue] = useState('');
  const [materialsOriginal, setMaterialsOriginal] = useState('');
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);

  const [notesValue, setNotesValue] = useState('');
  const [notesOriginal, setNotesOriginal] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    setMaterialsValue(job.materials ?? '');
    setMaterialsOriginal(job.materials ?? '');
    setNotesValue(job.notes ?? '');
    setNotesOriginal(job.notes ?? '');
  }, [job]);

  const saveMaterials = async () => {
    if (!job) return;
    setMaterialsSaving(true);
    setMaterialsError(null);
    try {
      const updated = await updateServiceJob(job.id, { materials: materialsValue || null });
      setJob(updated);
      setMaterialsOriginal(materialsValue);
      onChanged();
    } catch (e) {
      setMaterialsError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setMaterialsSaving(false);
    }
  };

  const saveNotes = async () => {
    if (!job) return;
    setNotesSaving(true);
    setNotesError(null);
    try {
      const updated = await updateServiceJob(job.id, { notes: notesValue || null });
      setJob(updated);
      setNotesOriginal(notesValue);
      onChanged();
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setNotesSaving(false);
    }
  };

  // ── Profit (manager only) ──────────────────────────────────────────────────
  const [profit,        setProfit]        = useState<JobProfitResult | null>(null);
  const [profitLoading, setProfitLoading] = useState(false);

  const fetchProfit = useCallback(async () => {
    if (!canManage) return;
    setProfitLoading(true);
    try {
      const p = await getServiceJobProfit(jobId);
      setProfit(p);
    } catch {
      // Non-fatal: card stays null
    } finally {
      setProfitLoading(false);
    }
  }, [canManage, jobId]);

  // Fetch profit on drawer open (after main load) and whenever jobId changes.
  useEffect(() => {
    void fetchProfit();
  }, [fetchProfit]);

  // ── Set Financials modal state ─────────────────────────────────────────────
  const [finModalOpen,    setFinModalOpen]    = useState(false);
  const [finContract,     setFinContract]     = useState('');
  const [finMaterials,    setFinMaterials]    = useState('');
  const [finSaving,       setFinSaving]       = useState(false);
  const [finError,        setFinError]        = useState<string | null>(null);

  // Pre-fill financials modal from the current job whenever it opens.
  useEffect(() => {
    if (!finModalOpen || !job) return;
    setFinContract(job.contractValue !== null ? String(job.contractValue) : '');
    setFinMaterials(job.materialsCost !== null ? String(job.materialsCost) : '');
    setFinError(null);
  }, [finModalOpen, job]);

  const handleFinSave = async () => {
    if (!job) return;
    setFinSaving(true);
    setFinError(null);
    try {
      const newContract  = finContract.trim()  === '' ? null : parseFloat(finContract);
      const newMaterials = finMaterials.trim() === '' ? null : parseFloat(finMaterials);
      const promises: Promise<void>[] = [];
      if (newContract !== job.contractValue)  promises.push(setContractValue(job.id, newContract));
      if (newMaterials !== job.materialsCost) promises.push(setMaterialsCost(job.id, newMaterials));
      await Promise.all(promises);
      // Refresh job row so contractValue/materialsCost are up-to-date for next open.
      const refreshed = await getServiceJob(job.id);
      if (refreshed) setJob(refreshed);
      setFinModalOpen(false);
      await fetchProfit();
    } catch (e) {
      setFinError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setFinSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!job) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteServiceJob(job.id);
      onChanged();
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
      setDeleteBusy(false);
    }
  };

  // ── Refresh callback for child sections ────────────────────────────────────
  const handleSectionChanged = useCallback(async () => {
    // Re-fetch photos + time entries only (not the full job), then refresh profit
    // so adding/removing a time entry is immediately reflected in the profit card.
    try {
      const [ph, te] = await Promise.all([
        listServiceJobPhotos(jobId),
        listTimeEntries(jobId),
      ]);
      setPhotos(ph);
      setEntries(te);
    } catch {
      // Non-fatal: parent can retry
    }
    void fetchProfit();
    onChanged();
  }, [jobId, onChanged, fetchProfit]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const assignedProfile = job?.assignedTo
    ? profiles.find((p) => p.id === job.assignedTo)
    : null;
  const assignedName = assignedProfile
    ? `${assignedProfile.firstName} ${assignedProfile.lastName}`.trim() || assignedProfile.email
    : null;

  return (
    <MotionDrawer
      open
      // The Set Financials modal is a hand-rolled overlay (not in MotionDrawer's
      // openStack), so an unguarded Esc/backdrop here would close the WHOLE job
      // drawer out from under it and discard typed figures. While it's open,
      // Esc dismisses just the modal (unless a save is in flight); otherwise the
      // drawer closes as normal.
      onClose={() => {
        if (!finModalOpen) onClose();
        else if (!finSaving) setFinModalOpen(false);
      }}
      ariaLabel="Service job detail"
      sizeClass="sm:w-[540px] lg:w-[620px]"
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
          <div className="min-w-0 flex-1">
            {job ? (
              <div className="flex flex-wrap items-center gap-2">
                {displayJobNumber(job) && (
                  <span className="font-mono text-[12px] text-[#A0A0A0]">#{displayJobNumber(job)}</span>
                )}
                <h2
                  className="text-[17px] font-medium text-[#1A1A1A] truncate"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  {job.title}
                </h2>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_META[job.status].pill}`}
                >
                  {STATUS_META[job.status].label}
                </span>
                <span className="inline-flex items-center rounded-full bg-[#F6E7DA] border border-[#E8D0BB] px-2.5 py-0.5 text-[11px] font-semibold text-[#B5602A]">
                  Service
                </span>
              </div>
            ) : (
              <div className="h-6 w-40 animate-pulse rounded bg-[#F0EDE4]" />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-3 grid min-h-11 min-w-11 flex-shrink-0 place-items-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-[#A0A0A0]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          )}

          {/* Error */}
          {!loading && loadError && (
            <div className="rounded-[10px] border border-[#F0C8C8] bg-[#FBE5E5] px-4 py-4">
              <p className="text-sm text-[#C44545]">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-xs font-medium text-[#C44545] underline"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !loadError && job && (
            <>
              {/* ── Details section ─────────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                    Client Details
                  </label>
                  {canManage && !editingDetails && (
                    <button
                      type="button"
                      onClick={openDetails}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>

                {editingDetails ? (
                  <div className="space-y-2 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">
                          Client name
                        </label>
                        <input
                          type="text"
                          value={draftClientName}
                          onChange={(e) => setDraftClientName(e.target.value)}
                          placeholder="Client name"
                          className={inputField}
                        />
                      </div>
                      <div>
                        <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">
                          Phone
                        </label>
                        <input
                          type="tel"
                          value={draftClientPhone}
                          onChange={(e) => setDraftClientPhone(e.target.value)}
                          placeholder="04xx xxx xxx"
                          className={inputField}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">
                        Address
                      </label>
                      <input
                        type="text"
                        value={draftAddress}
                        onChange={(e) => setDraftAddress(e.target.value)}
                        placeholder="Site address"
                        className={inputField}
                      />
                    </div>
                    <div>
                      <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">
                        Description
                      </label>
                      <textarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        rows={3}
                        placeholder="What needs to be done…"
                        className={cn(inputField, 'resize-none')}
                      />
                    </div>
                    {detailError && (
                      <p className="text-[11px] text-[#C44545]">{detailError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingDetails(false)}
                        disabled={detailSaving}
                        className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[11px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-50"
                      >
                        <XIcon className="h-3 w-3" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveDetails()}
                        disabled={detailSaving}
                        className="inline-flex items-center gap-1 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
                      >
                        {detailSaving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {detailSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2.5">
                    {job.clientName && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A0A0A0]">
                          Name
                        </span>
                        <p className="text-sm font-medium text-[#1A1A1A]">{job.clientName}</p>
                      </div>
                    )}
                    {job.clientPhone && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A0A0A0]">
                          Phone
                        </span>
                        <p className="text-sm text-[#1A1A1A]">
                          <a href={`tel:${job.clientPhone}`} className="hover:underline">
                            {job.clientPhone}
                          </a>
                        </p>
                      </div>
                    )}
                    {job.address && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A0A0A0]">
                          Address
                        </span>
                        <p className="text-sm text-[#1A1A1A]">{job.address}</p>
                      </div>
                    )}
                    {job.description && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#A0A0A0]">
                          Description
                        </span>
                        <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{job.description}</p>
                      </div>
                    )}
                    {!job.clientName && !job.clientPhone && !job.address && !job.description && (
                      <p className="text-[11px] text-[#A0A0A0]">No details recorded.{canManage ? ' Click Edit to add.' : ''}</p>
                    )}
                  </div>
                )}
              </section>

              {/* ── Status buttons ──────────────────────────────────────── */}
              {canLog && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATUSES.map((s) => {
                      const meta = STATUS_META[s];
                      const active = job.status === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => !active && void handleStatusChange(s)}
                          disabled={statusBusy || active}
                          className={[
                            'rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors',
                            active
                              ? meta.pill
                              : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:bg-[#FAF8F2]',
                            statusBusy ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  {statusError && (
                    <p className="mt-1 text-[11px] text-[#C44545]">{statusError}</p>
                  )}
                </section>
              )}

              {/* ── Schedule date (manager only) ─────────────────────── */}
              {canManage && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                    Scheduled Date
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={scheduleDateInput}
                      onChange={(e) => setScheduleDateInput(e.target.value)}
                      className={cn(inputField, 'w-auto')}
                    />
                    <button
                      type="button"
                      onClick={() => void handleScheduleSave()}
                      disabled={scheduleSaving || !scheduleDateInput}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
                    >
                      {scheduleSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {scheduleSaving ? 'Saving…' : 'Set date'}
                    </button>
                  </div>
                  {scheduleError && (
                    <p className="mt-1 text-[11px] text-[#C44545]">{scheduleError}</p>
                  )}
                </section>
              )}

              {/* ── Assignee (manager only) ──────────────────────────── */}
              {canManage && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                    Assigned To
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={job.assignedTo ?? ''}
                      onChange={(e) => void handleAssigneeChange(e.target.value)}
                      disabled={assigneeSaving}
                      className={cn(inputField, 'flex-1')}
                    >
                      <option value="">Unassigned</option>
                      {internalProfiles.map((p) => {
                        const name = `${p.firstName} ${p.lastName}`.trim() || p.email;
                        return (
                          <option key={p.id} value={p.id}>{name}</option>
                        );
                      })}
                    </select>
                    {assigneeSaving && <Loader2 className="h-4 w-4 animate-spin text-[#A0A0A0]" />}
                  </div>
                  {assigneeError && (
                    <p className="mt-1 text-[11px] text-[#C44545]">{assigneeError}</p>
                  )}
                </section>
              )}

              {/* Read-only assignee display for workers */}
              {!canManage && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                    Assigned To
                  </label>
                  <p className="text-sm text-[#1A1A1A]">
                    {assignedName ?? <span className="text-[#A0A0A0]">Unassigned</span>}
                  </p>
                </section>
              )}

              {/* ── Materials ────────────────────────────────────────── */}
              <section>
                <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                  Materials
                </label>
                {canLog ? (
                  <>
                    <textarea
                      value={materialsValue}
                      onChange={(e) => setMaterialsValue(e.target.value)}
                      rows={3}
                      placeholder="List materials used (e.g. 10mm conduit x4, GPO double 2x…)"
                      className={cn(inputField, 'resize-none')}
                    />
                    {materialsError && (
                      <p className="mt-0.5 text-[11px] text-[#C44545]">{materialsError}</p>
                    )}
                    {materialsValue !== materialsOriginal && (
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void saveMaterials()}
                          disabled={materialsSaving}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
                        >
                          {materialsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {materialsSaving ? 'Saving…' : 'Save materials'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">
                    {job.materials ?? <span className="text-[#A0A0A0]">None recorded.</span>}
                  </p>
                )}
              </section>

              {/* ── Job box (stock allocated → tech accepts at pickup) ── */}
              <JobBoxSection
                jobId={jobId}
                jobKind="service"
                canManage={canManage}
                profiles={profiles}
                defaultAssignee={job.assignedTo ?? null}
                jobTitle={job.title}
                jobAddress={job.address ?? null}
                onChanged={handleSectionChanged}
              />

              {/* ── Notes ────────────────────────────────────────────── */}
              <section>
                <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                  Notes
                </label>
                {canLog ? (
                  <>
                    <textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      rows={3}
                      placeholder="Job notes, access details, follow-up actions…"
                      className={cn(inputField, 'resize-none')}
                    />
                    {notesError && (
                      <p className="mt-0.5 text-[11px] text-[#C44545]">{notesError}</p>
                    )}
                    {notesValue !== notesOriginal && (
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void saveNotes()}
                          disabled={notesSaving}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
                        >
                          {notesSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {notesSaving ? 'Saving…' : 'Save notes'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">
                    {job.notes ?? <span className="text-[#A0A0A0]">None recorded.</span>}
                  </p>
                )}
              </section>

              {/* ── Photos ───────────────────────────────────────────── */}
              <JobPhotosSection
                jobId={jobId}
                photos={photos}
                canManage={canManage}
                currentProfileId={currentProfile?.id ?? null}
                onChanged={handleSectionChanged}
              />

              {/* ── Time entries ─────────────────────────────────────── */}
              {canLog && (
                <TimeEntriesSection
                  jobId={jobId}
                  entries={entries}
                  profiles={profiles}
                  currentUserId={currentProfile?.id ?? null}
                  canLog={canLog}
                  canManage={canManage}
                  onChanged={handleSectionChanged}
                />
              )}

              {/* ── Profit (manager only) ────────────────────────────── */}
              {canManage && (
                <section>
                  <label className="block mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                    Profit
                  </label>
                  <ProfitSummaryCard
                    profit={profit}
                    loading={profitLoading}
                    onSetFinancials={() => setFinModalOpen(true)}
                  />
                </section>
              )}

              {/* ── Sales thread: quote → variations → invoice (manager-sales) ── */}
              {canSell && (originQuote || jobVariations.length > 0 || jobInvoices.length > 0) && (() => {
                const acceptedVars = jobVariations.filter((v) => v.status === 'approved');
                const originValue = originQuote ? originQuote.subtotalExGst - originQuote.discountExGst : 0;
                // No originating quote (job created directly + priced manually):
                // the job's stored contract value is the truth, not $0.
                const contractEx = originQuote
                  ? originValue + acceptedVars.reduce((s, v) => s + v.subtotalExGst, 0)
                  : (job?.contractValue ?? 0);
                // Issued money only — a draft invoice isn't revenue yet.
                const invoicedInc = jobInvoices
                  .filter((i) => i.status === 'sent' || i.status === 'paid' || i.status === 'overdue')
                  .reduce((s, i) => s + i.totalIncGst, 0);
                const varPill: Record<string, string> = {
                  draft: 'bg-[#ECE8DE] text-[#1A1A1A]', priced: 'bg-[#F9EFD9] text-[#9A6B12]',
                  sent: 'bg-[#EEF1F4] text-[#5B6B7B]', approved: 'bg-[#E5F2EA] text-[#246F47]', declined: 'bg-[#FBE5E5] text-[#C44545]',
                };
                const invPill: Record<string, string> = {
                  draft: 'bg-[#ECE8DE] text-[#1A1A1A]', sent: 'bg-[#EEF1F4] text-[#5B6B7B]',
                  paid: 'bg-[#E1F3EA] text-[#2F8F5C]', overdue: 'bg-[#FBE5E5] text-[#C44545]', voided: 'bg-[#ECE8DE] text-[#A0A0A0]',
                };
                // Cost-centre breakdown: origin quote sections (+ its discount, so
                // the rows tie back to the contract figure) + each accepted variation.
                const items = originQuote?.items ?? [];
                const centres: { id: string; label: string; value: number }[] = [];
                if (originQuote) {
                  const general = items.filter((i) => !i.sectionId).reduce((s, i) => s + i.qty * i.unitPriceExGst, 0);
                  if (general > 0) centres.push({ id: 'general', label: originSections.length > 0 ? 'General' : 'Quoted works', value: general });
                  for (const sec of originSections) {
                    const v = items.filter((i) => i.sectionId === sec.id).reduce((s, i) => s + i.qty * i.unitPriceExGst, 0);
                    if (v > 0) centres.push({ id: sec.id, label: sec.name, value: v });
                  }
                  if (originQuote.discountExGst > 0) centres.push({ id: 'discount', label: 'Discount', value: -originQuote.discountExGst });
                }
                for (const v of acceptedVars) centres.push({ id: `var-${v.id}`, label: `Variation — ${v.title}`, value: v.subtotalExGst });
                return (
                  <section>
                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                      Sales thread
                    </label>
                    <div className="overflow-hidden rounded-lg border border-[#E6E1D4] bg-white">
                      <ul className="divide-y divide-[#EFEBE0]">
                        {originQuote && (
                          <li>
                            <button
                              type="button"
                              onClick={() => navigate(`/quotes?quote=${originQuote.id}`)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#FAF8F2]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-medium text-[#3A3A3A]">
                                  {originQuote.number ?? 'Quote'} · {originQuote.title}
                                </span>
                                <span className="text-[11px] uppercase tracking-wide text-[#A0A0A0]">Original quote — this job came from it</span>
                              </span>
                              <span className="shrink-0 tabular-nums text-[13px] text-[#3A3A3A]">${originValue.toFixed(2)}</span>
                            </button>
                          </li>
                        )}
                        {jobVariations.map((v) => (
                          <li key={v.id}>
                            <button
                              type="button"
                              onClick={() => navigate('/sales?tab=variations')}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#FAF8F2]"
                            >
                              <span className="min-w-0 flex items-center gap-2">
                                <span className="truncate text-[13px] text-[#3A3A3A]">Variation · {v.title}</span>
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${varPill[v.status] ?? 'bg-[#EEF1F4] text-[#5B6B7B]'}`}>
                                  {v.status === 'approved' ? 'accepted' : v.status}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums text-[13px] text-[#3A3A3A]">${v.subtotalExGst.toFixed(2)}</span>
                            </button>
                          </li>
                        ))}
                        {jobInvoices.map((inv) => (
                          <li key={inv.id}>
                            <button
                              type="button"
                              onClick={() => navigate('/sales?tab=invoices')}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#FAF8F2]"
                            >
                              <span className="min-w-0 flex items-center gap-2">
                                <span className="truncate text-[13px] text-[#3A3A3A]">Invoice {inv.number ?? '(draft)'}</span>
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${invPill[inv.status] ?? 'bg-[#EEF1F4] text-[#5B6B7B]'}`}>
                                  {inv.status}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums text-[13px] text-[#3A3A3A]">${inv.totalIncGst.toFixed(2)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2">
                        <span className="text-[11px] uppercase tracking-wide text-[#6B6B6B]">
                          Contract (ex GST) <span className="ml-1 font-semibold tabular-nums text-[#3A3A3A]">${contractEx.toFixed(2)}</span>
                        </span>
                        <span className="text-[11px] uppercase tracking-wide text-[#6B6B6B]">
                          Invoiced (inc GST) <span className={`ml-1 font-semibold tabular-nums ${invoicedInc > 0 ? 'text-[#2F8F5C]' : 'text-[#3A3A3A]'}`}>${invoicedInc.toFixed(2)}</span>
                        </span>
                      </div>
                    </div>
                    {centres.length > 0 && (
                      <div className="mt-2 rounded-lg border border-[#E6E1D4] bg-white px-3 py-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A0A0A0]">Cost centres</p>
                        <ul className="space-y-0.5">
                          {centres.map((c) => (
                            <li key={c.id} className="flex items-center justify-between text-[12px] text-[#6B6B6B]">
                              <span className="truncate">{c.label}</span>
                              <span className="ml-2 shrink-0 tabular-nums">${c.value.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                );
              })()}

              {/* ── Quotes (manager-sales only) ──────────────────────── */}
              {canSell && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
                      Quotes
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/sales?tab=variations&newJob=${job.id}`)}
                        className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-1 text-[12px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
                        title="Price extra work as a variation — accepted variations fold into this job as another cost centre"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add variation
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleNewQuote()}
                        disabled={creatingQuote}
                        className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-1 text-[12px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-50"
                      >
                        {creatingQuote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        New quote for this job
                      </button>
                    </div>
                  </div>
                  {quoteError && <p className="mb-2 text-[11px] text-[#C44545]">{quoteError}</p>}
                  {jobQuotes.length === 0 ? (
                    <p className="text-[12px] text-[#A0A0A0]">No quotes for this job yet.</p>
                  ) : (
                    <ul className="divide-y divide-[#EFEBE0] overflow-hidden rounded-lg border border-[#E6E1D4] bg-white">
                      {jobQuotes.map((q) => (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/quotes?quote=${q.id}`)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#FAF8F2]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-[#3A3A3A]">
                                {q.number ?? 'Draft'} · {q.title}
                              </span>
                              <span className="text-[11px] uppercase tracking-wide text-[#A0A0A0]">{q.status}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-[13px] text-[#3A3A3A]">
                              ${q.totalIncGst.toFixed(2)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer — delete */}
        {!loading && !loadError && job && canManage && (
          <footer className="flex flex-shrink-0 items-center justify-between border-t border-[#EFEBE0] px-5 py-3">
            {deleteError && (
              <p className="text-xs text-[#C44545]">{deleteError}</p>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-[#C44545]">Delete this job?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteBusy}
                  className="rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6B6B6B] hover:bg-[#FAF8F2] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleteBusy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#C44545] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#A83838] disabled:opacity-50"
                >
                  {deleteBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {deleteBusy ? 'Deleting…' : 'Confirm delete'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#6B6B6B] hover:bg-[#FBE5E5] hover:text-[#C44545]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete job
              </button>
            )}
          </footer>
        )}
      </div>

      {/* ── Set Financials modal (manager only) ────────────────────────── */}
      {finModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1A1A1A]/50 p-4"
          style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
                  Service Job
                </p>
                <h2
                  className="mt-1 text-xl font-medium text-[#1A1A1A]"
                  style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
                >
                  Set financials
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFinModalOpen(false)}
                disabled={finSaving}
                className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A] disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <p className="text-sm text-[#6B6B6B]">
                Enter the contract value (revenue) and materials cost for this job. Both fields are optional and clearable.
              </p>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Contract value (AUD, ex GST)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={finContract}
                  onChange={(e) => setFinContract(e.target.value)}
                  placeholder="e.g. 1500.00"
                  disabled={finSaving}
                  className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                />
                <p className="mt-0.5 text-[10px] text-[#A0A0A0]">Leave blank to clear.</p>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Materials cost (AUD)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={finMaterials}
                  onChange={(e) => setFinMaterials(e.target.value)}
                  placeholder="e.g. 320.00"
                  disabled={finSaving}
                  className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                />
                <p className="mt-0.5 text-[10px] text-[#A0A0A0]">Leave blank to clear.</p>
              </div>
              {finError && (
                <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
                  {finError}
                </p>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
              <button
                type="button"
                onClick={() => setFinModalOpen(false)}
                disabled={finSaving}
                className="rounded-full border border-[#E6E1D4] bg-white px-4 py-1.5 text-[12px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleFinSave()}
                disabled={finSaving}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
              >
                {finSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                {finSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MotionDrawer>
  );
}
