// frontend/src/pages/gantt/tabs/sitediary/TimelineEntry.tsx
//
// One worker entry inside the timeline. Renders the time column on the
// left, then the body: avatar + name/role + status tag + description with
// highlight spans + tag chips + optional photo thumbs.

import { Check, Clock, AlertTriangle, Camera } from 'lucide-react';
import type { MockTimelineEntry } from './mockTimeline';
import { WORKER_COLORS } from './mockTimeline';

interface TimelineEntryProps {
  entry: MockTimelineEntry;
}

const STATUS_BADGES = {
  signed:   { bg: 'bg-[#E5F2EA]', fg: 'text-[#246F47]', label: 'Signed',              Icon: Check },
  pending:  { bg: 'bg-[#F9EFD9]', fg: 'text-[#C8841E]', label: 'Awaiting sign-off',   Icon: Clock },
  flagged:  { bg: 'bg-[#FBE5E5]', fg: 'text-[#C44545]', label: 'Punch item added',    Icon: AlertTriangle },
};

const DOT_RING = {
  signed:  'bg-[#2F8F5C] shadow-[0_0_0_3px_white,0_0_0_4px_#E5F2EA]',
  pending: 'bg-[#C8841E] shadow-[0_0_0_3px_white,0_0_0_4px_#F9EFD9]',
  flagged: 'bg-[#C44545] shadow-[0_0_0_3px_white,0_0_0_4px_#FBE5E5]',
};

function renderDescription(text: string) {
  // Replace {{hl}}...{{/hl}} with highlighted spans.
  const parts = text.split(/(\{\{hl\}\}.*?\{\{\/hl\}\})/g);
  return parts.map((p, i) => {
    const m = p.match(/^\{\{hl\}\}(.*?)\{\{\/hl\}\}$/);
    if (m) {
      return <span key={i} className="bg-[#FFF4CC] px-1 rounded-[3px]">{m[1]}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

export function TimelineEntry({ entry }: TimelineEntryProps) {
  const badge = STATUS_BADGES[entry.status];
  const BadgeIcon = badge.Icon;
  const dot = DOT_RING[entry.status];

  return (
    <article className="grid grid-cols-[88px_1fr] px-6 py-5 border-b border-[#EFEBE0] last:border-b-0 relative">
      {/* Time column */}
      <div className="relative text-[#6B6B6B] text-xs font-medium pt-0.5">
        <span className="block text-[#1A1A1A] font-medium mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 16 }}>
          {entry.timeStart}
        </span>
        <span>→ {entry.timeEnd}</span>
        <span className={`absolute top-2 right-[18px] w-[9px] h-[9px] rounded-full ${dot}`} />
      </div>

      {/* Vertical line through the timeline column (CSS) */}
      <span className="absolute left-[110px] top-0 bottom-0 w-px bg-[#EFEBE0]" />

      {/* Body */}
      <div className="pl-5">
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white font-semibold text-[11px]"
            style={{ background: WORKER_COLORS[entry.workerColorIndex] }}
          >
            {entry.workerInitials}
          </div>
          <div>
            <div className="font-semibold text-[14.5px] text-[#1A1A1A]">{entry.workerName}</div>
            <div className="text-[#6B6B6B] text-[13px]">{entry.workerRole}</div>
          </div>
          <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.bg} ${badge.fg}`}>
            <BadgeIcon className="h-2.5 w-2.5" />
            {badge.label}
          </span>
        </div>

        <p className="text-[#3A3A3A] text-[13.5px] leading-[1.55] mt-1 mb-3">
          {renderDescription(entry.description)}
        </p>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-white border border-[#E6E1D4] text-[11.5px] font-medium text-[#3A3A3A]">
            <strong className="text-[#1A1A1A]">{entry.hours}h</strong>
          </span>
          {entry.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[#FAF8F2] border border-[#E6E1D4] text-[11.5px] font-medium text-[#3A3A3A]">
              {t}
            </span>
          ))}
          {entry.punchItemsCount ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[#FBE5E5] border border-[#F0C8C8] text-[11.5px] font-medium text-[#C44545]">
              {entry.punchItemsCount} punch items
            </span>
          ) : null}
          {entry.photos ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[#1A1A1A] border border-[#1A1A1A] text-[11.5px] font-medium text-white">
              <Camera className="h-2.5 w-2.5" />
              {entry.photos} photos
            </span>
          ) : null}
        </div>

        {entry.photoColorSeeds && entry.photoColorSeeds.length > 0 ? (
          <div className="flex gap-1.5 mt-2.5">
            {entry.photoColorSeeds.map((seed, idx) => (
              <div
                key={idx}
                className="w-[54px] h-[54px] rounded-[7px] border border-[#E6E1D4]"
                style={{ background: `linear-gradient(135deg, ${seed})` }}
              />
            ))}
            {(entry.photos ?? 0) > (entry.photoColorSeeds?.length ?? 0) ? (
              <div className="w-[54px] h-[54px] rounded-[7px] grid place-items-center bg-[#FAF8F2] text-[#6B6B6B] text-xs font-semibold border border-[#E6E1D4]">
                +{(entry.photos ?? 0) - (entry.photoColorSeeds?.length ?? 0)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
