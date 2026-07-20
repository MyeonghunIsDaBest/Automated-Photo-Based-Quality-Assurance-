// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockSetupChecklist.tsx — the first-run experience for the Stock
// hub. Replaces the dead "no items" table with a three-step job card whose
// done-states are derived from real data, each step with a direct action.
// The numbering is honest — it IS a sequence: flag items → add vans → count.
// Styled to the test.html stock-overview card: Fraunces lede, 32px step
// markers (green check when done), hairline-divided rows, green text-links.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import { Check, ChevronRight } from "lucide-react";

import { cn } from "../../lib/cn";
import { cardShell, FRAUNCES } from "../gantt/components/ledger";

interface Props {
  /** Materials flagged "held in stock" in the catalogue. */
  stockedCount: number;
  /** Vans set up as stock locations. */
  vanCount: number;
  onGoToLocations?: () => void;
  /** Drop the outer card chrome when hosted inside a modal (which is the card). */
  bare?: boolean;
  /** Fired when a step action is taken — lets a host popup dismiss itself. */
  onActed?: () => void;
}

const stepLink =
  "inline-flex min-h-11 shrink-0 items-center gap-[5px] text-[13px] font-semibold text-[#2F8F5C] transition-colors hover:text-[#246F47]";

function StepMarker({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2F8F5C] text-white">
      <Check className="h-4 w-4" strokeWidth={3} />
    </span>
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#D8D2C4] bg-white text-[13px] font-bold text-[#3A3A3A]">
      {n}
    </span>
  );
}

export default function StockSetupChecklist({ stockedCount, vanCount, onGoToLocations, bare, onActed }: Props) {
  // Hosted in a popup? A step action should route AND dismiss the popup.
  const goToLocations = onGoToLocations ? () => { onActed?.(); onGoToLocations(); } : undefined;
  const steps = [
    {
      done: stockedCount > 0,
      title: "Flag the materials you keep in stock",
      detail: stockedCount > 0
        ? `${stockedCount} item${stockedCount === 1 ? "" : "s"} flagged — add more any time.`
        : "In the catalogue, tick “Held in stock” on the items you carry (screws, saddles, cable…).",
      action: (
        <Link to="/catalogue" onClick={onActed} className={stepLink}>
          Open Catalogue <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
    {
      done: vanCount > 0,
      title: "Add your vans and assign drivers",
      detail: vanCount > 0
        ? `${vanCount} van${vanCount === 1 ? "" : "s"} set up. The factory is already there.`
        : "Each van holds its own stock; its driver records what they use.",
      action: goToLocations ? (
        <button type="button" onClick={goToLocations} className={stepLink}>
          Open Locations <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null,
    },
    {
      done: false, // this checklist only renders while nothing is counted yet
      title: "Run the opening stock-take",
      detail: "Open the factory (or a van) in Locations and enter what's on the shelf — that seeds every tally.",
      action: goToLocations ? (
        <button type="button" onClick={goToLocations} className={stepLink}>
          Count the factory <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null,
    },
  ];

  return (
    <div className={bare ? "px-5 py-5 sm:px-7 sm:py-6" : cn(cardShell, "rounded-[16px] px-5 py-6 sm:px-8 sm:py-9")}>
      <h3 className="m-0 text-[26px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: "-0.01em" }}>
        Let&rsquo;s get your stock counted.
      </h3>
      <p className="mt-3.5 max-w-[640px] text-[14.5px] leading-[1.6] text-[#6B6B6B]">
        Three steps and every screw, saddle and metre of cable has a live running tally — in the factory and in every van.
      </p>
      <ol className="mt-3 space-y-0">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex items-start gap-4 py-[18px] ${i > 0 ? "border-t border-[#E6E1D4]" : ""}`}>
            <StepMarker done={s.done} n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className={`text-[15px] font-semibold ${s.done ? "text-[#A0A0A0] line-through" : "text-[#1A1A1A]"}`}>{s.title}</p>
              <p className="mt-[3px] text-[12.5px] leading-relaxed tabular-nums text-[#6B6B6B]">{s.detail}</p>
            </div>
            {!s.done && s.action}
          </li>
        ))}
      </ol>
    </div>
  );
}
