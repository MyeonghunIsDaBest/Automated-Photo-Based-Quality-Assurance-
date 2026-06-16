// MyRequests — read-only request list + expandable detail for the customer portal.
//
// NO edit affordances: customers can SELECT only, never update.
// Status labels are customer-friendly (no internal jargon).
// Photos are loaded on expand (lazy) to avoid hammering storage on page load.

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ImageIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { listRequestPhotos } from '../../lib/api/maintenanceRequests';
import type { MaintenanceRequestWithContext, MaintenanceRequestStatus } from '../../lib/api/maintenanceRequests';
import { FRAUNCES, cardShell, TONE, type ToneKey } from '../gantt/components/ledger';

// ─── Status labels — customer-friendly copy ──────────────────────────────────

function statusLabel(status: MaintenanceRequestStatus, scheduledFor: string | null): string {
  switch (status) {
    case 'new':
    case 'acknowledged':
      return 'Received';
    case 'scheduled':
      return scheduledFor
        ? `Scheduled for ${format(new Date(scheduledFor), 'MMM d')}`
        : 'Scheduled';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
  }
}

const STATUS_TONE: Record<MaintenanceRequestStatus, ToneKey> = {
  new: 'amber',
  acknowledged: 'slate',
  scheduled: 'amber',
  completed: 'sage',
  cancelled: 'red',
};

// ─── Urgency display ─────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<number, string> = {
  5: 'Emergency',
  4: 'Urgent',
  3: 'Standard',
  2: 'Low',
  1: 'Fill-in job',
};

function urgencyTone(u: number): ToneKey {
  if (u >= 4) return 'red';
  if (u === 3) return 'amber';
  return 'slate';
}

// ─── Single request row with expandable detail ───────────────────────────────

function RequestRow({ request }: { request: MaintenanceRequestWithContext }) {
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<{ url: string | null }[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);

  const loadPhotos = useCallback(async () => {
    if (photosLoaded) return;
    try {
      const result = await listRequestPhotos(request.id);
      setPhotos(result);
    } catch {
      // Non-fatal: photo load failure just shows empty
    }
    setPhotosLoaded(true);
  }, [request.id, photosLoaded]);

  useEffect(() => {
    if (expanded && !photosLoaded) {
      void loadPhotos();
    }
  }, [expanded, loadPhotos, photosLoaded]);

  const tone = STATUS_TONE[request.status];
  const toneColors = TONE[tone];
  const uTone = urgencyTone(request.urgency);
  const uColors = TONE[uTone];

  return (
    <li className="divide-y divide-[#EFEBE0]">
      {/* Summary row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[#FAF8F2] active:bg-[#F0EDE4]"
        aria-expanded={expanded}
      >
        {/* Status dot */}
        <span
          aria-hidden
          className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ background: toneColors.dot }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-[#1A1A1A]">{request.title}</p>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: toneColors.bg, color: toneColors.fg }}
            >
              {statusLabel(request.status, request.scheduledFor)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#6B6B6B]">
            {request.propertyName && <span>{request.propertyName}</span>}
            <span className="text-[#C8C5BC]">·</span>
            <span>Reported {format(new Date(request.createdAt), 'MMM d, yyyy')}</span>
            <span className="text-[#C8C5BC]">·</span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: uColors.bg, color: uColors.fg }}
            >
              {URGENCY_LABEL[request.urgency] ?? `Urgency ${request.urgency}`}
            </span>
          </div>
        </div>

        <span className="mt-1 flex-shrink-0 text-[#A0A0A0]">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* Expanded detail — read-only */}
      {expanded && (
        <div className="bg-[#FAFAF8] px-5 py-4">
          {/* Description */}
          {request.description ? (
            <div className="mb-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                Description
              </p>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#3A3A3A]">
                {request.description}
              </p>
            </div>
          ) : null}

          {/* Scheduled date detail (if any) */}
          {request.status === 'scheduled' && request.scheduledFor && (
            <div className="mb-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                Scheduled date
              </p>
              <p className="text-[14px] text-[#3A3A3A]">
                {format(new Date(request.scheduledFor), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          )}

          {/* Completed date */}
          {request.status === 'completed' && request.completedAt && (
            <div className="mb-4">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                Completed on
              </p>
              <p className="text-[14px] text-[#3A3A3A]">
                {format(new Date(request.completedAt), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          )}

          {/* Photos */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
              Photos
            </p>
            {!photosLoaded ? (
              <p className="text-[13px] text-[#A0A0A0]">Loading photos…</p>
            ) : photos.length === 0 ? (
              <div className="flex items-center gap-2 text-[13px] text-[#A0A0A0]">
                <ImageIcon className="h-4 w-4" />
                No photos attached.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, idx) =>
                  photo.url ? (
                    <a
                      key={idx}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-24 w-24 overflow-hidden rounded-[10px] border border-[#E6E1D4] transition-opacity hover:opacity-90"
                    >
                      <img
                        src={photo.url}
                        alt={`Photo ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ─── MyRequests — exported list component ────────────────────────────────────

interface MyRequestsProps {
  requests: MaintenanceRequestWithContext[];
  title: string;
  emptyMessage: string;
  emptyIcon: LucideIcon;
  collapsible?: boolean;
}

export default function MyRequests({
  requests,
  title,
  emptyMessage,
  emptyIcon: EmptyIcon,
  collapsible = false,
}: MyRequestsProps) {
  const [open, setOpen] = useState(!collapsible);

  if (requests.length === 0 && !emptyMessage) return null;

  return (
    <section className={`mb-4 overflow-hidden ${cardShell}`}>
      {/* Section header — clickable when collapsible */}
      <div
        className={`flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3 ${
          collapsible ? 'cursor-pointer hover:bg-[#FAF8F2] active:bg-[#F0EDE4]' : ''
        }`}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              }
            : undefined
        }
        aria-expanded={collapsible ? open : undefined}
      >
        <div>
          <h2
            className="text-[16px] font-medium text-[#1A1A1A]"
            style={{ fontFamily: FRAUNCES }}
          >
            {title}
          </h2>
          {collapsible && (
            <p className="text-[12px] text-[#6B6B6B]">{requests.length} request{requests.length === 1 ? '' : 's'}</p>
          )}
        </div>
        {collapsible && (
          <span className="text-[#A0A0A0]">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        )}
      </div>

      {open && (
        <>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <EmptyIcon className="mb-3 h-8 w-8 text-[#C8C5BC]" strokeWidth={1.5} />
              <p className="text-[13px] text-[#6B6B6B]">{emptyMessage}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EFEBE0]">
              {requests.map((req) => (
                <RequestRow key={req.id} request={req} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
