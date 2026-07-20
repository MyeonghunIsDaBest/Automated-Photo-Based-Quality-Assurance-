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
import { Check, Minus, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react';
import MotionDrawer from '../../../components/ui/MotionDrawer';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { FRAUNCES, btnGhost, btnPrimary, inputField } from '../components/ledger';
import { cn } from '../../../lib/cn';
import {
  MATERIAL_TIERS,
  MATERIAL_BY_ID,
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

// Warm-ledger tier accents — a local, style-only override of
// TIER_ACCENT_CLASSES from lib/constructionMaterials.ts (that file stays
// untouched). Hexes come from the ledger TONE map; `bar` isn't used here.
const TIER_ACCENT: Record<MaterialTier['accent'], { badge: string; ring: string }> = {
  amber:   { badge: 'border-[#E8D9B5] bg-[#F9EFD9] text-[#9A6B12]', ring: 'ring-[#E8D9B5]' },
  sky:     { badge: 'border-[#C4DFF0] bg-[#E3F0FA] text-[#2A6F9E]', ring: 'ring-[#C4DFF0]' },
  slate:   { badge: 'border-[#D8DEE4] bg-[#EEF1F4] text-[#5B6B7B]', ring: 'ring-[#D8DEE4]' },
  orange:  { badge: 'border-[#E5D0BA] bg-[#F4E9DB] text-[#A35C2B]', ring: 'ring-[#E5D0BA]' },
  rose:    { badge: 'border-[#F0C8C8] bg-[#FBE5E5] text-[#C44545]', ring: 'ring-[#F0C8C8]' },
  violet:  { badge: 'border-[#DCCBEF] bg-[#EFE7FB] text-[#6B3FA0]', ring: 'ring-[#DCCBEF]' },
  emerald: { badge: 'border-[#B8DFC7] bg-[#E1F3EA] text-[#2F8F5C]', ring: 'ring-[#B8DFC7]' },
  indigo:  { badge: 'border-[#DCCBEF] bg-[#EFE7FB] text-[#6B3FA0]', ring: 'ring-[#DCCBEF]' },
};

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

  // Busy-guard: backdrop / Esc / close-X no-op while the order write is in
  // flight so a stray Esc can't dismiss the modal mid-place.
  const guardedClose = () => {
    if (!submitting) onClose();
  };

  return (
    <MotionDrawer
      open={open}
      onClose={guardedClose}
      variant="modal"
      ariaLabel="New order"
      sizeClass="max-w-[960px]"
    >
      <header className="flex items-start gap-3 border-b border-[#EFEBE0] px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#6B6B6B]">
            Procurement · New order
          </p>
          <h2
            className="mt-1 text-lg font-semibold text-[#1A1A1A] sm:text-xl"
            style={{ fontFamily: FRAUNCES }}
          >
            Pick materials by trade tier
          </h2>
        </div>
        <button
          type="button"
          onClick={guardedClose}
          className="grid min-h-11 min-w-11 flex-shrink-0 place-items-center rounded-md text-[#A0A0A0] transition-colors hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
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
              <Badge variant="outline" className={TIER_ACCENT[activeTier.accent].badge}>
                {activeTier.label}
              </Badge>
              <p className="min-w-0 flex-1 truncate text-[11px] text-[#6B6B6B]">
                {activeTier.description}
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A0A0]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${activeTier.label.toLowerCase()} materials…`}
                className="h-9 pl-8 text-sm"
              />
            </div>

            {visibleItems.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-3 py-6 text-center text-xs text-[#6B6B6B]">
                No materials match “{search}” in this tier.
              </p>
            ) : (
              <ul className="max-h-[280px] divide-y divide-[#EFEBE0] overflow-y-auto rounded-md border border-[#E6E1D4]">
                {visibleItems.map((item) => {
                  const inCart = cart.find((c) => c.itemId === item.id);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-[#FAF8F2]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#1A1A1A]">{item.name}</p>
                        {item.spec && (
                          <p className="truncate text-[11px] text-[#6B6B6B]">{item.spec}</p>
                        )}
                      </div>
                      <span className="hidden flex-shrink-0 text-[11px] tabular-nums text-[#6B6B6B] sm:inline">
                        {fmtMoney(item.defaultUnitCost)} / {item.unit}
                      </span>
                      <button
                        type="button"
                        onClick={() => addItem(item)}
                        className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors ${
                          inCart
                            ? 'border border-[#B8DFC7] bg-[#E1F3EA] text-[#246F47] hover:bg-[#D5EBDF]'
                            : 'border border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4] hover:bg-[#FAF8F2]'
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
          <section className="mt-6 rounded-xl border border-[#E6E1D4]">
            <header className="flex items-center justify-between border-b border-[#EFEBE0] px-4 py-2.5">
              <p className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                <ShoppingCart className="h-3.5 w-3.5" />
                Cart · {cart.length} {cart.length === 1 ? 'line' : 'lines'}
              </p>
              <span className="tabular-nums text-sm font-semibold text-[#1A1A1A]">
                {fmtMoney(total)}
              </span>
            </header>
            <ul className="divide-y divide-[#EFEBE0]">
              {cart.map((line) => {
                const material = MATERIAL_BY_ID[line.itemId];
                if (!material) return null;
                const lineTotal = line.qty * line.unitCost;
                return (
                  <li key={line.itemId} className="grid grid-cols-12 gap-2 px-4 py-2.5">
                    <div className="col-span-12 min-w-0 sm:col-span-5">
                      <p className="truncate text-sm font-medium text-[#1A1A1A]">{material.name}</p>
                      {material.spec && (
                        <p className="truncate text-[11px] text-[#6B6B6B]">{material.spec}</p>
                      )}
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <div className="flex items-center rounded-md border border-[#E6E1D4]">
                        <button
                          type="button"
                          onClick={() => setQty(line.itemId, line.qty - 1)}
                          className="inline-flex h-8 w-7 items-center justify-center rounded-l-md text-[#6B6B6B] hover:bg-[#FAF8F2]"
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
                          className="inline-flex h-8 w-7 items-center justify-center rounded-r-md text-[#6B6B6B] hover:bg-[#FAF8F2]"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="col-span-1 flex items-center text-[11px] uppercase tracking-wider text-[#6B6B6B]">
                      {material.unit}
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <div className="flex items-center rounded-md border border-[#E6E1D4] px-2">
                        <span className="text-[11px] text-[#A0A0A0]">$</span>
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
                      <span className="tabular-nums text-sm font-semibold text-[#1A1A1A]">
                        {fmtMoney(lineTotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(line.itemId)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#FBE5E5] hover:text-[#C44545]"
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
              className={cn(inputField, 'h-9')}
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
              className={cn(inputField, 'h-9')}
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
              className={cn(inputField, 'h-9')}
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
              className={inputField}
            />
          </Field>
        </section>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-[#F0C8C8] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]"
          >
            {error}
          </p>
        )}
      </div>

      <footer className="border-t border-[#EFEBE0] bg-white px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#6B6B6B]">
            {cart.length === 0
              ? 'No items selected yet.'
              : `${cart.length} ${cart.length === 1 ? 'line' : 'lines'} · `}
            <strong className="ml-1 tabular-nums text-[#1A1A1A]">{fmtMoney(total)}</strong>
            <span className="ml-2 text-[10px] uppercase tracking-wider text-[#9A6B12]">
              · lands in supplier's pending orders
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btnGhost} onClick={guardedClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={handlePlace}
              disabled={submitting || cart.length === 0 || !supplierName.trim()}
            >
              <Check className="h-3.5 w-3.5" />
              {submitting ? 'Placing…' : 'Place order'}
            </button>
          </div>
        </div>
      </footer>
    </MotionDrawer>
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
  const accent = TIER_ACCENT[tier.accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors md:w-full ${
        active
          ? `border-[#1A1A1A] bg-[#1A1A1A] text-white ring-2 ring-offset-1 ${accent.ring}`
          : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4] hover:bg-[#FAF8F2]'
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
        <span className={`block text-[10px] ${active ? 'text-white/70' : 'text-[#6B6B6B]'}`}>
          {tier.items.length} items
        </span>
      </span>
      {cartCount > 0 && (
        <span
          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
            active ? 'bg-white text-[#1A1A1A]' : 'bg-[#1A1A1A] text-white'
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
      <span className="mb-1 block text-xs font-medium text-[#6B6B6B]">{label}</span>
      {children}
    </label>
  );
}
