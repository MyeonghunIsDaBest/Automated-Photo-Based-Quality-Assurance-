// frontend/src/pages/gantt/tabs/sitediary/TimelineEntry.tsx
//
// One row in the day timeline. Mapped from a DiaryEntry via diaryRowMapper.
// Whole row is clickable — opens the diary drawer in edit mode.

import { motion } from 'framer-motion';
import { Check, Clock, AlertTriangle, Camera, Users } from 'lucide-react';
import { WORKER_COLORS } from './mockTimeline';
import { TimelinePhotoThumb } from './TimelinePhotoThumb';
import type { TimelineRow } from './diaryRowMapper';

interface TimelineEntryProps {
  row: TimelineRow;
  /** True when this entry just arrived via realtime — slides in from the
   *  right with an emerald glow that fades as the flag expires. */
  isNew?: boolean;
  onClick: () => void;
}

const STATUS_BADGES = {
  signed:   { bg: 'bg-[#E5F2EA]', fg: 'text-[#246F47]', label: 'Signed',            Icon: Check },
  pending:  { bg: 'bg-[#F9EFD9]', fg: 'text-[#C8841E]', label: 'Awaiting sign-off', Icon: Clock },
  flagged:  { bg: 'bg-[#FBE5E5]', fg: 'text-[#C44545]', label: 'Punch item added',  Icon: AlertTriangle },
};

const DOT_RING = {
  signed:  'bg-[#2F8F5C] shadow-[0_0_0_3px_white,0_0_0_4px_#E5F2EA]',
  pending: 'bg-[#C8841E] shadow-[0_0_0_3px_white,0_0_0_4px_#F9EFD9]',
  flagged: 'bg-[#C44545] shadow-[0_0_0_3px_white,0_0_0_4px_#FBE5E5]',
};

export function TimelineEntry({ row, isNew, onClick }: TimelineEntryProps) {
  const badge = STATUS_BADGES[row.status];
  const BadgeIcon = badge.Icon;
  const dot = DOT_RING[row.status];
  const photoIds = row.photoIds.slice(0, 3);
  const overflow = row.photoIds.length - photoIds.length;

  return (
    <motion.article
      role="button"
      tabIndex={0}
      // Only post-mount realtime arrivals animate; entries present at initial
      // render mount statically (initial={false}). MotionConfig at the app root
      // turns this into a no-op under prefers-reduced-motion.
      initial={isNew ? { opacity: 0, x: 24 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`grid grid-cols-[88px_1fr] px-6 py-5 border-b border-[#EFEBE0] last:border-b-0 relative cursor-pointer hover:bg-[#FAF8F2] focus:bg-[#FAF8F2] focus:outline-none transition-shadow duration-[1500ms] ${isNew ? 'shadow-[inset_3px_0_0_#2F8F5C,0_0_0_1px_#2F8F5C55]' : ''}`}
    >
      {/* Time column */}
      <div className="relative text-[#6B6B6B] text-xs font-medium pt-0.5">
        <span className="block text-[#1A1A1A] font-medium mb-0.5" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 16 }}>
          {row.startTime}
        </span>
        <span>→ {row.endTime}</span>
        <span className={`absolute top-2 right-[18px] w-[9px] h-[9px] rounded-full ${dot}`} />
      </div>

      {/* Vertical line through the timeline column (CSS) */}
      <span className="absolute left-[110px] top-0 bottom-0 w-px bg-[#EFEBE0]" />

      {/* Body */}
      <div className="pl-5">
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <div
            className="w-8 h-8 rounded-full grid place-items-center text-white font-semibold text-[11px]"
            style={{ background: WORKER_COLORS[row.workerColorIndex] }}
          >
            {row.workerInitials}
          </div>
          <div>
            <div className="font-semibold text-[14.5px] text-[#1A1A1A]">{row.workerName}</div>
            {row.workerRole ? (
              <div className="text-[#6B6B6B] text-[13px]">{row.workerRole}</div>
            ) : null}
          </div>
          <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.bg} ${badge.fg}`}>
            <BadgeIcon className="h-2.5 w-2.5" />
            {badge.label}
          </span>
        </div>

        {row.description ? (
          <p className="text-[#3A3A3A] text-[13.5px] leading-[1.55] mt-1 mb-3 whitespace-pre-wrap">
            {row.description}
          </p>
        ) : (
          <p className="text-[#A0A0A0] text-[13px] italic mt-1 mb-3">No description — click to edit.</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-white border border-[#E6E1D4] text-[11.5px] font-medium text-[#3A3A3A]">
            <strong className="text-[#1A1A1A]">{row.hours}h</strong>
          </span>
          {row.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[#FAF8F2] border border-[#E6E1D4] text-[11.5px] font-medium text-[#3A3A3A]">
              {t}
            </span>
          ))}
          {row.extraPersonnelCount > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[#FAF8F2] border border-[#E6E1D4] text-[11.5px] font-medium text-[#3A3A3A]">
              <Users className="h-2.5 w-2.5" />
              +{row.extraPersonnelCount} more
            </span>
          ) : null}
          {row.photoIds.length > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[7px] bg-[#1A1A1A] border border-[#1A1A1A] text-[11.5px] font-medium text-white">
              <Camera className="h-2.5 w-2.5" />
              {row.photoIds.length} {row.photoIds.length === 1 ? 'photo' : 'photos'}
            </span>
          ) : null}
        </div>

        {photoIds.length > 0 ? (
          <div className="flex gap-1.5 mt-2.5">
            {photoIds.map((id) => (
              <TimelinePhotoThumb key={id} photoId={id} />
            ))}
            {overflow > 0 ? (
              <div className="w-[54px] h-[54px] rounded-[7px] grid place-items-center bg-[#FAF8F2] text-[#6B6B6B] text-xs font-semibold border border-[#E6E1D4]">
                +{overflow}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}
