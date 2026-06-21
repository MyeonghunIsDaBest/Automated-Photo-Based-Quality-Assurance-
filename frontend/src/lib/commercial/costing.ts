// ─────────────────────────────────────────────────────────────────────────────
// lib/commercial/costing.ts — Pure labour costing + profit math (PP1).
//
// No I/O; no Supabase imports. All functions are deterministic and
// unit-testable in isolation (see src/__tests__/commercialCosting.test.ts).
//
// Rounding discipline:
//   - labourCost: sum of (hours * rate) per costed role, rounded to 2dp at end.
//   - marginPct: rounded to 1dp (round1). null when revenue <= 0 or revenue is null.
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round to 2 decimal places (half-up). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round to 1 decimal place (half-up). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

/** A single time-entry row as seen by the costing engine. */
export interface CostingEntry {
  hours: number;
  role: string | null;
}

/** Per-role breakdown line in the rollup result. */
export interface ByRoleLine {
  role: string;
  hours: number;
  /** null cost means the role had no rate (uncosted). */
  cost: number | null;
}

/** Result of rollUpLabourCost. */
export interface LabourRollup {
  labourCost: number;
  costedHours: number;
  uncostedHours: number;
  byRole: ByRoleLine[];
}

/** Input to computeProfit. Nulls are treated as 0 for figures. */
export interface ProfitInput {
  revenueExGst: number | null;
  materialsCost: number | null;
  labourCost: number | null;
}

/** Result of computeProfit. */
export interface ProfitResult {
  gross: number;
  net: number;
  /** null when revenue is null or <= 0. */
  marginPct: number | null;
}

// ---------------------------------------------------------------------------
// rollUpLabourCost
// ---------------------------------------------------------------------------

/**
 * Aggregate time entries against a rates map into a labour cost rollup.
 *
 * Costed criteria: entry.role is a non-null string AND rates.get(role) is a
 * number (including 0). Entries with null role, an unknown role, or a role
 * whose mapped rate is null are counted in uncostedHours and excluded from
 * labourCost.
 *
 * @param entries  Array of {hours, role} objects.
 * @param rates    Map<role, loadedRate | null> — active labour rates.
 */
export function rollUpLabourCost(
  entries: CostingEntry[],
  rates: Map<string, number | null>,
): LabourRollup {
  // Accumulate per-role totals
  const roleHours = new Map<string, number>();
  let uncostedHours = 0;

  for (const entry of entries) {
    if (entry.role === null || entry.role === undefined) {
      uncostedHours += entry.hours;
      continue;
    }
    const rate = rates.get(entry.role);
    if (rate === undefined || rate === null) {
      // Unknown role or rate not set — uncosted
      uncostedHours += entry.hours;
      continue;
    }
    // rate is a number (including 0) — costed
    roleHours.set(entry.role, (roleHours.get(entry.role) ?? 0) + entry.hours);
  }

  // Build byRole + sum costedHours + labourCost
  const byRole: ByRoleLine[] = [];
  let costedHours = 0;
  let labourCostRaw = 0;

  for (const [role, hours] of roleHours) {
    const rate = rates.get(role) as number; // guaranteed number (null filtered above)
    const cost = hours * rate;
    labourCostRaw += cost;
    costedHours += hours;
    byRole.push({ role, hours, cost: round2(cost) });
  }

  return {
    labourCost: round2(labourCostRaw),
    costedHours,
    uncostedHours,
    byRole,
  };
}

// ---------------------------------------------------------------------------
// computeProfit
// ---------------------------------------------------------------------------

/**
 * Compute gross margin, net margin, and margin % from revenue, materials, and
 * labour figures. Nulls are treated as 0 for the arithmetic so the card always
 * shows numbers, but marginPct is null when revenue is null or <= 0 (dividing
 * by zero would be meaningless).
 */
export function computeProfit(input: ProfitInput): ProfitResult {
  const rev = input.revenueExGst ?? 0;
  const mat = input.materialsCost ?? 0;
  const lab = input.labourCost ?? 0;

  const gross = round2(rev - mat);
  const net = round2(gross - lab);

  let marginPct: number | null = null;
  if (input.revenueExGst !== null && input.revenueExGst > 0) {
    marginPct = round1((net / input.revenueExGst) * 100);
  }

  return { gross, net, marginPct };
}

// ---------------------------------------------------------------------------
// formatAUD — shared display helper (no I/O)
// ---------------------------------------------------------------------------

/**
 * Format a number as AUD with 2 decimal places, e.g. "$1,234.56".
 * Pass null / undefined to get "$0.00".
 */
export function formatAUD(n: number | null | undefined): string {
  const val = n ?? 0;
  return val.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
