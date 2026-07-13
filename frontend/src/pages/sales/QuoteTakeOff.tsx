// ─────────────────────────────────────────────────────────────────────────────
// pages/sales/QuoteTakeOff.tsx — the "Take Off" sub-tab of a quote's Parts &
// Labour strip (Simpro replication, Phase 1 Part 4).
//
// A browsable, searchable library of pre-built service bundles ("take-offs").
// A Take-Off GROUP = a quote_templates.category; each PART = a template in that
// category. Type a quantity against a part and hit Add to drop its lines onto
// the quote (applyTemplateToQuote with a qty multiplier). Expanding a part lazily
// loads its items so you can see what's inside before adding.
//
// This panel is screen-only (the parent renders it inside a print:hidden block);
// the printed quote is the Billable tables, not this add UI. Cost is shown only
// when canSeeCost (manager) — never to field/customer surfaces.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Search, X, ChevronRight, ChevronDown, Plus, Loader2, Layers } from "lucide-react";

import {
  listTemplates,
  getTemplateWithItems,
  applyTemplateToQuote,
  type QuoteTemplate,
  type QuoteTemplateItem,
} from "../../lib/api/quoteTemplates";
import { listMaterials, listPrebuilds, type Material, type Prebuild } from "../../lib/api/materials";
import { ratesMap, formatRole } from "../../lib/api/labourRates";
import { getCommercialSettings } from "../../lib/api/commercial";
import { fmtMoney } from "../../lib/format";

const OTHER_GROUP = "Other";

interface Props {
  quoteId: string;
  /** Manager-only — show cost alongside sell in the expanded "what's inside" view. */
  canSeeCost: boolean;
  /** Quote is sent/accepted/etc — render read-only (no qty inputs / Add). */
  isLocked: boolean;
  /** Called after a take-off is added so the parent can reload the quote + totals. */
  onAdded: () => void;
  /** Reuse the parent's Toaster (optional — falls back to no-op). */
  onToast?: (message: string, type: "success" | "error" | "info") => void;
  /** Cost centre new lines land in (null = General). */
  activeSectionId?: string | null;
}

/** A template item resolved to a display label + (possibly unknown) cost/sell. */
interface PricedLine {
  key: string;
  label: string;
  qty: number;
  cost: number | null;
  sell: number | null;
  isBundle: boolean;
}

interface Group {
  key: string;
  templates: QuoteTemplate[];
}

export default function QuoteTakeOff({ quoteId, canSeeCost, isLocked, onAdded, onToast, activeSectionId = null }: Props) {
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Pricing reference data — loaded once, used to price the expand view.
  const [materialsById, setMaterialsById] = useState<Map<string, Material>>(new Map());
  const [prebuildsById, setPrebuildsById] = useState<Map<string, Prebuild>>(new Map());
  const [rates, setRates] = useState<Map<string, number | null>>(new Map());
  const [markups, setMarkups] = useState<{ material: number; labour: number }>({ material: 0.25, labour: 0 });

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());
  const [itemsCache, setItemsCache] = useState<Record<string, QuoteTemplateItem[] | "loading">>({});
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // ── Load templates + pricing reference data ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listTemplates()
      .then((tpls) => {
        if (cancelled) return;
        setTemplates(tpls);
      })
      .catch((ex) => {
        if (!cancelled) setLoadError(ex instanceof Error ? ex.message : "Failed to load take-off groups");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Pricing refs (best-effort — the browse/add still works if any of these fail).
    void listMaterials().then((mats) => {
      if (!cancelled) setMaterialsById(new Map(mats.map((m) => [m.id, m])));
    }).catch(() => {});
    void listPrebuilds().then((pbs) => {
      if (!cancelled) setPrebuildsById(new Map(pbs.map((p) => [p.id, p])));
    }).catch(() => {});
    void ratesMap().then((m) => {
      if (!cancelled) setRates(m);
    }).catch(() => {});
    void getCommercialSettings().then((s) => {
      if (!cancelled && s) setMarkups({ material: s.defaultMaterialMarkup, labour: s.defaultLabourMarkup });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // ── Group templates by category ────────────────────────────────────────────
  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, QuoteTemplate[]>();
    for (const t of templates) {
      const key = t.category && t.category.trim() ? t.category.trim() : OTHER_GROUP;
      const arr = byKey.get(key);
      if (arr) arr.push(t);
      else byKey.set(key, [t]);
    }
    const keys = [...byKey.keys()].sort((a, b) => {
      if (a === OTHER_GROUP) return 1;
      if (b === OTHER_GROUP) return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => ({ key, templates: byKey.get(key)! }));
  }, [templates]);

  // ── Apply search filter (matches name + category) ──────────────────────────
  const term = search.trim().toLowerCase();
  const filteredGroups = useMemo<Group[]>(() => {
    if (!term) return groups;
    return groups
      .map((g) => ({
        key: g.key,
        templates: g.templates.filter(
          (t) =>
            t.name.toLowerCase().includes(term) ||
            (t.category ?? "").toLowerCase().includes(term) ||
            g.key.toLowerCase().includes(term),
        ),
      }))
      .filter((g) => g.templates.length > 0);
  }, [groups, term]);

  // While searching, every matching group is auto-expanded so nothing hides.
  const isGroupOpen = (key: string) => (term ? true : expandedGroups.has(key));

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function toggleTemplate(t: QuoteTemplate) {
    const open = expandedTemplates.has(t.id);
    setExpandedTemplates((prev) => {
      const next = new Set(prev);
      if (open) next.delete(t.id);
      else next.add(t.id);
      return next;
    });
    // Lazy-load items the first time it's expanded.
    if (!open && itemsCache[t.id] === undefined) {
      setItemsCache((prev) => ({ ...prev, [t.id]: "loading" }));
      try {
        const full = await getTemplateWithItems(t.id);
        setItemsCache((prev) => ({ ...prev, [t.id]: full?.items ?? [] }));
      } catch {
        setItemsCache((prev) => ({ ...prev, [t.id]: [] }));
      }
    }
  }

  /** Resolve a template's items to priced display lines using the loaded refs. */
  function priceItems(items: QuoteTemplateItem[]): PricedLine[] {
    return items.map((it, idx) => {
      const qty = it.qty || (it.kind === "labour" ? 0 : 1);
      if (it.kind === "material" && it.materialId) {
        const m = materialsById.get(it.materialId);
        if (!m) return { key: it.id ?? `m${idx}`, label: "Material", qty, cost: null, sell: null, isBundle: false };
        const unitCost = m.costPrice ?? 0;
        const unitSell = m.sellPrice != null ? m.sellPrice : (m.costPrice != null ? m.costPrice * (1 + markups.material) : 0);
        return { key: it.id ?? `m${idx}`, label: m.name, qty, cost: unitCost * qty, sell: unitSell * qty, isBundle: false };
      }
      if (it.kind === "labour" && it.role) {
        const rate = rates.get(it.role) ?? null;
        const unitCost = rate ?? 0;
        const unitSell = rate == null ? 0 : rate * (1 + markups.labour);
        return { key: it.id ?? `l${idx}`, label: `${formatRole(it.role)} · labour`, qty, cost: unitCost * qty, sell: unitSell * qty, isBundle: false };
      }
      if (it.kind === "prebuild" && it.prebuildId) {
        const pb = prebuildsById.get(it.prebuildId);
        return { key: it.id ?? `p${idx}`, label: `${pb?.name ?? "Bundle"} · prebuild`, qty, cost: null, sell: null, isBundle: true };
      }
      return { key: it.id ?? `x${idx}`, label: "Item", qty, cost: null, sell: null, isBundle: false };
    });
  }

  async function handleAdd(t: QuoteTemplate) {
    if (isLocked || applyingId) return;
    const qty = Math.max(1, Math.floor(qtys[t.id] ?? 1));
    setApplyingId(t.id);
    try {
      const n = await applyTemplateToQuote(quoteId, t.id, qty, activeSectionId);
      onAdded();
      onToast?.(
        `Added ${t.name}${qty > 1 ? ` ×${qty}` : ""} — ${n} line${n === 1 ? "" : "s"}`,
        "success",
      );
    } catch (ex) {
      onToast?.(ex instanceof Error ? ex.message : "Failed to add take-off", "error");
    } finally {
      setApplyingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mb-8 flex items-center gap-2 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-6 text-sm text-[#A0A0A0] print:hidden">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading take-off groups…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mb-8 rounded-[10px] border border-dashed border-[#E6C9C9] bg-[#FBF4F4] px-4 py-6 text-center text-sm text-[#C44545] print:hidden">
        {loadError}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="mb-8 rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-4 py-8 text-center text-sm text-[#A0A0A0] print:hidden">
        No take-off groups yet — create them in <span className="font-medium text-[#3A3A3A]">Catalogue → Templates</span> (set a category like
        Solar, Switchboards, or Mechanical to group them here).
      </div>
    );
  }

  const totalMatches = filteredGroups.reduce((n, g) => n + g.templates.length, 0);

  return (
    <div className="mb-8 print:hidden">
      {/* Search / filter — so staff don't bounce between groups to find a part. */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search take-off parts across all groups…"
            className="w-full rounded-md border border-[#E6E1D4] bg-white py-2 pl-9 pr-9 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#A0A0A0] hover:text-[#C44545]"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {term && (
        <p className="mb-2 text-[11px] text-[#A0A0A0]">
          {totalMatches} {totalMatches === 1 ? "part" : "parts"} matching &ldquo;{search.trim()}&rdquo;
        </p>
      )}

      {filteredGroups.length === 0 && (
        <div className="rounded-[10px] border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-4 py-6 text-center text-sm text-[#A0A0A0]">
          No parts match &ldquo;{search.trim()}&rdquo;.
        </div>
      )}

      <div className="space-y-2">
        {filteredGroups.map((g) => {
          const open = isGroupOpen(g.key);
          return (
            <div key={g.key} className="overflow-hidden rounded-[10px] border border-[#E6E1D4] bg-white">
              {/* Group header */}
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                className="flex w-full items-center gap-2 bg-[#FAF8F2] px-3 py-2.5 text-left hover:bg-[#F4F1E8]"
              >
                {open ? <ChevronDown className="h-4 w-4 text-[#6B6B6B]" /> : <ChevronRight className="h-4 w-4 text-[#6B6B6B]" />}
                <Layers className="h-4 w-4 text-[#2F8F5C]" />
                <span className="text-sm font-semibold text-[#1A1A1A]">{g.key}</span>
                <span className="ml-auto rounded-full bg-[#E6E1D4] px-2 py-0.5 text-[11px] font-medium text-[#6B6B6B]">
                  {g.templates.length}
                </span>
              </button>

              {/* Parts (templates) in this group */}
              {open && (
                <ul className="divide-y divide-[#EFEBE0]">
                  {g.templates.map((t) => {
                    const tplOpen = expandedTemplates.has(t.id);
                    const cached = itemsCache[t.id];
                    const qty = qtys[t.id] ?? 1;
                    return (
                      <li key={t.id} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleTemplate(t)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            aria-label={tplOpen ? "Hide items" : "Show items"}
                          >
                            {tplOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#A0A0A0]" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#A0A0A0]" />}
                            <span className="truncate text-sm text-[#1A1A1A]">{t.name}</span>
                            {t.description && <span className="hidden truncate text-xs text-[#A0A0A0] sm:inline">— {t.description}</span>}
                          </button>

                          {!isLocked && (
                            <div className="flex shrink-0 items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={qty}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setQtys((prev) => ({ ...prev, [t.id]: Number.isFinite(v) && v >= 1 ? v : 1 }));
                                }}
                                className="w-16 rounded-md border border-[#E6E1D4] bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                                aria-label={`Quantity for ${t.name}`}
                              />
                              <button
                                type="button"
                                onClick={() => void handleAdd(t)}
                                disabled={applyingId === t.id}
                                className="inline-flex items-center gap-1 rounded-md bg-[#2F8F5C] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#287a4e] disabled:opacity-60"
                              >
                                {applyingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Add
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Expanded "what's inside" view */}
                        {tplOpen && (
                          <div className="mt-2 rounded-md border border-[#EFEBE0] bg-[#FCFBF7] p-2.5">
                            {cached === "loading" || cached === undefined ? (
                              <p className="flex items-center gap-1.5 text-xs text-[#A0A0A0]">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading items…
                              </p>
                            ) : cached.length === 0 ? (
                              <p className="text-xs text-[#A0A0A0]">This take-off has no items yet.</p>
                            ) : (
                              (() => {
                                const lines = priceItems(cached);
                                const sellTotal = lines.reduce((s, l) => s + (l.sell ?? 0), 0);
                                const costTotal = lines.reduce((s, l) => s + (l.cost ?? 0), 0);
                                const hasBundle = lines.some((l) => l.isBundle);
                                return (
                                  <div className="space-y-1">
                                    {lines.map((l) => (
                                      <div key={l.key} className="flex items-center gap-2 text-xs">
                                        <span className="min-w-0 flex-1 truncate text-[#3A3A3A]">
                                          {l.qty !== 1 && <span className="tabular-nums text-[#A0A0A0]">{l.qty}× </span>}
                                          {l.label}
                                        </span>
                                        {canSeeCost && (
                                          <span className="w-20 shrink-0 text-right tabular-nums text-[#A0A0A0]">
                                            {l.cost == null ? "—" : fmtMoney(l.cost)}
                                          </span>
                                        )}
                                        <span className="w-20 shrink-0 text-right tabular-nums text-[#3A3A3A]">
                                          {l.sell == null ? "—" : fmtMoney(l.sell)}
                                        </span>
                                      </div>
                                    ))}
                                    <div className="mt-1 flex items-center gap-2 border-t border-[#EFEBE0] pt-1 text-xs font-semibold">
                                      <span className="min-w-0 flex-1 text-[#6B6B6B]">
                                        Per unit{hasBundle && <span className="font-normal text-[#A0A0A0]"> (+ bundles, priced on add)</span>}
                                      </span>
                                      {canSeeCost && <span className="w-20 shrink-0 text-right tabular-nums text-[#6B6B6B]">{fmtMoney(costTotal)}</span>}
                                      <span className="w-20 shrink-0 text-right tabular-nums text-[#1A1A1A]">{fmtMoney(sellTotal)}</span>
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
