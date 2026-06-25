// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/QuoteSchedule.tsx — the quote's "Schedule" tab (Simpro replication,
// Phase 1 Part 9).
//
// Plan WHO works the job: pick employees from the Available Resources rail and
// schedule them with hours + an optional date/start/finish, costed at a labour
// role's rate. Internal planning view — it does NOT feed the quote total (the
// Billable → Labour lines stay the costed source). Contractors + Plant have no
// data model yet, so they show an honest "coming soon". The job-site map is
// deferred (no map library / coordinates) — we show the address + a Maps link.
//
// Manager-gated surface; cost shown only when canSeeCost. Screen-only (print:hidden).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, MapPin, ExternalLink, Users, Truck, Wrench } from "lucide-react";

import {
  listScheduleResources,
  addScheduleResource,
  updateScheduleResource,
  removeScheduleResource,
  type ScheduleResource,
} from "../../lib/api/quoteSchedule";
import { listProfilesByRole } from "../../lib/api/profiles";
import { listLabourRates, ratesMap, formatRole } from "../../lib/api/labourRates";
import { getProperty, type Property } from "../../lib/api/properties";
import type { Profile, SecurityGroup } from "../../types";

// Internal staff eligible to be scheduled (mirrors QuoteEditor's INTERNAL_GROUPS).
const INTERNAL_GROUPS: SecurityGroup[] = ["company_admin", "construction_mgr", "project_manager", "worker", "dev"];
const fullName = (p: Profile) => `${p.firstName} ${p.lastName}`.trim() || p.email;

function fmtMoney(n: number): string {
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmtHours(n: number): string {
  return n.toFixed(2);
}

interface Props {
  quoteId: string;
  propertyId: string | null;
  canSeeCost: boolean;
  isLocked: boolean;
  onToast?: (message: string, type: "success" | "error" | "info") => void;
}

const INPUT =
  "rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-sm text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:bg-[#FAF8F2] disabled:text-[#6B6B6B]";

export default function QuoteSchedule({ quoteId, propertyId, canSeeCost, isLocked, onToast }: Props) {
  const [resources, setResources] = useState<ScheduleResource[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [rates, setRates] = useState<Map<string, number | null>>(new Map());
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listScheduleResources(quoteId)
      .then((r) => { if (!cancelled) setResources(r); })
      .catch((ex) => { if (!cancelled) onToast?.(ex instanceof Error ? ex.message : "Failed to load schedule", "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    void listProfilesByRole(INTERNAL_GROUPS).then((p) => { if (!cancelled) setStaff(p); }).catch(() => {});
    void listLabourRates(false).then((rs) => { if (!cancelled) setRoles(rs.map((r) => r.role)); }).catch(() => {});
    void ratesMap().then((m) => { if (!cancelled) setRates(m); }).catch(() => {});
    return () => { cancelled = true; };
  }, [quoteId, onToast]);

  useEffect(() => {
    let cancelled = false;
    if (!propertyId) { setProperty(null); return; }
    void getProperty(propertyId).then((p) => { if (!cancelled) setProperty(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [propertyId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const estHours = useMemo(() => resources.reduce((s, r) => s + r.hours, 0), [resources]);

  const hoursByProfile = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resources) if (r.profileId) m.set(r.profileId, (m.get(r.profileId) ?? 0) + r.hours);
    return m;
  }, [resources]);

  function rowCost(r: ScheduleResource): number | null {
    if (!r.role) return null;
    const rate = rates.get(r.role);
    return rate == null ? null : Math.round(r.hours * rate * 100) / 100;
  }

  // ── Mutations (optimistic local + persist) ────────────────────────────────
  async function handleAddEmployee(p: Profile) {
    if (isLocked || adding) return;
    setAdding(true);
    try {
      const created = await addScheduleResource({
        quoteId,
        resourceType: "employee",
        profileId: p.id,
        resourceLabel: fullName(p),
        hours: 0,
        sortOrder: resources.length,
      });
      setResources((prev) => [...prev, created]);
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to schedule resource", "error");
    } finally {
      setAdding(false);
    }
  }

  function patchLocal(id: string, patch: Partial<ScheduleResource>) {
    setResources((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function persist(id: string, patch: Parameters<typeof updateScheduleResource>[1]) {
    try {
      await updateScheduleResource(id, patch);
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to save change", "error");
      const fresh = await listScheduleResources(quoteId).catch(() => null);
      if (fresh) setResources(fresh);
    }
  }

  async function handleRemove(id: string) {
    if (isLocked) return;
    setBusyId(id);
    try {
      await removeScheduleResource(id);
      setResources((prev) => prev.filter((x) => x.id !== id));
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to remove resource", "error");
    } finally {
      setBusyId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-6 text-sm text-[#A0A0A0] print:hidden">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…
      </div>
    );
  }

  const mapsHref = property?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([property.address, property.suburb].filter(Boolean).join(", "))}`
    : null;

  const colCount = 5 + (canSeeCost ? 2 : 0) + (!isLocked ? 1 : 0);

  return (
    <div className="print:hidden">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Available Resources ─────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Available resources</h3>

          {/* Employees */}
          <div className="overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white">
            <div className="flex items-center gap-2 border-b border-[#EFEBE0] bg-[#FAF8F2] px-3 py-2">
              <Users className="h-4 w-4 text-[#2F8F5C]" />
              <span className="text-sm font-semibold text-[#1A1A1A]">Employees</span>
              <span className="ml-auto text-[11px] uppercase tracking-wider text-[#A0A0A0]">Hrs</span>
            </div>
            {staff.length === 0 && <p className="px-3 py-4 text-xs text-[#A0A0A0]">No staff found.</p>}
            <ul className="divide-y divide-[#EFEBE0]">
              {staff.map((p) => {
                const hrs = hoursByProfile.get(p.id) ?? 0;
                return (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-[#1A1A1A]">{fullName(p)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-[#6B6B6B]">{fmtHours(hrs)}</span>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => void handleAddEmployee(p)}
                        disabled={adding}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2] disabled:opacity-60"
                        aria-label={`Schedule ${fullName(p)}`}
                      >
                        <Plus className="h-3.5 w-3.5" /> Schedule
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Contractors + Plant — no data model yet */}
          {[{ icon: Truck, label: "Contractors" }, { icon: Wrench, label: "Plant" }].map(({ icon: Icon, label }) => (
            <div key={label} className="mt-3 overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white">
              <div className="flex items-center gap-2 border-b border-[#EFEBE0] bg-[#FAF8F2] px-3 py-2">
                <Icon className="h-4 w-4 text-[#A0A0A0]" />
                <span className="text-sm font-semibold text-[#1A1A1A]">{label}</span>
              </div>
              <p className="px-3 py-3 text-xs text-[#A0A0A0]">Not set up yet — coming soon.</p>
            </div>
          ))}
        </div>

        {/* ── Scheduled Resources ─────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Scheduled resources</h3>
            <p className="text-xs text-[#6B6B6B]">
              Est time: <span className="font-semibold tabular-nums text-[#3A3A3A]">{fmtHours(estHours)}</span>
              <span className="mx-2 text-[#D8D2C4]">·</span>
              Act time: <span className="font-semibold tabular-nums text-[#3A3A3A]">0.00</span>
            </p>
          </div>

          <div className="overflow-x-auto rounded-[10px] border border-[#E6E1D4] bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Employee</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Date</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Hours</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Start</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Finish</th>
                  {canSeeCost && <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Role</th>}
                  {canSeeCost && <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Cost</th>}
                  {!isLocked && <th className="w-10 px-3 py-2.5" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEBE0]">
                {resources.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-3 py-10 text-center text-sm text-[#A0A0A0]">
                      No resources have been scheduled to this cost centre.
                    </td>
                  </tr>
                )}
                {resources.map((r) => {
                  const cost = rowCost(r);
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-[#1A1A1A]">{r.resourceLabel ?? "—"}</td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={r.scheduledDate ?? ""}
                          disabled={isLocked}
                          onChange={(e) => { patchLocal(r.id, { scheduledDate: e.target.value || null }); void persist(r.id, { scheduledDate: e.target.value || null }); }}
                          className={INPUT}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          value={r.hours}
                          disabled={isLocked}
                          onChange={(e) => patchLocal(r.id, { hours: parseFloat(e.target.value) || 0 })}
                          onBlur={(e) => void persist(r.id, { hours: parseFloat(e.target.value) || 0 })}
                          className={`${INPUT} w-20 text-right tabular-nums`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={r.startTime ?? ""}
                          disabled={isLocked}
                          onChange={(e) => patchLocal(r.id, { startTime: e.target.value || null })}
                          onBlur={(e) => void persist(r.id, { startTime: e.target.value || null })}
                          className={INPUT}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={r.finishTime ?? ""}
                          disabled={isLocked}
                          onChange={(e) => patchLocal(r.id, { finishTime: e.target.value || null })}
                          onBlur={(e) => void persist(r.id, { finishTime: e.target.value || null })}
                          className={INPUT}
                        />
                      </td>
                      {canSeeCost && (
                        <td className="px-3 py-2">
                          <select
                            value={r.role ?? ""}
                            disabled={isLocked}
                            onChange={(e) => { const v = e.target.value || null; patchLocal(r.id, { role: v }); void persist(r.id, { role: v }); }}
                            className={INPUT}
                          >
                            <option value="">— rate —</option>
                            {roles.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
                          </select>
                        </td>
                      )}
                      {canSeeCost && (
                        <td className="px-3 py-2 text-right tabular-nums text-[#3A3A3A]">{cost == null ? "—" : fmtMoney(cost)}</td>
                      )}
                      {!isLocked && (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void handleRemove(r.id)}
                            disabled={busyId === r.id}
                            className="rounded p-1 text-[#A0A0A0] hover:text-[#C44545] disabled:opacity-50"
                            aria-label="Remove"
                          >
                            {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {canSeeCost && resources.some((r) => !r.role) && (
            <p className="mt-2 text-[11px] text-[#A0A0A0]">Pick a role to cost a scheduled resource. Scheduling here is for planning — it doesn&rsquo;t change the quote total (set billable hours in Parts &amp; Labour → Billable).</p>
          )}

          {/* ── Job site ──────────────────────────────────────────────────── */}
          <div className="mt-5 rounded-[10px] border border-[#E6E1D4] bg-white p-4">
            <div className="mb-1 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#2F8F5C]" />
              <span className="text-sm font-semibold text-[#1A1A1A]">Job site</span>
            </div>
            {property ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-[#3A3A3A]">
                  <span className="font-medium text-[#1A1A1A]">{property.name}</span>
                  {property.address && <span> · {property.address}</span>}
                  {property.suburb && <span>, {property.suburb}</span>}
                </div>
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[#E6E1D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#2F8F5C] hover:bg-[#FAF8F2]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Maps
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#A0A0A0]">No site set for this quote.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
