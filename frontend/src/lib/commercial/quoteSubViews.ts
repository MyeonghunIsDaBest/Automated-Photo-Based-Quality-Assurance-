// lib/commercial/quoteSubViews.ts — SimPro-style Quotes sub-views.
//
// A quote has two orthogonal axes: the decision (status) and the shelf
// (archivedAt, mig 101). These five sub-views derive from both plus whether the
// quote became a job (convertedJobId). `closed` is the union catch-all so a
// declined/expired/archived quote appears exactly once. Pure + testable.

import type { Quote } from '../api/commercial';

export type QuoteSubView = 'open' | 'progress' | 'approved' | 'complete' | 'closed';

export const QUOTE_SUBVIEW_LABELS: Record<QuoteSubView, string> = {
  open: 'Open',
  progress: 'Progress',
  approved: 'Approved',
  complete: 'Complete',
  closed: 'Closed / Archived',
};

/** URL `?view=` value → sub-view. Missing/unknown → 'open' (the default). */
export function quoteSubViewFromParam(v: string | null): QuoteSubView {
  return v === 'progress' || v === 'approved' || v === 'complete' || v === 'closed' ? v : 'open';
}

/** Does a quote belong in the given sub-view? Archived wins — an archived quote
 *  only ever shows under Closed, never Open/Progress/Approved/Complete. */
export function matchesQuoteSubView(q: Quote, view: QuoteSubView): boolean {
  const archived = q.archivedAt != null;
  switch (view) {
    case 'open':     return q.status === 'draft' && !archived;
    case 'progress': return (q.status === 'sent' || q.status === 'viewed') && !archived;
    case 'approved': return q.status === 'accepted' && !q.convertedJobId && !archived;
    case 'complete': return q.status === 'accepted' && !!q.convertedJobId && !archived;
    case 'closed':   return archived || q.status === 'declined' || q.status === 'expired';
  }
}
