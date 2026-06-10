import { describe, it, expect } from 'vitest';
import { mockWritingAssist } from '../lib/api/mockWritingAssist';

// Pure-function smoke tests for the three transforms. The runtime sleeps 600ms
// to simulate latency — vitest tolerates that without complaint since each
// test only fires one call.

describe('mockWritingAssist', () => {
  describe('improve', () => {
    it('capitalises the first letter and expands site shorthand', async () => {
      const r = await mockWritingAssist(
        'improve',
        'rebar laid in zone b. sparkie checked panel.',
      );
      // Sentence-initial letters capitalised, "rebar" expanded, "sparkie" expanded.
      expect(r.improved).toMatch(/^Rebar \(reinforcing steel\) laid in zone b\./);
      expect(r.improved).toMatch(/electrician checked panel\./i);
    });

    it('returns idempotent output for already-clean text', async () => {
      const first = await mockWritingAssist('improve', 'Concrete pour completed.');
      const second = await mockWritingAssist('improve', first.improved);
      expect(second.improved).toBe(first.improved);
    });
  });

  describe('expand_with_context', () => {
    it('prepends a sentence containing personnel count + weather label', async () => {
      const r = await mockWritingAssist(
        'expand_with_context',
        'Footings poured at L2 west.',
        {
          weather: 'cloudy',
          temperatureC: 20,
          personnel: [
            { company: 'Casone Electrical' },
            { company: 'Casone Electrical' },
            { company: 'Aetna Civil' },
          ],
        },
      );
      // Preface includes weather + temp + crew size + company breakdown.
      expect(r.improved).toMatch(/Cloudy, 20°C/);
      expect(r.improved).toMatch(/crew of 3 on site/);
      expect(r.improved).toMatch(/2 from Casone Electrical/);
      expect(r.improved).toMatch(/1 from Aetna Civil/);
      // Original body still present after the preface.
      expect(r.improved).toMatch(/Footings poured at L2 west\.$/);
    });

    it('omits the preface entirely when no context is provided', async () => {
      const r = await mockWritingAssist('expand_with_context', 'rebar tied at L3.');
      // No preface (no weather/personnel), but the body still runs through
      // `improveText` so "rebar" expands + sentence-initial letter capitalises.
      expect(r.improved).toBe('Rebar (reinforcing steel) tied at L3.');
    });
  });

  describe('tighten', () => {
    it('strips filler words and joins sentences with semicolons', async () => {
      const r = await mockWritingAssist(
        'tighten',
        'basically we just laid rebar. kind of finished trenching too. really good day.',
      );
      // Filler vocabulary gone.
      expect(r.improved).not.toMatch(/\bbasically\b/i);
      expect(r.improved).not.toMatch(/\bkind of\b/i);
      expect(r.improved).not.toMatch(/\bwe just\b/i);
      expect(r.improved).not.toMatch(/\breally\b/i);
      // Sentences joined with `;` (with exactly one trailing period).
      expect(r.improved.match(/;/g)?.length).toBeGreaterThanOrEqual(2);
      expect(r.improved.endsWith('.')).toBe(true);
    });
  });

  it('every transform returns a non-empty rationale + latencyMs', async () => {
    for (const t of ['improve', 'expand_with_context', 'tighten'] as const) {
      const r = await mockWritingAssist(t, 'Site walk completed.');
      expect(r.rationale.length).toBeGreaterThan(0);
      expect(r.latencyMs).toBeGreaterThan(0);
    }
  });
});
