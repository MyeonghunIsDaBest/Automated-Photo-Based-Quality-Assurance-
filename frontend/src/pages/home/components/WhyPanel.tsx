// WhyPanel — three-pillar value strip at the bottom of /home. Answers the
// "why our own website" half of the orientation. Each pillar is icon +
// heading + one-line body. Consumed from `ROLE_HOME_VARIANTS[role].pillars`.

import type { PillarSpec } from '../roleHomeConfig';

interface WhyPanelProps {
  /** Exactly three pillars. */
  pillars: readonly [PillarSpec, PillarSpec, PillarSpec];
}

export default function WhyPanel({ pillars }: WhyPanelProps) {
  return (
    <section
      aria-labelledby="why-built-heading"
      className="rounded-2xl border border-slate-200 bg-white px-5 py-7 sm:px-7 sm:py-9"
    >
      <p
        id="why-built-heading"
        className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500"
      >
        Why we built our own
      </p>
      <ul className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <li key={pillar.title} className="flex flex-col gap-2">
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"
                aria-hidden
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
              </span>
              <h3 className="display text-lg font-medium text-slate-900">
                {pillar.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                {pillar.body}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
