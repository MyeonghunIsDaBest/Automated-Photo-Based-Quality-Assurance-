import { describe, it, expect } from 'vitest';
import { matchesQuoteSubView, quoteSubViewFromParam } from '../lib/commercial/quoteSubViews';
import type { Quote } from '../lib/api/commercial';

// The predicate only reads status / archivedAt / convertedJobId — cast a partial.
const q = (over: Partial<Quote>): Quote =>
  ({ status: 'draft', archivedAt: null, convertedJobId: null, ...over } as Quote);

describe('quoteSubViewFromParam', () => {
  it('defaults missing/unknown to open', () => {
    expect(quoteSubViewFromParam(null)).toBe('open');
    expect(quoteSubViewFromParam('nope')).toBe('open');
  });
  it('passes through the known views', () => {
    expect(quoteSubViewFromParam('progress')).toBe('progress');
    expect(quoteSubViewFromParam('approved')).toBe('approved');
    expect(quoteSubViewFromParam('complete')).toBe('complete');
    expect(quoteSubViewFromParam('closed')).toBe('closed');
  });
});

describe('matchesQuoteSubView', () => {
  it('open = draft, not archived', () => {
    expect(matchesQuoteSubView(q({ status: 'draft' }), 'open')).toBe(true);
    expect(matchesQuoteSubView(q({ status: 'sent' }), 'open')).toBe(false);
    expect(matchesQuoteSubView(q({ status: 'draft', archivedAt: '2026-07-17T00:00:00Z' }), 'open')).toBe(false);
  });

  it('progress = sent or viewed', () => {
    expect(matchesQuoteSubView(q({ status: 'sent' }), 'progress')).toBe(true);
    expect(matchesQuoteSubView(q({ status: 'viewed' }), 'progress')).toBe(true);
    expect(matchesQuoteSubView(q({ status: 'draft' }), 'progress')).toBe(false);
  });

  it('approved = accepted WITHOUT a converted job', () => {
    expect(matchesQuoteSubView(q({ status: 'accepted' }), 'approved')).toBe(true);
    expect(matchesQuoteSubView(q({ status: 'accepted', convertedJobId: 'j1' }), 'approved')).toBe(false);
  });

  it('complete = accepted WITH a converted job', () => {
    expect(matchesQuoteSubView(q({ status: 'accepted', convertedJobId: 'j1' }), 'complete')).toBe(true);
    expect(matchesQuoteSubView(q({ status: 'accepted' }), 'complete')).toBe(false);
  });

  it('closed = declined / expired / archived, and archived WINS', () => {
    expect(matchesQuoteSubView(q({ status: 'declined' }), 'closed')).toBe(true);
    expect(matchesQuoteSubView(q({ status: 'expired' }), 'closed')).toBe(true);
    expect(matchesQuoteSubView(q({ status: 'accepted', archivedAt: 'x' }), 'closed')).toBe(true);
    // an archived accepted+converted quote appears ONLY under closed
    const filed = q({ status: 'accepted', archivedAt: 'x', convertedJobId: 'j1' });
    expect(matchesQuoteSubView(filed, 'complete')).toBe(false);
    expect(matchesQuoteSubView(filed, 'approved')).toBe(false);
    expect(matchesQuoteSubView(filed, 'closed')).toBe(true);
  });
});
