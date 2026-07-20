// ─────────────────────────────────────────────────────────────────────────────
// components/print/printTheme.ts — the CUSTOMER-FACING print identity (P6-P),
// coded from the graphic designer's quote/invoice artwork. This palette is the
// company's print brand and is deliberately separate from the in-app warm
// ledger: printed documents wear Casone's colours, the app wears its own.
//
// Hexes are sampled from the designer's artwork; the designer review round
// (worksheet P14) confirms or corrects them in one place.
// ─────────────────────────────────────────────────────────────────────────────

export const PRINT = {
  /** Brand orange — document number, rules, the Total band, contact band. */
  orange: '#E2662C',
  /** Brand navy — section labels, the trade band, the totals rule. */
  navy: '#1A5570',
  /** Table header band. */
  peach: '#FBE7D9',
  /** Zebra stripe on alternating item rows. */
  zebra: '#F6F6F6',
  /** Quiet body grey for taglines / footnotes. */
  grey: '#9B9B9B',
} as const;

/** Browsers drop background colours when printing unless told not to —
 *  every coloured band/cell in the print template carries this class
 *  (defined in index.css). */
export const PRINT_EXACT = 'print-exact';
