import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Sparkles, LineChart, ArrowRight, X } from 'lucide-react';
import { FRAUNCES } from '../../pages/gantt/components/ledger';

// First-run onboarding (Tier-3 #18) — a one-time warm overlay that teaches the
// core loop new users otherwise have to discover: Upload → AI reads it →
// Progress files itself. This loop IS the product's differentiator, so it earns
// a deliberate teaching moment on first sign-in.
//
// Self-gating: shows once, then writes a localStorage flag so it never returns.
// Bump the key suffix to re-introduce it after a major change. Mounted once in
// Layout (inside the authenticated shell) so it rides every role's first visit.

const SEEN_KEY = 'siteproof:onboarded:v1';

const STEPS: { Icon: typeof Camera; n: string; label: string; caption: string }[] = [
  { Icon: Camera,    n: '01', label: 'Upload',  caption: 'Snap one site photo from the field — tag it to a task, or let it auto-detect.' },
  { Icon: Sparkles,  n: '02', label: 'AI reads it', caption: 'Claude judges the work against that phase and proposes a completion %.' },
  { Icon: LineChart, n: '03', label: 'Progress files itself', caption: 'The Gantt re-aligns and a permanent, audit-grade record is logged for QA.' },
];

function hasSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export default function FirstRunOnboarding() {
  const [open, setOpen] = useState(() => !hasSeen());

  const dismiss = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode — show once per session is fine */ }
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="editorial-root fixed inset-0 z-[60] flex items-center justify-center bg-[#1A1A1A]/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to SiteProof"
        >
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-[18px] border border-[#E6E1D4] bg-[#FAF8F2] shadow-[0_24px_70px_-20px_rgba(20,20,20,0.5)]"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, y: 10, scale: 0.99, transition: { duration: 0.2 } }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Paper-grain wash for the "filed record" feel */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-multiply"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#E5F2EA]/60 blur-3xl" />

            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-[#A0A0A0] transition-colors hover:bg-white hover:text-[#3A3A3A]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative px-6 pt-7 sm:px-8">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#246F47]">
                <span className="inline-block h-px w-6 bg-[#A8D0B8]" />
                Welcome to SiteProof
              </div>
              <h2
                className="text-[28px] font-medium leading-[1.05] tracking-tight text-[#1A1A1A] sm:text-[32px]"
                style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
              >
                One photo a day.<br />
                <span className="text-[#A0A0A0]">The record writes</span>{' '}
                <em className="font-normal italic text-[#246F47]">itself</em>.
              </h2>
              <p className="mt-2.5 max-w-sm text-[13.5px] leading-relaxed text-[#6B6B6B]">
                Here's the whole loop — it takes about ten seconds on site.
              </p>
            </div>

            <ol className="relative mt-5 px-6 pb-2 sm:px-8">
              {STEPS.map((s, i) => {
                const Icon = s.Icon;
                return (
                  <motion.li
                    key={s.n}
                    className="flex items-start gap-4 border-b border-[#EFEBE0] py-4 last:border-b-0"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.15 + i * 0.1, duration: 0.4 } }}
                  >
                    <div className="flex flex-shrink-0 flex-col items-center">
                      <span className="grid h-11 w-11 place-items-center rounded-[12px] border border-[#E6E1D4] bg-white text-[#246F47] shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                        <Icon className="h-5 w-5" strokeWidth={1.6} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-semibold tabular-nums text-[#C8C2B4]" style={{ fontFamily: FRAUNCES }}>{s.n}</span>
                        <h3 className="text-[15px] font-semibold text-[#1A1A1A]">{s.label}</h3>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B6B6B]">{s.caption}</p>
                    </div>
                  </motion.li>
                );
              })}
            </ol>

            <div className="relative flex flex-col-reverse items-stretch gap-2 border-t border-[#EFEBE0] bg-white/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full px-3 py-2 text-[13px] font-medium text-[#6B6B6B] transition-colors hover:text-[#1A1A1A]"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="group inline-flex items-center justify-center gap-1.5 rounded-full bg-[#2F8F5C] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#246F47]"
              >
                Got it — let's go
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
