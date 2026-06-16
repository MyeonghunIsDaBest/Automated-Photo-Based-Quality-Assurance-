// RequestDetail — full view of a single maintenance request.
// Includes: metadata, photos, status transitions, assignee picker, scheduling.

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Wrench,
  Calendar,
  ImageIcon,
  User,
  ExternalLink,
} from 'lucide-react';
import { Skeleton, SkeletonLine } from '../../components/ui/skeleton';
import { Toaster } from '../../components/ui/Toaster';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  getRequest,
  updateRequestStatus,
  assignRequest,
  scheduleRequest,
  completeRequest,
  listRequestPhotos,
  type MaintenanceRequestWithContext,
  type MaintenanceRequestStatus,
} from '../../lib/api/maintenanceRequests';
import { listProfiles } from '../../lib/api/profiles';
import type { Profile } from '../../types';
import {
  FRAUNCES, cardShell, LedgerHeader, StatusPill, TONE,
} from '../gantt/components/ledger';

// ─── helpers ─────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  portal: 'Customer portal',
  internal: 'Internal',
  email: 'Email',
};

const STATUS_TONE: Record<MaintenanceRequestStatus, keyof typeof TONE> = {
  new: 'amber',
  acknowledged: 'slate',
  scheduled: 'amber',
  completed: 'sage',
  cancelled: 'red',
};

function urgencyTone(u: number) {
  if (u >= 4) return TONE.red;
  if (u === 3) return TONE.amber;
  return TONE.slate;
}

function UrgencyPill({ urgency }: { urgency: number }) {
  const tone = urgencyTone(urgency);
  const labels: Record<number, string> = { 1: 'Low', 2: 'Low-Med', 3: 'Medium', 4: 'High', 5: 'Critical' };
  return (
    <span
      style={{ color: tone.fg, background: tone.bg }}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
      {labels[urgency] ?? `U${urgency}`}
    </span>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="border-b border-[#EFEBE0] px-5 py-3">
      <h2 className="text-[16px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
        {title}
      </h2>
      {sub && <p className="text-[12px] text-[#6B6B6B]">{sub}</p>}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 flex-shrink-0 text-[12px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]">
        {label}
      </dt>
      <dd className="text-[13px] text-[#1A1A1A]">{value}</dd>
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

interface RequestDetailProps {
  requestId: string;
  onBack: () => void;
}

export default function RequestDetail({ requestId, onBack }: RequestDetailProps) {
  const [request, setRequest] = useState<MaintenanceRequestWithContext | null>(null);
  const [photos, setPhotos] = useState<Array<{ id: string; url: string | null; storagePath: string }>>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ message, type });

  const loadRequest = () =>
    getRequest(requestId)
      .then((r) => {
        setRequest(r);
        if (r?.scheduledFor) setScheduleDate(r.scheduledFor.slice(0, 10));
      })
      .catch((err) =>
        showToast(err instanceof Error ? err.message : 'Failed to refresh request.', 'error'),
      );

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getRequest(requestId),
      listRequestPhotos(requestId),
      listProfiles(),
    ])
      .then(([r, ph, profs]) => {
        setRequest(r);
        setPhotos(ph);
        // Only show internal active profiles as assignee candidates
        setProfiles(
          profs.filter(
            (p) =>
              p.isActive &&
              p.securityGroup !== 'customer' &&
              p.securityGroup !== 'stakeholder' &&
              p.securityGroup !== 'supplier',
          ),
        );
        if (r?.scheduledFor) setScheduleDate(r.scheduledFor.slice(0, 10));
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load request.'),
      )
      .finally(() => setLoading(false));
  }, [requestId]);

  const withAction = async (fn: () => Promise<void>) => {
    setActionBusy(true);
    try {
      await fn();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed.', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleStatusChange = (status: MaintenanceRequestStatus) =>
    withAction(async () => {
      const updated = await updateRequestStatus(requestId, status);
      setRequest((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast(`Status updated to ${status}.`, 'success');
      void loadRequest();
    });

  const handleAssign = (profileId: string) =>
    withAction(async () => {
      const updated = await assignRequest(requestId, profileId || null);
      setRequest((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast('Assignee updated.', 'success');
      void loadRequest();
    });

  const handleSchedule = () => {
    if (!scheduleDate) return showToast('Please pick a date first.', 'error');
    withAction(async () => {
      const updated = await scheduleRequest(requestId, scheduleDate);
      setRequest((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast(`Scheduled for ${scheduleDate}.`, 'success');
      void loadRequest();
    });
  };

  const handleComplete = () =>
    withAction(async () => {
      const updated = await completeRequest(requestId);
      setRequest((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast('Request marked complete.', 'success');
      void loadRequest();
    });

  if (loadError) {
    return (
      <div
        className="min-h-full bg-[#FAF8F2]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">
          <div className={`${cardShell} flex flex-col items-center gap-3 px-6 py-16 text-center`}>
            <p className="text-[14px] text-[#C44545]">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                Promise.all([getRequest(requestId), listRequestPhotos(requestId), listProfiles()])
                  .then(([r, ph, profs]) => {
                    setRequest(r);
                    setPhotos(ph);
                    setProfiles(
                      profs.filter(
                        (p) =>
                          p.isActive &&
                          p.securityGroup !== 'customer' &&
                          p.securityGroup !== 'stakeholder' &&
                          p.securityGroup !== 'supplier',
                      ),
                    );
                    if (r?.scheduledFor) setScheduleDate(r.scheduledFor.slice(0, 10));
                  })
                  .catch((err) =>
                    setLoadError(err instanceof Error ? err.message : 'Failed to load request.'),
                  )
                  .finally(() => setLoading(false));
              }}
              className="rounded-md border border-[#E6E1D4] bg-white px-4 py-2 text-[13px] font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !request) {
    return (
      <div
        className="min-h-full bg-[#FAF8F2]"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">
          {/* Title / meta lines */}
          <div className={`mb-4 overflow-hidden ${cardShell} px-6 py-5`}>
            <SkeletonLine className="mb-2 w-20" />
            <Skeleton className="h-7 w-64" />
            <div className="mt-3 flex items-center gap-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <SkeletonLine className="w-32" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            {/* Left: detail lines + photo strip */}
            <div className="space-y-4">
              <div className={`overflow-hidden ${cardShell}`}>
                <div className="border-b border-[#EFEBE0] px-5 py-3">
                  <SkeletonLine className="w-32" />
                </div>
                <div className="space-y-3 px-5 py-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex gap-3">
                      <SkeletonLine className="w-24 shrink-0" />
                      <SkeletonLine className="flex-1" />
                    </div>
                  ))}
                </div>
              </div>
              {/* Photo strip */}
              <div className={`overflow-hidden ${cardShell}`}>
                <div className="border-b border-[#EFEBE0] px-5 py-3">
                  <SkeletonLine className="w-16" />
                </div>
                <div className="flex gap-3 p-4">
                  <Skeleton className="h-20 w-20 rounded-[10px]" />
                  <Skeleton className="h-20 w-20 rounded-[10px]" />
                </div>
              </div>
            </div>
            {/* Right: actions card */}
            <div className={`overflow-hidden ${cardShell} px-4 py-4`}>
              <SkeletonLine className="mb-4 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="mt-3 h-9 w-full rounded-md" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusTone = STATUS_TONE[request.status] ?? 'slate';
  const assigneeName = profiles.find((p) => p.id === request.assignedTo)
    ? `${profiles.find((p) => p.id === request.assignedTo)!.firstName} ${profiles.find((p) => p.id === request.assignedTo)!.lastName}`
    : request.assignedTo
    ? request.assignedTo
    : '—';

  return (
    <div
      className="min-h-full bg-[#FAF8F2]"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">

        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-[#6B6B6B] hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="h-4 w-4" />
          {request.customerName ? `Back to ${request.customerName}` : 'Back'}
        </button>

        <LedgerHeader
          kicker="MNT"
          icon={Wrench}
          eyebrow={`Maintenance · ${request.customerName ?? 'Request'}`}
          title={request.title}
          meta={
            <>
              <StatusPill tone={statusTone} className="capitalize">
                {request.status}
              </StatusPill>
              <span className="mx-2 text-[#A0A0A0]">·</span>
              <UrgencyPill urgency={request.urgency} />
              <span className="mx-2 text-[#A0A0A0]">·</span>
              {request.propertyName ?? 'Unknown property'}
            </>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">

          {/* Left column */}
          <div className="space-y-4">

            {/* Metadata */}
            <section className={`overflow-hidden ${cardShell}`}>
              <SectionHeader title="Request details" />
              <dl className="space-y-3 px-5 py-4">
                <MetaRow label="Customer" value={request.customerName ?? '—'} />
                <MetaRow label="Property" value={request.propertyName ?? '—'} />
                <MetaRow
                  label="Source"
                  value={
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] px-2 py-0.5 text-[11px] font-semibold text-[#3A3A3A]">
                      {SOURCE_LABEL[request.source] ?? request.source}
                    </span>
                  }
                />
                <MetaRow label="Urgency" value={<UrgencyPill urgency={request.urgency} />} />
                <MetaRow
                  label="Status"
                  value={
                    <StatusPill tone={statusTone} className="capitalize">
                      {request.status}
                    </StatusPill>
                  }
                />
                <MetaRow
                  label="Reported by"
                  value={request.reportedBy ?? '—'}
                />
                <MetaRow
                  label="Created"
                  value={new Date(request.createdAt).toLocaleDateString('en-AU', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                />
                {request.completedAt && (
                  <MetaRow
                    label="Completed"
                    value={new Date(request.completedAt).toLocaleDateString('en-AU', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  />
                )}
              </dl>
              {request.description && (
                <div className="border-t border-[#EFEBE0] px-5 py-4">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[#6B6B6B]">
                    Description
                  </p>
                  <p className="text-[13px] leading-relaxed text-[#3A3A3A]">
                    {request.description}
                  </p>
                </div>
              )}
            </section>

            {/* Photos */}
            <section className={`overflow-hidden ${cardShell}`}>
              <SectionHeader
                title="Photos"
                sub={photos.length === 0 ? 'No photos attached' : `${photos.length} photo(s)`}
              />
              {photos.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                  <ImageIcon className="h-8 w-8 text-[#A0A0A0]" strokeWidth={1.5} />
                  <p className="text-[13px] text-[#6B6B6B]">No photos attached to this request.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
                  {photos.map((ph) =>
                    ph.url ? (
                      <a
                        key={ph.id}
                        href={ph.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2]"
                        title="Open full size"
                      >
                        <img
                          src={ph.url}
                          alt="Request photo"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-[#1A1A1A]/60 p-1 opacity-0 group-hover:opacity-100">
                          <ExternalLink className="h-3 w-3 text-white" />
                        </span>
                      </a>
                    ) : (
                      <div
                        key={ph.id}
                        className="aspect-square overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-[#F0EDE4]"
                      />
                    ),
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Right column — controls */}
          <div className="space-y-4">

            {/* Status transitions */}
            <section className={`overflow-hidden ${cardShell}`}>
              <SectionHeader title="Actions" />
              <div className="space-y-2 px-4 py-4">
                {request.status === 'new' && (
                  <Button
                    className="w-full"
                    onClick={() => handleStatusChange('acknowledged')}
                    disabled={actionBusy}
                  >
                    Acknowledge
                  </Button>
                )}
                {(request.status === 'new' || request.status === 'acknowledged') && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                      Schedule for date
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        disabled={actionBusy}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        onClick={handleSchedule}
                        disabled={actionBusy || !scheduleDate}
                        variant="outline"
                      >
                        <Calendar className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                {request.status === 'scheduled' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                        Reschedule
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          disabled={actionBusy}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          onClick={handleSchedule}
                          disabled={actionBusy || !scheduleDate}
                          variant="outline"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleComplete}
                      disabled={actionBusy}
                    >
                      Mark complete
                    </Button>
                  </>
                )}
                {request.status === 'completed' && (
                  <p className="text-center text-[13px] text-[#2F8F5C]">
                    This request is complete.
                  </p>
                )}
                {request.status !== 'cancelled' && request.status !== 'completed' && (
                  <Button
                    variant="outline"
                    className="w-full border-[#F0BFBF] text-[#C44545] hover:bg-[#FBE5E5]"
                    onClick={() => handleStatusChange('cancelled')}
                    disabled={actionBusy}
                  >
                    Cancel request
                  </Button>
                )}
                {request.status === 'cancelled' && (
                  <p className="text-center text-[13px] text-[#C44545]">
                    This request has been cancelled.
                  </p>
                )}
              </div>
            </section>

            {/* Assignee */}
            <section className={`overflow-hidden ${cardShell}`}>
              <SectionHeader title="Assignee" />
              <div className="px-4 py-4">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                  Assigned to
                </label>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 flex-shrink-0 text-[#A0A0A0]" />
                  <select
                    value={request.assignedTo ?? ''}
                    onChange={(e) => handleAssign(e.target.value)}
                    disabled={actionBusy}
                    className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm text-[#1A1A1A] shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                  >
                    <option value="">— Unassigned —</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                {request.assignedTo && (
                  <p className="mt-1 text-[12px] text-[#6B6B6B]">
                    Currently: {assigneeName}
                  </p>
                )}
              </div>
            </section>

            {/* Scheduled date display */}
            {request.scheduledFor && (
              <section className={`overflow-hidden ${cardShell}`}>
                <SectionHeader title="Scheduled" />
                <div className="flex items-center gap-2 px-4 py-4">
                  <Calendar className="h-4 w-4 text-[#2F8F5C]" />
                  <p className="text-[14px] font-medium text-[#1A1A1A]">
                    {new Date(request.scheduledFor).toLocaleDateString('en-AU', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
