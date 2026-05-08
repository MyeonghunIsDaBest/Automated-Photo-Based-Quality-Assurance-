import { useMemo, useState } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Cloud, CloudRain,
  CloudSnow, Plus, Sun, Trash2, Users, Wrench,
} from 'lucide-react';
import {
  eachDayOfInterval, endOfMonth, format, isSameDay, isSameMonth,
  parseISO, startOfMonth,
} from 'date-fns';
import type { Project, User } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Avatar, AvatarFallback } from '../../../components/ui/avatar';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useGanttSideStore, useDiaryEntries } from '../store';
import type { DiaryEntry, DiaryPersonnel, WeatherKind } from '../types';

interface SiteDiaryTabProps {
  project: Project;
  currentUser: User | null;
  canEdit: boolean;
}

type SubView = 'today' | 'workers' | 'calendar';

const SUB_VIEWS: { id: SubView; label: string; icon: typeof Calendar }[] = [
  { id: 'today',    label: 'Today',    icon: Calendar },
  { id: 'workers',  label: 'Workers',  icon: Users },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
];

const WEATHER_OPTS: { value: WeatherKind; label: string; Icon: typeof Sun }[] = [
  { value: 'sunny',  label: 'Sunny',  Icon: Sun },
  { value: 'cloudy', label: 'Cloudy', Icon: Cloud },
  { value: 'rain',   label: 'Rain',   Icon: CloudRain },
  { value: 'storm',  label: 'Storm',  Icon: CloudSnow },
];

const today = () => new Date().toISOString().slice(0, 10);

export function SiteDiaryTab({ project, currentUser, canEdit }: SiteDiaryTabProps) {
  const [view, setView] = useState<SubView>('today');
  const entries = useDiaryEntries(project.id);

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Site Diary · ${project.name}`}
        title="Who was here, what got done."
        description="The end-of-day record. Hours and headcount roll up by worker; the calendar gives you a month-at-a-glance heat map of activity."
      />

      {/* Sub-view strip */}
      <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          {SUB_VIEWS.map((sv) => {
            const Icon = sv.icon;
            const isActive = view === sv.id;
            return (
              <button
                key={sv.id}
                type="button"
                onClick={() => setView(sv.id)}
                className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {sv.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === 'today' && (
        <TodayView project={project} currentUser={currentUser} canEdit={canEdit} entries={entries} />
      )}
      {view === 'workers' && (
        <WorkersView entries={entries} />
      )}
      {view === 'calendar' && (
        <CalendarView entries={entries} onJumpToDay={() => setView('today')} />
      )}
    </>
  );
}

// ─── Today view ────────────────────────────────────────────────────────────
// Date selector at top, defaults to today. If no entry exists for the picked
// date, render the form. If an entry exists, render its detail card with the
// option to add personnel or delete the entry.

function TodayView({
  project, currentUser, canEdit, entries,
}: {
  project: Project;
  currentUser: User | null;
  canEdit: boolean;
  entries: DiaryEntry[];
}) {
  const [pickedDate, setPickedDate] = useState(today());

  const entry = useMemo(
    () => entries.find((e) => e.date === pickedDate) ?? null,
    [entries, pickedDate],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const d = new Date(pickedDate);
                d.setDate(d.getDate() - 1);
                setPickedDate(d.toISOString().slice(0, 10));
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Input
              type="date"
              value={pickedDate}
              onChange={(e) => setPickedDate(e.target.value)}
              className="w-44"
            />
            <button
              type="button"
              onClick={() => {
                const d = new Date(pickedDate);
                d.setDate(d.getDate() + 1);
                setPickedDate(d.toISOString().slice(0, 10));
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {format(parseISO(pickedDate), 'EEEE, MMMM d, yyyy')}
          </p>
        </CardContent>
      </Card>

      {entry ? (
        <EntryCard entry={entry} project={project} canEdit={canEdit} />
      ) : canEdit && currentUser ? (
        <EntryForm
          project={project}
          currentUser={currentUser}
          date={pickedDate}
        />
      ) : (
        <EmptyState
          icon={Calendar}
          title={`No entry for ${format(parseISO(pickedDate), 'MMM d')}.`}
          description={
            canEdit
              ? 'Sign in to log this day.'
              : 'No site activity has been recorded for this date yet.'
          }
        />
      )}
    </div>
  );
}

function EntryForm({
  project, currentUser, date,
}: {
  project: Project;
  currentUser: User;
  date: string;
}) {
  const addEntry = useGanttSideStore((s) => s.addDiaryEntry);

  const [description, setDescription] = useState('');
  const [weather, setWeather] = useState<WeatherKind | ''>('');
  const [temperatureF, setTemperatureF] = useState('');
  const [personnel, setPersonnel] = useState<Omit<DiaryPersonnel, 'id'>[]>([
    { workerId: '', workerName: '', hours: 8, role: '', company: '' },
  ]);

  const updatePerson = (idx: number, patch: Partial<DiaryPersonnel>) => {
    setPersonnel((p) => p.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addRow = () => {
    setPersonnel((p) => [
      ...p,
      { workerId: '', workerName: '', hours: 8, role: '', company: '' },
    ]);
  };
  const removeRow = (idx: number) => {
    setPersonnel((p) => p.filter((_, i) => i !== idx));
  };

  const totalHours = personnel.reduce((sum, p) => sum + (Number(p.hours) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    addEntry(project.id, {
      date,
      description: description.trim(),
      weather: weather || undefined,
      temperatureF: temperatureF ? Number(temperatureF) : undefined,
      personnel: personnel
        .filter((p) => p.workerName.trim())
        .map((p) => ({
          id: `dp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          workerId: p.workerId || `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          workerName: p.workerName.trim(),
          hours: Number(p.hours) || 0,
          role: p.role.trim(),
          company: p.company.trim(),
        })),
      photoIds: [],
      createdBy: currentUser.id,
    });

    setDescription('');
    setWeather('');
    setTemperatureF('');
    setPersonnel([{ workerId: '', workerName: '', hours: 8, role: '', company: '' }]);
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Log day
            </p>
            <h3
              className="mt-1 text-lg font-semibold text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {format(parseISO(date), 'EEEE, MMMM d')}
            </h3>
          </div>

          {/* Conditions */}
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Weather</label>
              <div className="flex flex-wrap gap-1.5">
                {WEATHER_OPTS.map(({ value, label, Icon }) => {
                  const isOn = weather === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setWeather(isOn ? '' : value)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isOn
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Temp (°F)</label>
              <Input
                type="number"
                inputMode="numeric"
                value={temperatureF}
                onChange={(e) => setTemperatureF(e.target.value)}
                placeholder="68"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Description of works
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
              placeholder="Foundation pour started in zone B; framing crew finished L1 corridor; inspector visited at 14:00…"
              className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Personnel rows */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label className="text-xs font-medium text-slate-600">
                Personnel on site
              </label>
              <span className="tabular-nums text-[11px] text-slate-500">
                {personnel.length} {personnel.length === 1 ? 'row' : 'rows'} · {totalHours}h total
              </span>
            </div>
            <div className="space-y-2">
              {personnel.map((p, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_1fr_1fr_80px_36px]"
                >
                  <Input
                    value={p.workerName}
                    onChange={(e) => updatePerson(idx, { workerName: e.target.value })}
                    placeholder="Name"
                  />
                  <Input
                    value={p.role}
                    onChange={(e) => updatePerson(idx, { role: e.target.value })}
                    placeholder="Role (electrician)"
                  />
                  <Input
                    value={p.company}
                    onChange={(e) => updatePerson(idx, { company: e.target.value })}
                    placeholder="Company"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={p.hours}
                    onChange={(e) => updatePerson(idx, { hours: Number(e.target.value) || 0 })}
                    placeholder="hrs"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={personnel.length === 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-emerald-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another worker
            </button>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={!description.trim()}>
              Save diary entry
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EntryCard({
  entry, project, canEdit,
}: {
  entry: DiaryEntry;
  project: Project;
  canEdit: boolean;
}) {
  const removeEntry = useGanttSideStore((s) => s.removeDiaryEntry);
  const removePersonnel = useGanttSideStore((s) => s.removeDiaryPersonnel);

  const totalHours = entry.personnel.reduce((sum, p) => sum + p.hours, 0);
  const weatherOpt = WEATHER_OPTS.find((w) => w.value === entry.weather);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Site diary
            </p>
            <h3
              className="mt-1 text-xl font-semibold text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {format(parseISO(entry.date), 'EEEE, MMMM d')}
            </h3>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this diary entry?')) removeEntry(project.id, entry.id);
              }}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500"
              aria-label="Delete entry"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </header>

        {/* Conditions strip */}
        {(entry.weather || entry.temperatureF !== undefined) && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {weatherOpt && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                <weatherOpt.Icon className="h-3 w-3" />
                {weatherOpt.label}
              </span>
            )}
            {entry.temperatureF !== undefined && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 tabular-nums">
                {entry.temperatureF}°F
              </span>
            )}
          </div>
        )}

        {/* Description */}
        <p className="mb-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {entry.description}
        </p>

        {/* Personnel summary */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Personnel ({entry.personnel.length})
            </h4>
            <span className="tabular-nums text-xs text-slate-500">{totalHours}h total</span>
          </div>

          {entry.personnel.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-4 text-center text-sm text-slate-400">
              No personnel logged for this day.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {entry.personnel.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar className="h-7 w-7 flex-shrink-0">
                    <AvatarFallback className="text-[10px] font-semibold">
                      {initials(p.workerName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{p.workerName}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {p.role}
                      {p.company && p.company !== '—' && <> · {p.company}</>}
                    </p>
                  </div>
                  <span className="flex-shrink-0 tabular-nums text-sm text-slate-700">
                    {p.hours}h
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removePersonnel(project.id, entry.id, p.id)}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="Remove worker"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

// ─── Workers view ──────────────────────────────────────────────────────────
// Roll up hours per worker across every diary entry. Tap a worker to see
// their per-day breakdown.

interface WorkerRollup {
  workerId: string;
  workerName: string;
  role: string;
  company: string;
  totalHours: number;
  daysOnSite: number;
  perDay: { date: string; hours: number; role: string }[];
}

function WorkersView({ entries }: { entries: DiaryEntry[] }) {
  const [drilledWorkerId, setDrilledWorkerId] = useState<string | null>(null);

  const rollups = useMemo<WorkerRollup[]>(() => {
    const byKey = new Map<string, WorkerRollup>();
    // Sort entries chronologically so the perDay sub-list reads top→bottom
    // as "first day on site → most recent."
    const ordered = [...entries].sort(
      (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime(),
    );

    for (const e of ordered) {
      for (const p of e.personnel) {
        // Workers sometimes appear under different IDs (legacy "manual_*"),
        // so key by name+company too — keeps the rollup honest even when the
        // ID is generated.
        const key = p.workerId === 'legacy' || p.workerId.startsWith('manual_')
          ? `name:${p.workerName.toLowerCase()}|${(p.company ?? '').toLowerCase()}`
          : p.workerId;

        const existing = byKey.get(key);
        if (existing) {
          existing.totalHours += p.hours;
          existing.daysOnSite += 1;
          existing.perDay.push({ date: e.date, hours: p.hours, role: p.role });
        } else {
          byKey.set(key, {
            workerId: key,
            workerName: p.workerName,
            role: p.role,
            company: p.company,
            totalHours: p.hours,
            daysOnSite: 1,
            perDay: [{ date: e.date, hours: p.hours, role: p.role }],
          });
        }
      }
    }

    return [...byKey.values()].sort((a, b) => b.totalHours - a.totalHours);
  }, [entries]);

  const drilled = drilledWorkerId
    ? rollups.find((r) => r.workerId === drilledWorkerId)
    : null;

  if (rollups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No personnel logged yet."
        description="As soon as a diary entry includes workers, hours roll up here."
      />
    );
  }

  if (drilled) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrilledWorkerId(null)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="text-xs font-semibold">
                {initials(drilled.workerName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-lg font-semibold text-slate-900"
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              >
                {drilled.workerName}
              </p>
              <p className="truncate text-xs text-slate-500">
                {drilled.role}
                {drilled.company && drilled.company !== '—' && <> · {drilled.company}</>}
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p
                className="text-2xl font-semibold tabular-nums text-emerald-600"
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              >
                {drilled.totalHours}h
              </p>
              <p className="text-[11px] text-slate-500">{drilled.daysOnSite} days</p>
            </div>
          </div>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {drilled.perDay.map((row, idx) => (
              <li key={`${row.date}-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-shrink-0 rounded-md bg-slate-50 px-2 py-1 text-center">
                  <p className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
                    {format(parseISO(row.date), 'MMM')}
                  </p>
                  <p
                    className="text-base font-semibold tabular-nums leading-none text-slate-900"
                    style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  >
                    {format(parseISO(row.date), 'd')}
                  </p>
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-slate-700">
                  {row.role || '—'}
                </p>
                <span className="flex-shrink-0 tabular-nums text-sm font-medium text-slate-900">
                  {row.hours}h
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  // Roll-up list (mobile cards / desktop rows)
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium text-slate-900">Hours per worker</h3>
            <span className="text-xs text-slate-500">
              {rollups.length} {rollups.length === 1 ? 'person' : 'people'}
            </span>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {rollups.map((r) => (
            <li key={r.workerId}>
              <button
                type="button"
                onClick={() => setDrilledWorkerId(r.workerId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5"
              >
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback className="text-xs font-semibold">
                    {initials(r.workerName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{r.workerName}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {r.role || 'Mixed roles'}
                    {r.company && r.company !== '—' && <> · {r.company}</>}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="tabular-nums text-sm font-semibold text-slate-900">
                    {r.totalHours}h
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {r.daysOnSite} {r.daysOnSite === 1 ? 'day' : 'days'}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Calendar view ─────────────────────────────────────────────────────────
// Month grid; days with diary entries get a colored dot + headcount badge.
// Heatmap mode shades cells by total hours so the eye spots intense weeks.

function CalendarView({
  entries, onJumpToDay,
}: {
  entries: DiaryEntry[];
  onJumpToDay: (date: string) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(today);
  const [heatmap, setHeatmap] = useState(false);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad to align Monday in column 1.
  const firstDow = monthStart.getDay();
  const padBefore = (firstDow + 6) % 7;
  const cells: (Date | null)[] = [
    ...Array.from({ length: padBefore }, () => null),
    ...days,
  ];

  // Pre-compute the entry + total hours for every day in the month.
  const dayMap = useMemo(() => {
    const m = new Map<string, { entry: DiaryEntry; hours: number; people: number }>();
    for (const e of entries) {
      const d = parseISO(e.date);
      if (!isSameMonth(d, cursor)) continue;
      const hours = e.personnel.reduce((s, p) => s + p.hours, 0);
      m.set(e.date, { entry: e, hours, people: e.personnel.length });
    }
    return m;
  }, [entries, cursor]);

  const maxHoursInMonth = useMemo(() => {
    let max = 0;
    for (const { hours } of dayMap.values()) if (hours > max) max = hours;
    return max;
  }, [dayMap]);

  const heatColor = (hours: number) => {
    if (!heatmap || maxHoursInMonth === 0) return '';
    const ratio = hours / maxHoursInMonth;
    if (ratio > 0.75) return 'bg-emerald-200';
    if (ratio > 0.5)  return 'bg-emerald-100';
    if (ratio > 0.25) return 'bg-emerald-50';
    return 'bg-slate-50/40';
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        {/* Month nav + heatmap toggle */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3
              className="text-sm font-medium text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {format(cursor, 'MMMM yyyy')}
            </h3>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setHeatmap((h) => !h)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              heatmap
                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Wrench className="h-3 w-3" />
            Heatmap
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((dow) => (
            <div
              key={dow}
              className="bg-slate-50 px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-slate-500"
            >
              {dow}
            </div>
          ))}

          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} className="aspect-square bg-white" />;

            const iso = d.toISOString().slice(0, 10);
            const dayInfo = dayMap.get(iso);
            const isCurrent = isSameDay(d, today);
            const heatBg = dayInfo ? heatColor(dayInfo.hours) : '';

            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  if (dayInfo) onJumpToDay(iso);
                }}
                className={`group relative aspect-square min-h-[60px] p-1 text-left transition-colors sm:p-1.5 ${heatBg || 'bg-white'} ${
                  isCurrent ? 'ring-1 ring-inset ring-emerald-400' : ''
                } ${dayInfo ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                disabled={!dayInfo}
              >
                <p className={`mb-1 text-[10px] font-medium ${isCurrent ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {format(d, 'd')}
                </p>
                {dayInfo && (
                  <div className="space-y-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      <Users className="h-2.5 w-2.5" />
                      {dayInfo.people}
                    </span>
                    <p className="truncate text-[9px] tabular-nums text-slate-600">
                      {dayInfo.hours}h
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 items-center rounded-full bg-emerald-600 px-1.5 text-[9px] font-medium text-white">
              <Users className="h-2.5 w-2.5" />
            </span>
            Headcount
          </span>
          {heatmap && (
            <span className="inline-flex items-center gap-1.5">
              Heat:
              <span className="inline-block h-3 w-3 rounded bg-slate-50/40 ring-1 ring-inset ring-slate-200" />
              <span className="inline-block h-3 w-3 rounded bg-emerald-50" />
              <span className="inline-block h-3 w-3 rounded bg-emerald-100" />
              <span className="inline-block h-3 w-3 rounded bg-emerald-200" />
            </span>
          )}
        </div>

        {dayMap.size === 0 && (
          <p className="mt-4 text-center text-xs text-slate-400">
            No diary entries this month. Switch months with the arrows or log today's entry.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function initials(name: string): string {
  if (!name) return '??';
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}