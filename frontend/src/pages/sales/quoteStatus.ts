// Single source of truth for mapping a quote's status to a ledger tone, so the
// Quotes register, the quote editor, and the New-Quote wizard all colour status
// identically. (Lives in the sales domain rather than the generic ledger kit so
// the UI kit stays free of quote-specific knowledge.)

import type { ToneKey } from "../gantt/components/ledger";
import type { QuoteStatus } from "../../lib/api/commercial";

export const QUOTE_STATUS_TONE: Record<QuoteStatus, ToneKey> = {
  draft: "ink",
  sent: "slate",
  viewed: "amber",
  accepted: "sage",
  declined: "red",
  expired: "orange",
};

export function quoteStatusTone(status: QuoteStatus): ToneKey {
  return QUOTE_STATUS_TONE[status] ?? "ink";
}
