// ─────────────────────────────────────────────────────────────────────────────
// lib/format.ts — the shared display formatters (P9.A).
//
// Replaces ~20 local fmtMoney and ~19 local fmtDate copies. Outputs are
// byte-compatible with the dominant local implementations, so call-site
// migration is mechanical:
//   fmtMoney(1234.5)   → "$1,234.50"
//   fmtDate(iso)       → "13/07/2026"            (en-AU toLocaleDateString)
//   fmtDateMedium(iso) → "13 Jul 2026"
//   fmtDateTime(iso)   → "13/07/2026, 2:05 pm"
//   fmtQty(2)          → "2"      fmtQty(2.5) → "2.50"
// Only swap a call site when its current output matches one of these; locals
// with genuinely different behavior keep their own until deliberately changed.
// ─────────────────────────────────────────────────────────────────────────────

/** AUD money, always two decimals, thousands separators: "$1,234.50". */
export function fmtMoney(n: number): string {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Numeric AU date: "13/07/2026". */
export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-AU');
}

/** Medium AU date: "13 Jul 2026". */
export function fmtDateMedium(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Numeric AU date + time: "13/07/2026, 2:05 pm". */
export function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Quantities: whole numbers stay whole, fractions show two decimals. */
export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
