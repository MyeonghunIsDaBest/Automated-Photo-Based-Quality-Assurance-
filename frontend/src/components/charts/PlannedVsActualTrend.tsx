import { useMemo } from 'react';
import {
  Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { format, parseISO } from 'date-fns';

// Shared "planned vs actual" progress trend — one source of truth for both the
// Gantt Overview (Progress trend) and the project Dashboard (Trend), so the two
// always read identically.
//
//   • green  = actual cumulative progress (from progressHistory, anchored to the
//              live overall % at today)
//   • red ⸺  = planned baseline (straight 0%→100% from project start to end —
//              where the schedule says you "should" be by any date)
//
// Always renders, even with no history (green sits at the current overall,
// planned rises toward the deadline — so "behind" reads as green under red).

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/** Where the linear schedule says the project should be, as a % by `at` (now by
 *  default). Callers use this for an "X% ahead/behind" chip. */
export function plannedPctNow(start: string, end: string, at: number = Date.now()): number {
  const startMs = parseISO(start).getTime();
  const endMs = Math.max(startMs + 86_400_000, parseISO(end).getTime());
  const todayMs = Math.min(endMs, Math.max(startMs, at));
  return Math.round(clampPct(((todayMs - startMs) / (endMs - startMs)) * 100));
}

function buildSeries(
  startMs: number, endMs: number, todayMs: number,
  history: { date: string; progress: number }[], overall: number,
): { t: number; planned?: number; actual?: number }[] {
  const span = Math.max(1, endMs - startMs);
  const plannedAt = (ms: number) => clampPct(((ms - startMs) / span) * 100);
  const map = new Map<number, { t: number; planned?: number; actual?: number }>();
  const put = (t: number, patch: Partial<{ planned: number; actual: number }>) =>
    map.set(t, { t, ...(map.get(t) ?? {}), ...patch });

  put(startMs, { planned: 0 });
  put(todayMs, { planned: plannedAt(todayMs) });
  put(endMs, { planned: 100 });

  const pts = history
    .map((h) => ({ t: parseISO(h.date).getTime(), v: h.progress }))
    .filter((p) => Number.isFinite(p.t))
    .map((p) => ({ t: Math.min(endMs, Math.max(startMs, p.t)), v: p.v }))
    .sort((a, b) => a.t - b.t);
  if (pts.length === 0) put(startMs, { actual: 0 });
  for (const p of pts) put(p.t, { actual: p.v });
  put(todayMs, { actual: overall });

  return [...map.values()].sort((a, b) => a.t - b.t);
}

export function PlannedVsActualTrend({
  start, end, history, overall, heightClass = 'h-40 sm:h-48',
}: {
  start: string;
  end: string;
  history: { date: string; progress: number }[];
  overall: number;
  heightClass?: string;
}) {
  const startMs = parseISO(start).getTime();
  const endMs = Math.max(startMs + 86_400_000, parseISO(end).getTime());
  const todayMs = Math.min(endMs, Math.max(startMs, Date.now()));
  const data = useMemo(
    () => buildSeries(startMs, endMs, todayMs, history, overall),
    [startMs, endMs, todayMs, history, overall],
  );

  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="pvaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#2F8F5C" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#2F8F5C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[startMs, endMs]}
            tick={{ fontSize: 10, fill: '#A0A0A0' }}
            tickFormatter={(ms: number) => format(new Date(ms), 'MMM d')}
            tickCount={5}
          />
          <YAxis tick={{ fontSize: 10, fill: '#A0A0A0' }} domain={[0, 100]} ticks={[0, 50, 100]} />
          <RTooltip
            contentStyle={{ background: 'white', border: '1px solid #E6E1D4', borderRadius: 8, fontSize: 12 }}
            formatter={((v: number, name: string) => [`${Math.round(v)}%`, name === 'planned' ? 'Planned' : 'Actual']) as never}
            labelFormatter={((ms: number) => format(new Date(ms), 'MMM d, yyyy')) as never}
          />
          <ReferenceLine
            x={todayMs}
            stroke="#2F8F5C"
            strokeWidth={1.5}
            strokeDasharray="2 3"
            label={{ value: 'TODAY', position: 'top', fill: '#246F47', fontSize: 9, fontWeight: 700 }}
          />
          <Area
            type="monotone"
            dataKey="actual"
            stroke="#2F8F5C"
            strokeWidth={2}
            fill="url(#pvaGrad)"
            connectNulls
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="planned"
            stroke="#C44545"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            connectNulls
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
