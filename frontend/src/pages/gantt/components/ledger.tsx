// Shared "site register" UI kit for the Inventory + Defects tabs.
//
// Both surfaces are presented as registers in the same warm logbook as the
// Site Diary (DayHeader / ProgressBar / TimelineEntry) — cream surfaces, warm
// #E6E1D4 hairlines, Fraunces numerals, sage accents, dot-marked statuses.
// Sharing these primitives is what keeps the Materials ledger and the Defect
// register reading as siblings rather than two unrelated tabs.

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** The display face, matched verbatim to the Site Diary's inline usage. */
export const FRAUNCES = "'Fraunces', Georgia, serif";

/** Warm palette tokens — the same hexes the Site Diary components hard-code. */
export const REG = {
  border: '#E6E1D4',
  divider: '#EFEBE0',
  wash: '#FAF8F2',
  ink: '#1A1A1A',
  body: '#3A3A3A',
  muted: '#6B6B6B',
  faint: '#A0A0A0',
  sage: '#2F8F5C',
  sageDark: '#246F47',
} as const;

export type ToneKey = 'sage' | 'amber' | 'orange' | 'red' | 'slate' | 'ink';

/** Tinted fg/bg + a solid dot, drawn from the Site Diary status palette. */
export const TONE: Record<ToneKey, { fg: string; bg: string; dot: string }> = {
  sage:   { fg: '#246F47', bg: '#E5F2EA', dot: '#2F8F5C' },
  amber:  { fg: '#C8841E', bg: '#F9EFD9', dot: '#D69A2E' },
  orange: { fg: '#B5602A', bg: '#F6E7DA', dot: '#C26A2C' },
  red:    { fg: '#C44545', bg: '#FBE5E5', dot: '#C44545' },
  slate:  { fg: '#5B6B7B', bg: '#EEF1F4', dot: '#6B7A8F' },
  ink:    { fg: '#1A1A1A', bg: '#F0EDE4', dot: '#1A1A1A' },
};

/** Consistent CTA classes so both registers' buttons are identical. */
export const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50';
export const btnGhost =
  'inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:cursor-not-allowed disabled:opacity-50';

/** The warm logbook card shell — `border-[#E6E1D4] rounded-[14px]` + soft shadow. */
export const cardShell =
  'rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]';

// ─── Header ───────────────────────────────────────────────────────────────
// Echoes the Site Diary DayHeader: a bordered tile (dark kicker strip + glyph)
// alongside an eyebrow / Fraunces title / meta line, with right-aligned actions.

export function LedgerHeader({
  kicker, icon: Icon, eyebrow, title, meta, actions,
}: {
  kicker: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`mb-4 flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 ${cardShell}`}>
      <div className="flex items-center gap-4">
        <div className="w-16 min-w-16 overflow-hidden rounded-[11px] border border-[#E6E1D4] bg-white text-center">
          <div className="bg-[#1A1A1A] py-1 text-[10px] font-semibold tracking-[0.16em] text-white">{kicker}</div>
          <div className="grid place-items-center py-2.5 text-[#1A1A1A]">
            <Icon className="h-6 w-6" strokeWidth={1.5} />
          </div>
        </div>
        <div className="leading-tight">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">{eyebrow}</div>
          <h2 className="m-0 text-[26px] font-medium leading-tight text-[#1A1A1A] sm:text-[28px]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.015em' }}>
            {title}
          </h2>
          {meta && <div className="mt-1 text-[13px] text-[#6B6B6B]">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Stat strip ─────────────────────────────────────────────────────────────
// Echoes the Site Diary ProgressBar: a single warm card of big Fraunces
// numerals, each with a tone dot + uppercase label. One row on wide screens.

export interface LedgerStat {
  value: ReactNode;
  label: string;
  sub?: string;
  tone?: ToneKey;
}

export function LedgerStatRow({ stats }: { stats: LedgerStat[] }) {
  return (
    <div className={`mb-4 overflow-hidden px-5 py-4 ${cardShell}`}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-start lg:gap-x-9">
        {stats.map((s, i) => {
          const t = TONE[s.tone ?? 'ink'];
          return (
            <div key={i} className="lg:min-w-[104px]">
              <div className="text-[24px] font-medium leading-none tabular-nums text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
                {s.value}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[#6B6B6B]">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: t.dot }} aria-hidden />
                {s.label}
              </div>
              {s.sub && <div className="mt-0.5 text-[11px] text-[#A0A0A0]">{s.sub}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pills ────────────────────────────────────────────────────────────────

/** Tinted status / severity pill — matches the Site Diary STATUS_BADGES. */
export function StatusPill({
  tone, children, className = '',
}: {
  tone: ToneKey;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

/** A dot-ring status marker, lifted from the Site Diary TimelineEntry. */
export function ToneDot({ tone, className = '' }: { tone: ToneKey; className?: string }) {
  const t = TONE[tone];
  return (
    <span
      aria-hidden
      className={`inline-block h-[9px] w-[9px] flex-shrink-0 rounded-full ${className}`}
      style={{ background: t.dot, boxShadow: `0 0 0 3px #fff, 0 0 0 4px ${t.bg}` }}
    />
  );
}

/** Neutral meta chip (quantities, tags) — cream fill, warm hairline. */
export function MetaChip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[7px] border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[11.5px] font-medium text-[#3A3A3A] ${className}`}>
      {children}
    </span>
  );
}
