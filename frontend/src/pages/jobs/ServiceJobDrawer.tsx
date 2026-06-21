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
import { useAppStore } from '../../store';
import {
  canManageServiceJobs,
  canLogServiceJobWork,
  canManageSales,
} from '../../lib/permissions';
import { listQuotes, createQuote, type Quote } from '../../lib/api/commercial';
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
      navigate(`/jobs?view=quotes&quote=${q.id}`);
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
      onClose={onClose}
      ariaLabel="Service job detail"
      sizeClass="sm:w-[540px] lg:w-[620px]"
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
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
              <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-3 flex-shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          )}

          {/* Error */}
          {!loading && loadError && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-4">
              <p className="text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-xs font-medium text-red-700 underline"
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
                  <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Client Details
                  </label>
                  {canManage && !editingDetails && (
                    <button
                      type="button"
                      onClick={openDetails}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>

                {editingDetails ? (
                  <div className="space-y-2 rounded-[10px] border border-slate-200 bg-slate-50 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-0.5 text-[10px] font-medium text-slate-500">
                          Client name
                        </label>
                        <input
                          type="text"
                          value={draftClientName}
                          onChange={(e) => setDraftClientName(e.target.value)}
                          placeholder="Client name"
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block mb-0.5 text-[10px] font-medium text-slate-500">
                          Phone
                        </label>
                        <input
                          type="tel"
                          value={draftClientPhone}
                          onChange={(e) => setDraftClientPhone(e.target.value)}
                          placeholder="04xx xxx xxx"
                          className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-0.5 text-[10px] font-medium text-slate-500">
                        Address
                      </label>
                      <input
                        type="text"
                        value={draftAddress}
                        onChange={(e) => setDraftAddress(e.target.value)}
                        placeholder="Site address"
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block mb-0.5 text-[10px] font-medium text-slate-500">
                        Description
                      </label>
                      <textarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        rows={3}
                        placeholder="What needs to be done…"
                        className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs resize-none"
                      />
                    </div>
                    {detailError && (
                      <p className="text-[11px] text-red-600">{detailError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingDetails(false)}
                        disabled={detailSaving}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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
                  <div className="space-y-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2.5">
                    {job.clientName && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          Name
                        </span>
                        <p className="text-sm font-medium text-slate-900">{job.clientName}</p>
                      </div>
                    )}
                    {job.clientPhone && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          Phone
                        </span>
                        <p className="text-sm text-slate-900">
                          <a href={`tel:${job.clientPhone}`} className="hover:underline">
                            {job.clientPhone}
                          </a>
                        </p>
                      </div>
                    )}
                    {job.address && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          Address
                        </span>
                        <p className="text-sm text-slate-900">{job.address}</p>
                      </div>
                    )}
                    {job.description && (
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                          Description
                        </span>
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">{job.description}</p>
                      </div>
                    )}
                    {!job.clientName && !job.clientPhone && !job.address && !job.description && (
                      <p className="text-[11px] text-slate-400">No details recorded.{canManage ? ' Click Edit to add.' : ''}</p>
                    )}
                  </div>
                )}
              </section>

              {/* ── Status buttons ──────────────────────────────────────── */}
              {canLog && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
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
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                            statusBusy ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  {statusError && (
                    <p className="mt-1 text-[11px] text-red-600">{statusError}</p>
                  )}
                </section>
              )}

              {/* ── Schedule date (manager only) ─────────────────────── */}
              {canManage && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Scheduled Date
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={scheduleDateInput}
                      onChange={(e) => setScheduleDateInput(e.target.value)}
                      className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
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
                    <p className="mt-1 text-[11px] text-red-600">{scheduleError}</p>
                  )}
                </section>
              )}

              {/* ── Assignee (manager only) ──────────────────────────── */}
              {canManage && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Assigned To
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={job.assignedTo ?? ''}
                      onChange={(e) => void handleAssigneeChange(e.target.value)}
                      disabled={assigneeSaving}
                      className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm bg-white disabled:opacity-60"
                    >
                      <option value="">Unassigned</option>
                      {internalProfiles.map((p) => {
                        const name = `${p.firstName} ${p.lastName}`.trim() || p.email;
                        return (
                          <option key={p.id} value={p.id}>{name}</option>
                        );
                      })}
                    </select>
                    {assigneeSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                  </div>
                  {assigneeError && (
                    <p className="mt-1 text-[11px] text-red-600">{assigneeError}</p>
                  )}
                </section>
              )}

              {/* Read-only assignee display for workers */}
              {!canManage && (
                <section>
                  <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Assigned To
                  </label>
                  <p className="text-sm text-slate-900">
                    {assignedName ?? <span className="text-slate-400">Unassigned</span>}
                  </p>
                </section>
              )}

              {/* ── Materials ────────────────────────────────────────── */}
              <section>
                <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Materials
                </label>
                {canLog ? (
                  <>
                    <textarea
                      value={materialsValue}
                      onChange={(e) => setMaterialsValue(e.target.value)}
                      rows={3}
                      placeholder="List materials used (e.g. 10mm conduit x4, GPO double 2x…)"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none resize-none"
                    />
                    {materialsError && (
                      <p className="mt-0.5 text-[11px] text-red-600">{materialsError}</p>
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
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">
                    {job.materials ?? <span className="text-slate-400">None recorded.</span>}
                  </p>
                )}
              </section>

              {/* ── Notes ────────────────────────────────────────────── */}
              <section>
                <label className="block mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Notes
                </label>
                {canLog ? (
                  <>
                    <textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      rows={3}
                      placeholder="Job notes, access details, follow-up actions…"
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none resize-none"
                    />
                    {notesError && (
                      <p className="mt-0.5 text-[11px] text-red-600">{notesError}</p>
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
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">
                    {job.notes ?? <span className="text-slate-400">None recorded.</span>}
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
                  <label className="block mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Profit
                  </label>
                  <ProfitSummaryCard
                    profit={profit}
                    loading={profitLoading}
                    onSetFinancials={() => setFinModalOpen(true)}
                  />
                </section>
              )}

              {/* ── Quotes (manager-sales only) ──────────────────────── */}
              {canSell && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Quotes
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleNewQuote()}
                      disabled={creatingQuote}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {creatingQuote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      New quote for this job
                    </button>
                  </div>
                  {quoteError && <p className="mb-2 text-[11px] text-red-600">{quoteError}</p>}
                  {jobQuotes.length === 0 ? (
                    <p className="text-[12px] text-slate-400">No quotes for this job yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {jobQuotes.map((q) => (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/jobs?view=quotes&quote=${q.id}`)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium text-slate-800">
                                {q.number ?? 'Draft'} · {q.title}
                              </span>
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">{q.status}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-[13px] text-slate-700">
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
          <footer className="flex flex-shrink-0 items-center justify-between border-t border-slate-100 px-5 py-3">
            {deleteError && (
              <p className="text-xs text-red-600">{deleteError}</p>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-red-600">Delete this job?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteBusy}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleteBusy}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
                className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
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
