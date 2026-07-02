// ─────────────────────────────────────────────────────────────────────────────
// pages/stock/StockSetupChecklist.tsx — the first-run experience for the Stock
// hub. Replaces the dead "no items" table with a three-step job card whose
// done-states are derived from real data, each step with a direct action.
// The numbering is honest — it IS a sequence: flag items → add vans → count.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";

import { cardShell, FRAUNCES } from "../gantt/components/ledger";

interface Props {
  /** Materials flagged "held in stock" in the catalogue. */
  stockedCount: number;
  /** Vans set up as stock locations. */
  vanCount: number;
  onGoToLocations?: () => void;
}

function StepMarker({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#2F8F5C] text-white">
      <Check className="h-4 w-4" strokeWidth={3} />
    </span>
  ) : (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#D8D2C4] bg-white text-[13px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
      {n}
    </span>
  );
}

export default function StockSetupChecklist({ stockedCount, vanCount, onGoToLocations }: Props) {
  const steps = [
    {
      done: stockedCount > 0,
      title: "Flag the materials you keep in stock",
      detail: stockedCount > 0
        ? `${stockedCount} item${stockedCount === 1 ? "" : "s"} flagged — add more any time.`
        : "In the catalogue, tick “Held in stock” on the items you carry (screws, saddles, cable…).",
      action: (
        <Link to="/sales?tab=catalogue" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2F8F5C] hover:underline">
          Open Catalogue <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
    {
      done: vanCount > 0,
      title: "Add your vans and assign drivers",
      detail: vanCount > 0
        ? `${vanCount} van${vanCount === 1 ? "" : "s"} set up. The factory is already there.`
        : "Each van holds its own stock; its driver records what they use.",
      action: onGoToLocations ? (
        <button type="button" onClick={onGoToLocations} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2F8F5C] hover:underline">
          Open Locations <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null,
    },
    {
      done: false, // this checklist only renders while nothing is counted yet
      title: "Run the opening stock-take",
      detail: "Open the factory (or a van) in Locations and enter what's on the shelf — that seeds every tally.",
      action: onGoToLocations ? (
        <button type="button" onClick={onGoToLocations} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2F8F5C] hover:underline">
          Count the factory <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null,
    },
  ];

  return (
    <div className={`px-6 py-6 sm:px-8 ${cardShell}`}>
      <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: "-0.015em" }}>
        Let&rsquo;s get your stock counted.
      </h3>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#6B6B6B]">
        Three steps and every screw, saddle and metre of cable has a live running tally — in the factory and in every van.
      </p>
      <ol className="mt-5 space-y-0">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex items-start gap-3.5 py-3.5 ${i > 0 ? "border-t border-[#EFEBE0]" : ""}`}>
            <StepMarker done={s.done} n={i + 1} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${s.done ? "text-[#6B6B6B] line-through decoration-[#C4C0B4]" : "text-[#1A1A1A]"}`}>{s.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B6B6B]">{s.detail}</p>
            </div>
            {!s.done && <div className="shrink-0 pt-0.5">{s.action}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
