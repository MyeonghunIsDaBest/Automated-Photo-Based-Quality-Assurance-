import { describe, it, expect } from 'vitest';
import { weekDates, toISODate, timelineColumns, timelineWindow, barSpan, scheduleFromDue, scheduleFromStart } from '../lib/jobs/scheduleWeek';

describe('weekDates', () => {
  it('returns Mon–Sun for the week containing a midweek date', () => {
    const w = weekDates(new Date(2026, 5, 17)); // Wed 17 Jun 2026
    expect(w.map(toISODate)).toEqual([
      '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18',
      '2026-06-19', '2026-06-20', '2026-06-21',
    ]);
  });
  it('treats Sunday as the last day of its week', () => {
    const w = weekDates(new Date(2026, 5, 21)); // Sun
    expect(toISODate(w[0])).toBe('2026-06-15');
    expect(toISODate(w[6])).toBe('2026-06-21');
  });
});

describe('timelineColumns', () => {
  it('week scale = the Mon–Sun of the anchor week', () => {
    const c = timelineColumns('week', new Date(2026, 5, 17));
    expect(c).toHaveLength(7);
    expect(toISODate(c[0])).toBe('2026-06-15');
    expect(toISODate(c[6])).toBe('2026-06-21');
  });
  it('month scale = every day of the anchor month', () => {
    const c = timelineColumns('month', new Date(2026, 5, 17));
    expect(c).toHaveLength(30);
    expect(toISODate(c[0])).toBe('2026-06-01');
    expect(toISODate(c[29])).toBe('2026-06-30');
  });
  it('month scale handles February (28 days in non-leap 2026)', () => {
    const c = timelineColumns('month', new Date(2026, 1, 10));
    expect(c).toHaveLength(28);
    expect(toISODate(c[27])).toBe('2026-02-28');
  });
});

describe('timelineWindow', () => {
  it('builds Monday-aligned consecutive days spanning the requested weeks', () => {
    const w = timelineWindow('2026-06-16', 1, 2); // Tue 16 Jun; 1 week before, 2 after
    expect(w).toHaveLength(28); // (1 + 2 + 1) * 7
    expect(toISODate(w[0])).toBe('2026-06-08'); // Monday one week before the 15th
    expect(toISODate(w[27])).toBe('2026-07-05'); // Sunday two weeks after
  });
  it('starts on the Monday of the centre week when before = 0', () => {
    const w = timelineWindow('2026-06-17', 0, 0);
    expect(w).toHaveLength(7);
    expect(toISODate(w[0])).toBe('2026-06-15');
    expect(toISODate(w[6])).toBe('2026-06-21');
  });
});

describe('scheduleFromDue', () => {
  it('returns a 3-day inclusive bar ending on the due date (default)', () => {
    expect(scheduleFromDue('2026-06-19')).toEqual({ start: '2026-06-17', end: '2026-06-19' });
    expect(scheduleFromDue('2026-06-17')).toEqual({ start: '2026-06-15', end: '2026-06-17' });
  });
  it('respects a custom length', () => {
    expect(scheduleFromDue('2026-06-19', 1)).toEqual({ start: '2026-06-19', end: '2026-06-19' });
  });
  it('handles a month boundary', () => {
    expect(scheduleFromDue('2026-07-01')).toEqual({ start: '2026-06-29', end: '2026-07-01' });
  });
  it('uses only the date part of a timestamp', () => {
    expect(scheduleFromDue('2026-06-19T09:30:00Z')).toEqual({ start: '2026-06-17', end: '2026-06-19' });
  });
});

describe('scheduleFromStart', () => {
  it('returns a 3-day inclusive bar starting on the date (default)', () => {
    expect(scheduleFromStart('2026-06-16')).toEqual({ start: '2026-06-16', end: '2026-06-18' });
  });
  it('handles a month boundary', () => {
    expect(scheduleFromStart('2026-06-30')).toEqual({ start: '2026-06-30', end: '2026-07-02' });
  });
});

describe('barSpan', () => {
  const week = timelineColumns('week', new Date(2026, 5, 15)); // 15..21 Jun

  it('maps an in-view range to inclusive column indices', () => {
    expect(barSpan('2026-06-16', '2026-06-18', week)).toEqual({
      startIdx: 1, endIdx: 3, clampedLeft: false, clampedRight: false,
    });
  });
  it('handles a single-day range', () => {
    expect(barSpan('2026-06-15', '2026-06-15', week)).toEqual({
      startIdx: 0, endIdx: 0, clampedLeft: false, clampedRight: false,
    });
  });
  it('clamps a range that overruns both ends', () => {
    expect(barSpan('2026-06-10', '2026-06-30', week)).toEqual({
      startIdx: 0, endIdx: 6, clampedLeft: true, clampedRight: true,
    });
  });
  it('clamps the right when the end runs past the view', () => {
    expect(barSpan('2026-06-19', '2026-06-30', week)).toEqual({
      startIdx: 4, endIdx: 6, clampedLeft: false, clampedRight: true,
    });
  });
  it('returns null when the range is entirely before the view', () => {
    expect(barSpan('2026-06-01', '2026-06-05', week)).toBeNull();
  });
  it('returns null when the range is entirely after the view', () => {
    expect(barSpan('2026-06-22', '2026-06-25', week)).toBeNull();
  });
  it('tolerates ISO timestamps (uses the date part)', () => {
    expect(barSpan('2026-06-16T00:00:00Z', '2026-06-17T12:00:00Z', week)).toEqual({
      startIdx: 1, endIdx: 2, clampedLeft: false, clampedRight: false,
    });
  });
});
