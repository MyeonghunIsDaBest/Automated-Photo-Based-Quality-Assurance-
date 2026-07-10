// JobBoxSection — "Job box" allocations inside the job drawer (P4, migration 95).
//
// Manager packs factory stock for the job and assigns it to the scheduled tech;
// nothing moves until the tech ACCEPTS at pickup (My Van), which transfers the
// stock to their van and stamps who took it. This section shows the job's boxes
// with status, lets managers pack a new one (source + lines + assignee), cancel
// a pending one, and — beneath — surfaces "Materials used (from vans)", the
// job-costed usage that recordUsage has been collecting.
//
// Shortfalls are flagged honestly but never block: the physical box is truth.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin, Package, Plus, Search, Trash2, X } from 'lucide-react';
import {
  listJobAllocations,
  listStockLocations,
  listStockLevels,
  createAllocation,
  cancelAllocation,
  allocationShortfalls,
  getJobUsage,
  getCompanyTotals,
  siteLocationForJob,
  type JobKind,
  type StockAllocation,
  type StockLocation,
  type StockLevel,
  type JobUsage,
  type AllocationStatus,
} from '../../lib/api/stock';
import type { Profile } from '../../types';

const STATUS_PILL: Record<AllocationStatus, { label: string; cls: string }> = {
  pending:   { label: 'Waiting for pickup', cls: 'bg-[#F9EFD9] text-[#C8841E] border-[#E8D8B5]' },
  accepted:  { label: 'Accepted',           cls: 'bg-[#E5F2EA] text-[#246F47] border-[#C8E0D2]' },
  declined:  { label: 'Declined',           cls: 'bg-[#FBE5E5] text-[#C44545] border-[#F0C8C8]' },
  cancelled: { label: 'Cancelled',          cls: 'bg-[#ECE8DE] text-[#6B6B6B] border-[#DAD3C4]' },
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function profileName(p: Profile): string {
  return `${p.firstName} ${p.lastName}`.trim() || p.email;
}

interface Props {
  jobId: string;
  jobKind: JobKind;
  canManage: boolean;
  profiles: Profile[];
  /** The job's assigned tech — default recipient for a new box. */
  defaultAssignee: string | null;
  /** Prefills for the "create site location" shortcut (migration 96). */
  jobTitle?: string;
  jobAddress?: string | null;
  onChanged: () => void;
}

export function JobBoxSection({ jobId, jobKind, canManage, profiles, defaultAssignee, jobTitle, jobAddress, onChanged }: Props) {
  const [allocations, setAllocations] = useState<StockAllocation[]>([]);
  const [usage, setUsage] = useState<JobUsage | null>(null);
  const [usageNames, setUsageNames] = useState<Map<string, { name: string; unit: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteNotice, setSiteNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Usage + totals are manager-only: worker RLS scopes movements/levels to
      // their own van, which would render a misleadingly partial cost picture.
      const [allocs, use, totals] = await Promise.all([
        listJobAllocations(jobId, jobKind),
        canManage ? getJobUsage(jobId, jobKind) : Promise.resolve(null),
        canManage ? getCompanyTotals() : Promise.resolve([]),
      ]);
      setAllocations(allocs);
      setUsage(use);
      setUsageNames(new Map(totals.map((t) => [t.materialId, { name: t.name, unit: t.unit }])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load job boxes.');
    } finally {
      setLoading(false);
    }
  }, [jobId, jobKind, canManage]);

  useEffect(() => { void load(); }, [load]);

  const handleCreateSite = async () => {
    setSiteBusy(true);
    setSiteNotice(null);
    try {
      const { location, created, reactivated } = await siteLocationForJob(jobId, jobKind, {
        name: jobTitle ? `Site — ${jobTitle}` : 'Job site',
        address: jobAddress ?? null,
      });
      setSiteNotice(created
        ? `Site location "${location.name}" created — stock it under Stock → Locations.`
        : reactivated
          ? `Archived site "${location.name}" reactivated (its stock history is intact) — see Stock → Locations.`
          : `This job already has a site location ("${location.name}") — see Stock → Locations.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the site location.');
    } finally {
      setSiteBusy(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await cancelAllocation(id);
      setConfirmCancelId(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Job box
        </label>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCreateSite()}
              disabled={siteBusy}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
            >
              {siteBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
              Create site location
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-emerald-500 hover:text-emerald-700"
            >
              <Plus className="h-3 w-3" />
              Allocate stock
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}
      {siteNotice && <p className="mb-2 rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">{siteNotice}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : allocations.length === 0 ? (
        <p className="text-sm text-slate-400">
          No stock allocated yet{canManage ? ' — pack a box so the tech can accept it at pickup.' : '.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {allocations.map((a) => {
            const value = a.lines.reduce((s, l) => s + (l.unitCost != null ? l.qty * l.unitCost : 0), 0);
            const assignee = profiles.find((p) => p.id === a.assignedTo);
            return (
              <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate text-sm font-medium text-slate-900">
                      {a.lines.length} item{a.lines.length !== 1 ? 's' : ''}
                      {value > 0 ? ` · ${money(Math.round(value * 100) / 100)}` : ''}
                      {assignee ? ` · ${profileName(assignee)}` : ''}
                    </span>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_PILL[a.status].cls}`}>
                    {STATUS_PILL[a.status].label}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {a.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  From {a.sourceLocationName}
                  {a.acceptedAt ? ` · accepted ${new Date(a.acceptedAt).toLocaleDateString()}` : ''}
                </p>
                {a.status === 'declined' && a.declineNote && (
                  <p className="mt-1 rounded bg-[#FBE5E5] px-2 py-1 text-[11px] text-[#C44545]">
                    Declined: {a.declineNote}
                  </p>
                )}
                {canManage && a.status === 'pending' && (
                  <div className="mt-1.5 flex justify-end">
                    {confirmCancelId === a.id ? (
                      <span className="inline-flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500">Cancel this box?</span>
                        <button
                          type="button"
                          onClick={() => void handleCancel(a.id)}
                          disabled={cancellingId === a.id}
                          className="font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {cancellingId === a.id ? 'Cancelling…' : 'Yes, cancel'}
                        </button>
                        <button type="button" onClick={() => setConfirmCancelId(null)} className="text-slate-500 hover:text-slate-700">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(a.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                        Cancel box
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Materials used (from vans) — job-costed usage, finally on screen */}
      {usage && usage.lines.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Materials used (from vans)
          </p>
          <ul className="space-y-0.5">
            {usage.lines.map((l, i) => {
              const named = usageNames.get(l.materialId);
              return (
                <li key={i} className="flex items-center justify-between text-xs text-slate-600">
                  <span>{l.qty}{named ? ` ${named.unit}` : '×'} {named?.name ?? '(item)'}</span>
                  <span className="tabular-nums">{l.unitCost != null ? money(l.cost) : '—'}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 flex items-center justify-between border-t border-slate-200 pt-1.5 text-xs font-semibold text-slate-900">
            <span>Total materials cost</span>
            <span className="tabular-nums">{money(usage.totalCost)}</span>
          </p>
        </div>
      )}

      {modalOpen && (
        <AllocateStockModal
          jobId={jobId}
          jobKind={jobKind}
          profiles={profiles}
          defaultAssignee={defaultAssignee}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            void load();
            onChanged();
          }}
        />
      )}
    </section>
  );
}

// ─── Allocate modal ───────────────────────────────────────────────────────────

interface DraftLine {
  materialId: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number | null;
}

function AllocateStockModal({ jobId, jobKind, profiles, defaultAssignee, onClose, onCreated }: {
  jobId: string;
  jobKind: JobKind;
  profiles: Profile[];
  defaultAssignee: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [sourceId, setSourceId] = useState<string>('');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [assignee, setAssignee] = useState<string>(defaultAssignee ?? '');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Locations once; default source = factory.
  useEffect(() => {
    let alive = true;
    listStockLocations()
      .then((locs) => {
        if (!alive) return;
        setLocations(locs);
        const factory = locs.find((l) => l.type === 'factory');
        setSourceId((prev) => prev || factory?.id || locs[0]?.id || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load locations.'));
    return () => { alive = false; };
  }, []);

  // Levels per source.
  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    setLevelsLoading(true);
    listStockLevels(sourceId)
      .then((ls) => { if (alive) setLevels(ls); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load stock levels.'))
      .finally(() => { if (alive) setLevelsLoading(false); });
    return () => { alive = false; };
  }, [sourceId]);

  const shortfalls = useMemo(
    () => allocationShortfalls(levels, lines),
    [levels, lines],
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inLines = new Set(lines.map((l) => l.materialId));
    const pool = levels.filter((l) => !inLines.has(l.materialId));
    if (!q) return pool.slice(0, 8);
    return pool
      .filter((l) => l.name.toLowerCase().includes(q) || (l.sku ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [levels, lines, search]);

  const addLine = (lvl: StockLevel) => {
    setLines((prev) => [...prev, {
      materialId: lvl.materialId,
      name: lvl.name,
      unit: lvl.unit,
      qty: 1,
      unitCost: lvl.costPrice,
    }]);
    setSearch('');
  };

  const setQty = (materialId: string, qty: number) => {
    setLines((prev) => prev.map((l) => (l.materialId === materialId ? { ...l, qty } : l)));
  };

  const removeLine = (materialId: string) => {
    setLines((prev) => prev.filter((l) => l.materialId !== materialId));
  };

  const handleCreate = async () => {
    if (!assignee) { setError('Pick who the box is for.'); return; }
    const valid = lines.filter((l) => l.qty > 0);
    if (valid.length === 0) { setError('Add at least one item.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createAllocation({
        jobId,
        jobKind,
        sourceLocationId: sourceId,
        assignedTo: assignee,
        note: note.trim() || null,
        lines: valid.map((l) => ({ materialId: l.materialId, qty: l.qty, unitCost: l.unitCost })),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create the job box.');
      setSaving(false);
    }
  };

  const boxValue = lines.reduce((s, l) => s + (l.unitCost != null ? l.qty * l.unitCost : 0), 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Allocate stock — pack a job box</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">From</label>
              <select
                value={sourceId}
                onChange={(e) => { setSourceId(e.target.value); setLines([]); }}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">For (accepts at pickup)</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Pick a tech…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{profileName(p)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Item search over the source location's stock */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Add items</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={levelsLoading ? 'Loading stock…' : 'Search this location’s stock (name or SKU)…'}
                disabled={levelsLoading}
                className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-slate-200">
                {results.map((lvl) => (
                  <li key={lvl.id}>
                    <button
                      type="button"
                      onClick={() => addLine(lvl)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50"
                    >
                      <span className="truncate text-slate-900">{lvl.name}{lvl.sku ? <span className="ml-1.5 font-mono text-[11px] text-slate-400">{lvl.sku}</span> : null}</span>
                      <span className={`ml-2 shrink-0 text-xs tabular-nums ${lvl.qty <= 0 ? 'text-red-500' : 'text-slate-500'}`}>
                        {lvl.qty} on hand
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Draft lines */}
          {lines.length > 0 && (
            <ul className="space-y-1.5">
              {lines.map((l) => {
                const short = shortfalls.get(l.materialId);
                return (
                  <li key={l.materialId} className="rounded-md border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-slate-900">{l.name}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          type="number"
                          min={0.01}
                          step={1}
                          value={Number.isFinite(l.qty) ? l.qty : ''}
                          onChange={(e) => setQty(l.materialId, Number(e.target.value))}
                          className="h-9 w-20 rounded-md border border-slate-200 px-2 text-right text-sm tabular-nums focus:border-emerald-500 focus:outline-none"
                        />
                        <span className="w-6 text-xs text-slate-400">{l.unit}</span>
                        <button
                          type="button"
                          onClick={() => removeLine(l.materialId)}
                          className="rounded p-1.5 text-slate-400 hover:text-red-600"
                          aria-label={`Remove ${l.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {short && (
                      <p className="mt-1 text-[11px] font-medium text-[#C8841E]">
                        Only {short.onHand} on hand here — box will be {short.short} short (allowed; the physical box is truth).
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Box on rack B, near the roller door"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-[11px] text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              {lines.length} item{lines.length !== 1 ? 's' : ''}{boxValue > 0 ? ` · ${money(Math.round(boxValue * 100) / 100)} cost value` : ''}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={saving || lines.length === 0 || !assignee}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create job box
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
