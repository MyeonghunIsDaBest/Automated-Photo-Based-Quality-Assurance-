// ─────────────────────────────────────────────────────────────────────────────
// components/dashboard/UpdatesCard.tsx — the merged Updates feed (P9.B, from
// Jordan's test.html dashboard mock).
//
// One card, two lenses behind a pill toggle:
//   Activity    — who did what in this project (existing activity feed, with
//                 its deep-link modal behavior intact)
//   What's new  — what shipped in the app (whats-new.json)
//
// The addition beyond the mock: the feed remembers when you last opened the
// dashboard (per user, localStorage) and draws a "You were last here" line at
// exactly that point — so the card answers the real morning question: what
// happened while I was gone. The Activity toggle carries the count.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react';
import ActivityFeed from '../activity/ActivityFeed';
import type { ActivityEvent } from '../../lib/activity/types';
import whatsNewJson from '../../data/whats-new.json';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import { cn } from '../../lib/cn';

// ─── What's-new data (shape from scripts/build-whats-new.mjs) ────────────────

type Surface = 'frontend' | 'backend' | 'fullstack' | 'infra';
type Kind = 'new' | 'fix' | 'improve' | 'change' | 'chore';

interface WhatsNewEntry {
  id: string;
  date: string;
  surface: Surface;
  kind: Kind;
  headline: string;
  filesChanged: number;
}

const whatsNew = whatsNewJson as { unavailable?: boolean; entries: WhatsNewEntry[] };

// Ledger-toned verb dots + surface chips (the old card used raw Tailwind
// emerald/blue — these draw from TONE so the feed matches the board tones).
const KIND_META: Record<Kind, { verb: string; dot: string }> = {
  new:     { verb: 'New',      dot: '#10B981' },
  improve: { verb: 'Improved', dot: '#6B3FA0' },
  fix:     { verb: 'Fixed',    dot: '#D69A2E' },
  change:  { verb: 'Updated',  dot: '#6B7A8F' },
  chore:   { verb: 'Tidied',   dot: '#B9B2A4' },
};

const SURFACE_LABEL: Record<Surface, string> = {
  frontend: 'App', backend: 'Backend', fullstack: 'Full stack', infra: 'Setup',
};

function relativeDate(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const dayDiff = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return then.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

const ACTIVITY_PREVIEW = 6;
const WHATSNEW_PREVIEW = 4;

interface Props {
  events: ActivityEvent[];
  onSelect: (event: ActivityEvent) => void;
  /** Scopes the last-visit marker per account. */
  userId: string | null;
}

export default function UpdatesCard({ events, onSelect, userId }: Props) {
  const [tab, setTab] = useState<'activity' | 'whatsnew'>('activity');
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllNew, setShowAllNew] = useState(false);

  // "Since you were last here" — read the previous visit once, then stamp now.
  const visitKey = `casone.dash.lastVisit.${userId ?? 'anon'}`;
  const prevVisitRef = useRef<string | null | undefined>(undefined);
  if (prevVisitRef.current === undefined) {
    prevVisitRef.current = localStorage.getItem(visitKey);
  }
  const prevVisit = prevVisitRef.current;
  useEffect(() => {
    localStorage.setItem(visitKey, new Date().toISOString());
  }, [visitKey]);

  const { fresh, older } = useMemo(() => {
    if (!prevVisit) return { fresh: [] as ActivityEvent[], older: events };
    return {
      fresh: events.filter((e) => e.timestamp > prevVisit),
      older: events.filter((e) => e.timestamp <= prevVisit),
    };
  }, [events, prevVisit]);

  // Fresh rows always show in full — they're the point. The preview quota
  // then applies to the older tail.
  const olderVisible = showAllActivity ? older : older.slice(0, Math.max(0, ACTIVITY_PREVIEW - fresh.length));
  const hiddenOlder = older.length - olderVisible.length;

  const entries = whatsNew.entries ?? [];
  const newVisible = showAllNew ? entries : entries.slice(0, WHATSNEW_PREVIEW);
  const hiddenNew = entries.length - newVisible.length;

  const toggleBtn = (key: 'activity' | 'whatsnew', label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      aria-pressed={tab === key}
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors',
        tab === key ? 'bg-white text-[#1A1A1A] shadow-[0_1px_2px_rgba(20,20,20,0.08)]' : 'text-[#6B6B6B] hover:text-[#1A1A1A]',
      )}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-[#E5F2EA] px-1.5 py-px text-[10px] font-bold tabular-nums text-[#246F47]">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );

  return (
    <section className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      {/* Header — mock's dash-section anatomy */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E1D4] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#1A1A1A] text-white">
            <Eye className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">In this project</p>
            <h3 className="text-[18px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Updates</h3>
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] p-[3px]">
          {toggleBtn('activity', 'Activity', fresh.length)}
          {toggleBtn('whatsnew', "What's new")}
        </div>
      </div>

      {/* ── Activity lens ──────────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <>
          {events.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[#6B6B6B]">
              Nothing yet — uploads, comments, and updates will appear here.
            </p>
          ) : (
            <>
              {fresh.length > 0 && (
                <ActivityFeed events={fresh} onSelect={onSelect} dense emptyLabel="" />
              )}
              {/* The catch-up line — drawn exactly where your last visit falls */}
              {prevVisit && fresh.length > 0 && older.length > 0 && (
                <div className="flex items-center gap-3 px-5 py-1.5" aria-label="Everything above is new since your last visit">
                  <span className="h-px flex-1 bg-[#E6E1D4]" aria-hidden />
                  <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A0A0A0]">
                    You were last here · {relativeDate(prevVisit)}
                  </span>
                  <span className="h-px flex-1 bg-[#E6E1D4]" aria-hidden />
                </div>
              )}
              {olderVisible.length > 0 && (
                <ActivityFeed events={olderVisible} onSelect={onSelect} dense emptyLabel="" />
              )}
              {(hiddenOlder > 0 || showAllActivity) && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((v) => !v)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-[#EFEBE0] px-5 py-2.5 text-xs font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
                >
                  {showAllActivity
                    ? (<>Show less <ChevronUp className="h-3.5 w-3.5" /></>)
                    : (<>Show {hiddenOlder} more <ChevronDown className="h-3.5 w-3.5" /></>)}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* ── What's-new lens ────────────────────────────────────────────────── */}
      {tab === 'whatsnew' && (
        <>
          {whatsNew.unavailable || entries.length === 0 ? (
            <p className="px-5 py-8 text-sm italic text-[#A0A0A0]">
              {whatsNew.unavailable ? 'Update history is unavailable in this build.' : 'No recent updates.'}
            </p>
          ) : (
            <>
              <div>
                {newVisible.map((e) => {
                  const meta = KIND_META[e.kind] ?? KIND_META.change;
                  return (
                    <div key={e.id} className="flex gap-3 border-b border-[#EFEBE0] px-5 py-3 last:border-b-0">
                      <span className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: meta.dot }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] leading-relaxed text-[#3A3A3A]">
                          <b className="font-semibold text-[#1A1A1A]">{meta.verb}:</b> {e.headline}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-[#6B6B6B]">
                            {SURFACE_LABEL[e.surface] ?? 'App'}
                          </span>
                          <span className="text-[10.5px] text-[#A0A0A0]">{relativeDate(e.date)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(hiddenNew > 0 || showAllNew) && (
                <button
                  type="button"
                  onClick={() => setShowAllNew((v) => !v)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-[#EFEBE0] px-5 py-2.5 text-xs font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
                >
                  {showAllNew
                    ? (<>Show less <ChevronUp className="h-3.5 w-3.5" /></>)
                    : (<>Show {hiddenNew} more <ChevronDown className="h-3.5 w-3.5" /></>)}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
