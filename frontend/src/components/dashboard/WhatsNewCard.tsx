import { useState } from 'react';
import { Sparkles, Code2, Database, Layers, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import whatsNew from '../../data/whats-new.json';

// ─── Types ───────────────────────────────────────────────────────────────
// Mirrors the shape produced by `frontend/scripts/build-whats-new.mjs`.
type Surface = 'frontend' | 'backend' | 'fullstack' | 'infra';
type Kind = 'new' | 'fix' | 'improve' | 'change' | 'chore';

interface Entry {
  id: string;
  date: string;
  surface: Surface;
  kind: Kind;
  headline: string;
  filesChanged: number;
}

interface WhatsNew {
  generatedAt: string;
  unavailable?: boolean;
  entries: Entry[];
}

const data = whatsNew as WhatsNew;

// ─── Visual taxonomy ─────────────────────────────────────────────────────
const SURFACE_META: Record<Surface, { label: string; chip: string; Icon: typeof Code2 }> = {
  frontend:  { label: 'App',       chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: Code2 },
  backend:   { label: 'Backend',   chip: 'border-blue-200 bg-blue-50 text-blue-700',          Icon: Database },
  fullstack: { label: 'Full stack', chip: 'border-violet-200 bg-violet-50 text-violet-700',   Icon: Layers },
  infra:     { label: 'Setup',     chip: 'border-slate-200 bg-slate-50 text-slate-600',       Icon: Wrench },
};

const KIND_DOT: Record<Kind, string> = {
  new:     'bg-emerald-500',
  fix:     'bg-amber-500',
  improve: 'bg-blue-500',
  change:  'bg-slate-400',
  chore:   'bg-slate-300',
};

const KIND_VERB: Record<Kind, string> = {
  new:     'New',
  fix:     'Fixed',
  improve: 'Improved',
  change:  'Updated',
  chore:   'Tidied',
};

const INITIAL_VISIBLE = 4;

// ─── Layman date formatter ───────────────────────────────────────────────
// "Today" / "Yesterday" / "X days ago" up to a week, then "Mon D".
function relativeDate(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────
export default function WhatsNewCard() {
  const [expanded, setExpanded] = useState(false);
  const all = data.entries ?? [];
  const visible = expanded ? all : all.slice(0, INITIAL_VISIBLE);
  const more = Math.max(0, all.length - INITIAL_VISIBLE);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            — What's new
          </p>
          <h3 className="display text-lg font-medium text-slate-900">Recently shipped</h3>
        </div>
        <Sparkles className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden />
      </div>

      {data.unavailable || all.length === 0 ? (
        <p className="text-sm italic text-slate-400">
          {data.unavailable
            ? 'Update history is unavailable in this build.'
            : 'No recent updates.'}
        </p>
      ) : (
        <>
          <ul className="space-y-3.5">
            {visible.map((e) => {
              const surface = SURFACE_META[e.surface] ?? SURFACE_META.infra;
              const SurfaceIcon = surface.Icon;
              return (
                <li key={e.id} className="flex gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${KIND_DOT[e.kind] ?? KIND_DOT.change}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-slate-700">
                      <span className="font-medium text-slate-900">{KIND_VERB[e.kind] ?? 'Updated'}: </span>
                      {e.headline}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium uppercase tracking-wider ${surface.chip}`}
                      >
                        <SurfaceIcon className="h-3 w-3" aria-hidden />
                        {surface.label}
                      </span>
                      <span className="text-slate-400">{relativeDate(e.date)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {more > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-slate-600 transition-colors hover:text-emerald-700"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                </>
              ) : (
                <>
                  Show {more} more <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </>
              )}
            </button>
          )}
        </>
      )}
    </section>
  );
}
