// frontend/src/pages/gantt/tabs/assistant/DraftCard.tsx
//
// Inline draft card inside the chat thread. Shows the polished paragraph
// Sparky produced + Apply/Discard buttons. Apply mechanics are wired in
// task 11.

import { Check, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface DraftCardProps {
  draft: string;
  targetDate: string;
  onApply: () => void;
  onDiscard: () => void;
  applied?: boolean;
  discarded?: boolean;
}

export function DraftCard({ draft, targetDate, onApply, onDiscard, applied, discarded }: DraftCardProps) {
  const dim = applied || discarded;
  return (
    <div className={`my-2 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-sm ${dim ? 'opacity-60' : ''}`}>
      <div className="border-b border-emerald-100 bg-white/60 px-4 py-2">
        <p
          className="text-[11px] font-medium uppercase tracking-[0.15em] text-emerald-700"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          Draft for {format(parseISO(targetDate), 'MMM d')}
        </p>
      </div>
      <div className="px-4 py-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {draft}
        </p>
      </div>
      {!dim && (
        <div className="flex items-center justify-end gap-2 border-t border-emerald-100 bg-white/60 px-4 py-2">
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <X className="h-3 w-3" />
            Discard
          </button>
          <button
            type="button"
            onClick={onApply}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <Check className="h-3 w-3" />
            Apply to {format(parseISO(targetDate), 'MMM d')} entry
          </button>
        </div>
      )}
      {applied && (
        <div className="border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-center text-[11px] font-medium text-emerald-700">
          Applied to the diary
        </div>
      )}
      {discarded && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-center text-[11px] font-medium text-slate-500">
          Discarded
        </div>
      )}
    </div>
  );
}
