// NewOrderModal — popup-style order creation flow that replaces the
// slide-in OrderDrawer's create path. Two-column layout on desktop:
// trade-tier sidebar on the left (Electrical / Plumbing / Structural / …)
// + filterable item picker on the right. Selected items collect into a
// cart at the bottom with qty + unit cost inline editors.
//
// Created orders are stamped with `status: 'submitted'` so they land in
// the OrdersTab "Pending" / supplier-account view immediately — no extra
// step to push them past Draft.

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import EditorialModal from '../../../components/editorial/EditorialModal';
import EditorialButton from '../../../components/editorial/EditorialButton';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  MATERIAL_TIERS,
  MATERIAL_BY_ID,
  TIER_ACCENT_CLASSES,
  type MaterialItem,
  type MaterialTier,
} from '../../../lib/constructionMaterials';
import { useGanttSideStore } from '../store';
import { useFeatureStore } from '../../../store/features';
import { useAppStore } from '../../../store';
import { listSuppliers } from '../../../lib/api/suppliers';
import { fmtMoney } from '../../../lib/format';
import { supabaseConfigured } from '../../../lib/supabase';
import type { Order, OrderLineItem, OrderStatus } from '../types';
import type { Supplier } from '../../../types';

interface NewOrderModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

interface CartLine {
  /** Catalogue id from constructionMaterials.ts. */
  itemId: string;
  qty: number;
  /** Pre-filled from defaultUnitCost, editable per-line. */
  unitCost: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const uid = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

export default function NewOrderModal({
  open,
  onClose,
  projectId,
}: NewOrderModalProps) {
  const addOrder = useGanttSideStore((s) => s.addOrder);

  // Project-scoped tasks + zones come from the same stores OrderDrawer reads
  // from, so the new popup matches the side-drawer's data sources without
  // forcing OrdersTab to plumb them through.
  const allTasks = useFeatureStore((s) => s.tasks);
  const allZones = useAppStore((s) => s.zones);
  const tasks = useMemo(
    () => allTasks.filter((t) => t.projectId === projectId),
    [allTasks, projectId],
  );
  const zones = useMemo(
    () => allZones.filter((z) => z.projectId === projectId),
    [allZones, projectId],
  );

  // Known suppliers — only relevant when Supabase is configured. Failures
  // here just leave the datalist empty; the supplier-name input still
  // accepts free text (mirrors SupplierOrderModal).
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  useEffect(() => {
    if (!open || !supabaseConfigured()) return;
    let cancelled = false;
    listSuppliers()
      .then((list) => { if (!cancelled) setSuppliers(list); })
      .catch(() => { /* silent — datalist falls back to empty */ });
    return () => { cancelled = true; };
  }, [open]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [activeTierId, setActiveTierId] = useState<string>(MATERIAL_TIERS[0]!.id);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);

  // ── Order metadata ──────────────────────────────────────────────────────
  const [supplierName, setSupplierName] = useState('');
  const [taskId, setTaskId] = useState<string>('');
  const [zoneId, setZoneId] = useState<string>('');
  const [orderedDate, setOrderedDate] = useState(today());
  const [expectedDelivery, setExpectedDelivery] = useState(inDays(7));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset everything when the modal closes so the next open starts fresh.
  useEffect(() => {
    if (open) return;
    setActiveTierId(MATERIAL_TIERS[0]!.id);
    setSearch('');
    setCart([]);
    setSupplierName('');
    setTaskId('');
    setZoneId('');
    setOrderedDate(today());
    setExpectedDelivery(inDays(7));
    setNotes('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  const activeTier = useMemo(
    () => MATERIAL_TIERS.find((t) => t.id === activeTierId) ?? MATERIAL_TIERS[0]!,
    [activeTierId],
  );

  // Items in the active tier, narrowed by the search term. Case-insensitive
  // match against the visible name + the spec line so "16mm" or "cable"
  // both surface the right rows.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeTier.items;
    return activeTier.items.filter((item) => {
      const hay = `${item.name} ${item.spec ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activeTier, search]);

  // Cart helpers — add / remove / set qty. Keeping these small instead of
  // dispatching to a reducer; the cart is short enough that direct mutation
  // is more readable than action types.
  const addItem = (item: MaterialItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [...prev, { itemId: item.id, qty: 1, unitCost: item.defaultUnitCost }];
    });
  };
  const setQty = (itemId: string, qty: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.itemId === itemId ? { ...c, qty: Math.max(0, qty) } : c))
        .filter((c) => c.qty > 0),
    );
  };
  const setUnitCost = (itemId: string, unitCost: number) => {
    setCart((prev) =>
      prev.map((c) => (c.itemId === itemId ? { ...c, unitCost: Math.max(0, unitCost) } : c)),
    );
  };
  const removeItem = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  };

  // Per-tier item count in the cart — drives the badge on the tier rail
  // so the user can see "I've already picked 4 from Electrical".
  const cartCountByTier = useMemo(() => {
    const out: Record<string, number> = {};
    for (const line of cart) {
      const material = MATERIAL_BY_ID[line.itemId];
      if (!material) continue;
      out[material.tierId] = (out[material.tierId] ?? 0) + 1;
    }
    return out;
  }, [cart]);

  const total = useMemo(
    () => cart.reduce((sum, c) => sum + c.qty * c.unitCost, 0),
    [cart],
  );

  const handlePlace = () => {
    setError(null);
    if (cart.length === 0) {
      setError('Add at least one material to the cart before placing the order.');
      return;
    }
    if (!supplierName.trim()) {
      setError('Pick or type a supplier name so they know where the order belongs.');
      return;
    }
    if (new Date(orderedDate) > new Date(expectedDelivery)) {
      setError('Delivery date must be on or after the order date.');
      return;
    }

    setSubmitting(true);
    const lineItems: OrderLineItem[] = cart.map((line) => {
      const material = MATERIAL_BY_ID[line.itemId]!;
      return {
        id: uid('li'),
        description: material.spec
          ? `${material.name} — ${material.spec}`
          : material.name,
        qty: line.qty,
        unitCost: line.unitCost,
        unit: material.unit,
        qtyReceived: 0,
      };
    });

    const draft: Omit<Order, 'id' | 'projectId'> = {
      poNumber: `PO-${Math.floor(Math.random() * 9000 + 1000)}`,
      supplierName: supplierName.trim(),
      zoneId: zoneId || undefined,
      taskId: taskId || undefined,
      orderedDate,
      expectedDelivery,
      // Stamped 'submitted' so the order appears under the supplier's
      // Pending Orders view immediately — no extra Draft → Submit step.
      status: 'submitted' as OrderStatus,
      notes: notes.trim() || undefined,
      lineItems,
    };

    try {
      addOrder(projectId, draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <EditorialModal
      open={open}
      onClose={onClose}
      eyebrow="Procurement · New order"
      title="Pick materials by trade tier"
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {cart.length === 0
              ? 'No items selected yet.'
              : `${cart.length} ${cart.length === 1 ? 'line' : 'lines'} · `}
            <strong className="ml-1 tabular-nums text-slate-900">{fmtMoney(total)}</strong>
            <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700">
              · lands in supplier's pending orders
            </span>
          </div>
          <div className="flex items-center gap-2">
            <EditorialButton variant="ghost" onClick={onClose}>Cancel</EditorialButton>
            <EditorialButton
              variant="pill"
              onClick={handlePlace}
              disabled={submitting || cart.length === 0 || !supplierName.trim()}
            >
              <Check className="h-3.5 w-3.5" />
              {submitting ? 'Placing…' : 'Place order'}
            </EditorialButton>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        {/* Tier rail — vertical pill list on desktop, horizontal scroll on phones. */}
        <nav
          aria-label="Material tiers"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0"
        >
          {MATERIAL_TIERS.map((tier) => (
            <TierButton
              key={tier.id}
              tier={tier}
              active={tier.id === activeTierId}
              cartCount={cartCountByTier[tier.id] ?? 0}
              onClick={() => {
                setActiveTierId(tier.id);
                setSearch('');
              }}
            />
          ))}
        </nav>

        {/* Item picker for the active tier. */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={TIER_ACCENT_CLASSES[activeTier.accent].badge}>
              {activeTier.label}
            </Badge>
            <p className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
              {activeTier.description}
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${activeTier.label.toLowerCase()} materials…`}
              className="h-9 pl-8 text-sm"
            />
          </div>

          {visibleItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-xs text-slate-500">
              No materials match “{search}” in this tier.
            </p>
          ) : (
            <ul className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {visibleItems.map((item) => {
                const inCart = cart.find((c) => c.itemId === item.id);
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                      {item.spec && (
                        <p className="truncate text-[11px] text-slate-500">{item.spec}</p>
                      )}
                    </div>
                    <span className="hidden flex-shrink-0 text-[11px] tabular-nums text-slate-500 sm:inline">
                      {fmtMoney(item.defaultUnitCost)} / {item.unit}
                    </span>
                    <button
                      type="button"
                      onClick={() => addItem(item)}
                      className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
                        inCart
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Plus className="h-3 w-3" />
                      {inCart ? `+1 (${inCart.qty})` : 'Add'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Cart — selected materials with editable qty / unit cost. Hidden when
          empty so the picker dominates the first interaction. */}
      {cart.length > 0 && (
        <section className="mt-6 rounded-xl border border-slate-200">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              <ShoppingCart className="h-3.5 w-3.5" />
              Cart · {cart.length} {cart.length === 1 ? 'line' : 'lines'}
            </p>
            <span className="tabular-nums text-sm font-semibold text-slate-900">
              {fmtMoney(total)}
            </span>
          </header>
          <ul className="divide-y divide-slate-100">
            {cart.map((line) => {
              const material = MATERIAL_BY_ID[line.itemId];
              if (!material) return null;
              const lineTotal = line.qty * line.unitCost;
              return (
                <li key={line.itemId} className="grid grid-cols-12 gap-2 px-4 py-2.5">
                  <div className="col-span-12 min-w-0 sm:col-span-5">
                    <p className="truncate text-sm font-medium text-slate-900">{material.name}</p>
                    {material.spec && (
                      <p className="truncate text-[11px] text-slate-500">{material.spec}</p>
                    )}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <div className="flex items-center rounded-md border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setQty(line.itemId, line.qty - 1)}
                        className="inline-flex h-8 w-7 items-center justify-center rounded-l-md text-slate-500 hover:bg-slate-50"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={line.qty}
                        onChange={(e) => setQty(line.itemId, Number(e.target.value) || 0)}
                        className="h-8 w-full min-w-0 border-0 bg-transparent px-1 text-center text-sm tabular-nums focus:outline-none"
                        aria-label={`Quantity of ${material.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => setQty(line.itemId, line.qty + 1)}
                        className="inline-flex h-8 w-7 items-center justify-center rounded-r-md text-slate-500 hover:bg-slate-50"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-1 flex items-center text-[11px] uppercase tracking-wider text-slate-500">
                    {material.unit}
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <div className="flex items-center rounded-md border border-slate-200 px-2">
                      <span className="text-[11px] text-slate-400">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.01}
                        value={line.unitCost}
                        onChange={(e) => setUnitCost(line.itemId, Number(e.target.value) || 0)}
                        className="h-8 w-full min-w-0 border-0 bg-transparent text-sm tabular-nums focus:outline-none"
                        aria-label={`Unit cost for ${material.name}`}
                      />
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center justify-end gap-2 sm:col-span-2">
                    <span className="tabular-nums text-sm font-semibold text-slate-900">
                      {fmtMoney(lineTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(line.itemId)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${material.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Order metadata — supplier + dates + optional linked task / zone /
          notes. Compact grid so the modal stays scannable on tablet. */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <Field label="Supplier">
          <input
            list="supplier-names"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="e.g. SteelHaus, NorthCrete, LuxCo"
            className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <datalist id="supplier-names">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Linked task (optional)">
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">— None —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Order date">
          <Input
            type="date"
            value={orderedDate}
            onChange={(e) => setOrderedDate(e.target.value)}
          />
        </Field>
        <Field label="Expected delivery">
          <Input
            type="date"
            value={expectedDelivery}
            onChange={(e) => setExpectedDelivery(e.target.value)}
          />
        </Field>
        <Field label="Zone (optional)">
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Project-wide</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Delivery instructions, terms, references…"
            className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </Field>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      )}
    </EditorialModal>
  );
}

// ─── Tier rail button ──────────────────────────────────────────────────────

function TierButton({
  tier, active, cartCount, onClick,
}: {
  tier: MaterialTier;
  active: boolean;
  cartCount: number;
  onClick: () => void;
}) {
  const Icon = tier.icon;
  const accent = TIER_ACCENT_CLASSES[tier.accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors md:w-full ${
        active
          ? `border-slate-900 bg-slate-900 text-white ring-2 ring-offset-1 ${accent.ring}`
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
          active ? 'bg-white/10' : accent.badge
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{tier.label}</span>
        <span className={`block text-[10px] ${active ? 'text-white/70' : 'text-slate-500'}`}>
          {tier.items.length} items
        </span>
      </span>
      {cartCount > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
            active ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
          }`}
        >
          {cartCount}
        </span>
      )}
    </button>
  );
}

// ─── Field helper ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
