import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DiaryEntry, DiaryPersonnel,
  PunchItem,
  Order, OrderLineItem, OrderStatus,
  Delivery,
  Invoice, InvoiceStatus,
  Warranty,
  ChecklistItem,
} from './types';

// ─── Slice maps ──────────────────────────────────────────────────────────
// Every slice is keyed by projectId so a multi-project workspace doesn't
// leak. Stable Map-shaped state means selectors stay reference-stable
// (the Daily Logs crash lesson — see claude_build_prog.md 2026-05-04).

type ByProject<T> = Record<string, T[]>;

interface State {
  diaryEntries: ByProject<DiaryEntry>;
  punchItems:   ByProject<PunchItem>;
  orders:       ByProject<Order>;
  deliveries:   ByProject<Delivery>;
  invoices:     ByProject<Invoice>;
  warranties:   ByProject<Warranty>;
  checklists:   Record<string, ChecklistItem[]>;
}

interface Actions {
  // Diary
  addDiaryEntry:    (projectId: string, draft: Omit<DiaryEntry, 'id' | 'projectId' | 'createdAt' | 'createdBy'> & { createdBy: string }) => void;
  updateDiaryEntry: (projectId: string, id: string, patch: Partial<DiaryEntry>) => void;
  removeDiaryEntry: (projectId: string, id: string) => void;
  addDiaryPersonnel:    (projectId: string, entryId: string, person: Omit<DiaryPersonnel, 'id'>) => void;
  removeDiaryPersonnel: (projectId: string, entryId: string, personId: string) => void;

  // Punch list
  addPunchItem:    (projectId: string, draft: Omit<PunchItem, 'id' | 'projectId' | 'status' | 'createdAt' | 'createdBy' | 'closedAt'> & { createdBy: string }) => void;
  togglePunchItem: (projectId: string, id: string) => void;
  updatePunchItem: (projectId: string, id: string, patch: Partial<PunchItem>) => void;
  removePunchItem: (projectId: string, id: string) => void;

  // Orders
  addOrder:    (projectId: string, draft: Omit<Order, 'id' | 'projectId'>) => string;
  updateOrder: (projectId: string, id: string, patch: Partial<Order>) => void;
  setOrderStatus: (projectId: string, id: string, status: OrderStatus) => void;
  removeOrder: (projectId: string, id: string) => void;

  // Deliveries
  addDelivery: (projectId: string, draft: Omit<Delivery, 'id' | 'projectId' | 'createdAt'>) => void;
  removeDelivery: (projectId: string, id: string) => void;

  // Invoices
  addInvoice:        (projectId: string, draft: Omit<Invoice, 'id' | 'projectId' | 'createdAt'>) => void;
  setInvoiceStatus:  (projectId: string, id: string, status: InvoiceStatus, paidDate?: string) => void;
  updateInvoice:     (projectId: string, id: string, patch: Partial<Invoice>) => void;
  removeInvoice:     (projectId: string, id: string) => void;

  // Warranties
  addWarranty:    (projectId: string, draft: Omit<Warranty, 'id' | 'projectId' | 'createdAt'>) => void;
  updateWarranty: (projectId: string, id: string, patch: Partial<Warranty>) => void;
  removeWarranty: (projectId: string, id: string) => void;

  // Checklist
  addChecklistItem:    (taskId: string, text: string) => void;
  toggleChecklistItem: (taskId: string, itemId: string) => void;
  updateChecklistItem: (taskId: string, itemId: string, patch: Partial<ChecklistItem>) => void;
  removeChecklistItem: (taskId: string, itemId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const uid = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const now = () => new Date().toISOString();

// Recompute order status from line item receipts. Called from Delivery
// add/remove and from any line item edit. Kept local so consumers don't
// need to think about it.
function deriveOrderStatus(order: Order): OrderStatus {
  if (order.status === 'cancelled' || order.status === 'draft' ||
      order.status === 'submitted' || order.status === 'confirmed') {
    // Pre-receipt statuses don't auto-flip until delivery activity exists.
    const totalReceived = order.lineItems.reduce((s, li) => s + li.qtyReceived, 0);
    if (totalReceived === 0) return order.status;
  }
  const allReceived = order.lineItems.every((li) => li.qtyReceived >= li.qty);
  if (allReceived) return 'received';
  const anyReceived = order.lineItems.some((li) => li.qtyReceived > 0);
  if (anyReceived) return 'partial';
  return order.status;
}

// ─── Migration from the old shape ────────────────────────────────────────
// Runs on rehydration only. Converts whatever shape lives in the persisted
// payload (old dailyLogs / changeOrders / selections) into the new slices.
// Idempotent: re-running it on already-migrated state is a no-op.

interface LegacyShape {
  dailyLogs?: Record<string, Array<{
    id: string; date: string; hours: number; personnelCount: number;
    photosCount: number; description: string;
  }>>;
  changeOrders?: Record<string, Array<{
    id: string; poNumber: string; description: string; amount: number;
    status: 'draft' | 'sent' | 'approved' | 'rejected';
  }>>;
  selections?: Record<string, Array<{
    id: string; zoneId?: string; item: string; supplier: string;
    status: 'pending' | 'selected' | 'ordered' | 'delivered';
  }>>;
  warranties?: Record<string, Array<{
    id: string; item: string; supplier: string;
    expiryDate: string; fileRef?: string;
  }>>;
  todos?: Record<string, Array<{
    id: string; text: string; done: boolean; dueDate?: string;
  }>>;
  // New shape, may already exist if the user re-loads after migration.
  diaryEntries?: ByProject<DiaryEntry>;
  punchItems?: ByProject<PunchItem>;
  orders?: ByProject<Order>;
  deliveries?: ByProject<Delivery>;
  invoices?: ByProject<Invoice>;
  checklists?: Record<string, ChecklistItem[]>;
}

function migrate(persisted: unknown): State {
  const empty: State = {
    diaryEntries: {}, punchItems: {}, orders: {},
    deliveries: {}, invoices: {}, warranties: {},
    checklists: {},
  };
  if (!persisted || typeof persisted !== 'object') return empty;
  const legacy = persisted as LegacyShape;

  // Diary: convert dailyLogs → diaryEntries with a synthetic personnel row.
  const diaryEntries: ByProject<DiaryEntry> = legacy.diaryEntries ?? {};
  if (legacy.dailyLogs) {
    for (const [projectId, logs] of Object.entries(legacy.dailyLogs)) {
      const existing = diaryEntries[projectId] ?? [];
      const migrated = logs.map<DiaryEntry>((log) => ({
        id: log.id,
        projectId,
        date: log.date,
        description: log.description,
        personnel: log.personnelCount > 0 ? [{
          id: uid('pers'),
          workerId: 'legacy',
          workerName: `Crew of ${log.personnelCount}`,
          hours: log.hours,
          role: 'mixed',
          company: '—',
        }] : [],
        photoIds: [],
        createdBy: 'legacy',
        createdAt: log.date,
      }));
      diaryEntries[projectId] = [...existing, ...migrated];
    }
  }

  // Orders: change orders + selections both fold in.
  const orders: ByProject<Order> = legacy.orders ?? {};
  if (legacy.changeOrders) {
    const STATUS_MAP = {
      draft: 'draft', sent: 'submitted', approved: 'confirmed', rejected: 'cancelled',
    } as const;
    for (const [projectId, list] of Object.entries(legacy.changeOrders)) {
      const existing = orders[projectId] ?? [];
      const migrated = list.map<Order>((co) => ({
        id: co.id,
        projectId,
        poNumber: co.poNumber,
        supplierName: '—',
        orderedDate: now().slice(0, 10),
        status: STATUS_MAP[co.status],
        lineItems: [{
          id: uid('li'),
          description: co.description,
          qty: 1,
          unitCost: co.amount,
          unit: 'ea',
          qtyReceived: 0,
        }],
      }));
      orders[projectId] = [...existing, ...migrated];
    }
  }
  if (legacy.selections) {
    const STATUS_MAP = {
      pending: 'draft', selected: 'submitted', ordered: 'confirmed', delivered: 'received',
    } as const;
    for (const [projectId, list] of Object.entries(legacy.selections)) {
      const existing = orders[projectId] ?? [];
      const migrated = list.map<Order>((sel) => ({
        id: sel.id,
        projectId,
        poNumber: `SEL-${sel.id.slice(-4).toUpperCase()}`,
        supplierName: sel.supplier,
        zoneId: sel.zoneId,
        orderedDate: now().slice(0, 10),
        status: STATUS_MAP[sel.status],
        lineItems: [{
          id: uid('li'),
          description: sel.item,
          qty: 1,
          unitCost: 0,
          unit: 'ea',
          qtyReceived: sel.status === 'delivered' ? 1 : 0,
        }],
      }));
      orders[projectId] = [...existing, ...migrated];
    }
  }

  // Warranties: keep as-is, fill in the new fields with sensible defaults.
  const warranties: ByProject<Warranty> = {};
  if (legacy.warranties) {
    for (const [projectId, list] of Object.entries(legacy.warranties)) {
      warranties[projectId] = list.map<Warranty>((w) => ({
        id: w.id,
        projectId,
        description: w.item,
        supplierName: w.supplier,
        startDate: now().slice(0, 10),
        expiryDate: w.expiryDate,
        fileRef: w.fileRef,
        createdAt: now(),
      }));
    }
  }

  // Punch list: todos → punchItems, status mapped from `done`.
  const punchItems: ByProject<PunchItem> = legacy.punchItems ?? {};
  if (legacy.todos) {
    for (const [projectId, list] of Object.entries(legacy.todos)) {
      const existing = punchItems[projectId] ?? [];
      const migrated = list.map<PunchItem>((t) => ({
        id: t.id,
        projectId,
        text: t.text,
        dueDate: t.dueDate,
        status: t.done ? 'done' : 'open',
        createdBy: 'legacy',
        createdAt: now(),
        closedAt: t.done ? now() : undefined,
      }));
      punchItems[projectId] = [...existing, ...migrated];
    }
  }

  return {
    diaryEntries,
    punchItems,
    orders,
    deliveries: legacy.deliveries ?? {},
    invoices:   legacy.invoices ?? {},
    warranties,
    checklists: legacy.checklists ?? {},
  };
}

// ─── Store ───────────────────────────────────────────────────────────────

export const useGanttSideStore = create<State & Actions>()(
  persist(
    (set, _get) => ({
      diaryEntries: {},
      punchItems: {},
      orders: {},
      deliveries: {},
      invoices: {},
      warranties: {},
      checklists: {},

      // ── Diary ──────────────────────────────────────────────────────────
      addDiaryEntry: (projectId, draft) => {
        const entry: DiaryEntry = {
          id: uid('diary'),
          projectId,
          createdAt: now(),
          ...draft,
        };
        set((s) => ({
          diaryEntries: {
            ...s.diaryEntries,
            [projectId]: [entry, ...(s.diaryEntries[projectId] ?? [])],
          },
        }));
      },
      updateDiaryEntry: (projectId, id, patch) => {
        set((s) => ({
          diaryEntries: {
            ...s.diaryEntries,
            [projectId]: (s.diaryEntries[projectId] ?? []).map((e) =>
              e.id === id ? { ...e, ...patch } : e,
            ),
          },
        }));
      },
      removeDiaryEntry: (projectId, id) => {
        set((s) => ({
          diaryEntries: {
            ...s.diaryEntries,
            [projectId]: (s.diaryEntries[projectId] ?? []).filter((e) => e.id !== id),
          },
        }));
      },
      addDiaryPersonnel: (projectId, entryId, person) => {
        set((s) => ({
          diaryEntries: {
            ...s.diaryEntries,
            [projectId]: (s.diaryEntries[projectId] ?? []).map((e) =>
              e.id === entryId
                ? { ...e, personnel: [...e.personnel, { id: uid('pers'), ...person }] }
                : e,
            ),
          },
        }));
      },
      removeDiaryPersonnel: (projectId, entryId, personId) => {
        set((s) => ({
          diaryEntries: {
            ...s.diaryEntries,
            [projectId]: (s.diaryEntries[projectId] ?? []).map((e) =>
              e.id === entryId
                ? { ...e, personnel: e.personnel.filter((p) => p.id !== personId) }
                : e,
            ),
          },
        }));
      },

      // ── Punch list ─────────────────────────────────────────────────────
      addPunchItem: (projectId, draft) => {
        const item: PunchItem = {
          id: uid('punch'),
          projectId,
          status: 'open',
          createdAt: now(),
          ...draft,
        };
        set((s) => ({
          punchItems: {
            ...s.punchItems,
            [projectId]: [item, ...(s.punchItems[projectId] ?? [])],
          },
        }));
      },
      togglePunchItem: (projectId, id) => {
        set((s) => ({
          punchItems: {
            ...s.punchItems,
            [projectId]: (s.punchItems[projectId] ?? []).map((p) =>
              p.id === id
                ? {
                    ...p,
                    status: p.status === 'open' ? 'done' : 'open',
                    closedAt: p.status === 'open' ? now() : undefined,
                  }
                : p,
            ),
          },
        }));
      },
      updatePunchItem: (projectId, id, patch) => {
        set((s) => ({
          punchItems: {
            ...s.punchItems,
            [projectId]: (s.punchItems[projectId] ?? []).map((p) =>
              p.id === id ? { ...p, ...patch } : p,
            ),
          },
        }));
      },
      removePunchItem: (projectId, id) => {
        set((s) => ({
          punchItems: {
            ...s.punchItems,
            [projectId]: (s.punchItems[projectId] ?? []).filter((p) => p.id !== id),
          },
        }));
      },

      // ── Orders ─────────────────────────────────────────────────────────
      addOrder: (projectId, draft) => {
        const id = uid('order');
        const order: Order = { id, projectId, ...draft };
        set((s) => ({
          orders: { ...s.orders, [projectId]: [order, ...(s.orders[projectId] ?? [])] },
        }));
        return id;
      },
      updateOrder: (projectId, id, patch) => {
        set((s) => ({
          orders: {
            ...s.orders,
            [projectId]: (s.orders[projectId] ?? []).map((o) => {
              if (o.id !== id) return o;
              const merged = { ...o, ...patch };
              return { ...merged, status: deriveOrderStatus(merged) };
            }),
          },
        }));
      },
      setOrderStatus: (projectId, id, status) => {
        set((s) => ({
          orders: {
            ...s.orders,
            [projectId]: (s.orders[projectId] ?? []).map((o) =>
              o.id === id ? { ...o, status } : o,
            ),
          },
        }));
      },
      removeOrder: (projectId, id) => {
        set((s) => ({
          orders: {
            ...s.orders,
            [projectId]: (s.orders[projectId] ?? []).filter((o) => o.id !== id),
          },
        }));
      },

      // ── Deliveries — also patch the parent order's qtyReceived ─────────
      addDelivery: (projectId, draft) => {
        const delivery: Delivery = {
          id: uid('delivery'),
          projectId,
          createdAt: now(),
          ...draft,
        };
        set((s) => {
          const projectOrders = s.orders[projectId] ?? [];
          const updatedOrders = projectOrders.map((o) => {
            if (o.id !== delivery.orderId) return o;
            const updatedItems = o.lineItems.map((li) => {
              const received = delivery.items.find((d) => d.lineItemId === li.id);
              return received
                ? { ...li, qtyReceived: li.qtyReceived + received.qtyReceived }
                : li;
            });
            const next = { ...o, lineItems: updatedItems };
            return { ...next, status: deriveOrderStatus(next) };
          });
          return {
            deliveries: {
              ...s.deliveries,
              [projectId]: [delivery, ...(s.deliveries[projectId] ?? [])],
            },
            orders: { ...s.orders, [projectId]: updatedOrders },
          };
        });
      },
      removeDelivery: (projectId, id) => {
        // Roll back the qtyReceived when a delivery is removed.
        set((s) => {
          const delivery = (s.deliveries[projectId] ?? []).find((d) => d.id === id);
          const updatedOrders = !delivery
            ? s.orders[projectId] ?? []
            : (s.orders[projectId] ?? []).map((o) => {
                if (o.id !== delivery.orderId) return o;
                const updatedItems = o.lineItems.map((li) => {
                  const reversed = delivery.items.find((d) => d.lineItemId === li.id);
                  return reversed
                    ? { ...li, qtyReceived: Math.max(0, li.qtyReceived - reversed.qtyReceived) }
                    : li;
                });
                const next = { ...o, lineItems: updatedItems };
                return { ...next, status: deriveOrderStatus(next) };
              });
          return {
            deliveries: {
              ...s.deliveries,
              [projectId]: (s.deliveries[projectId] ?? []).filter((d) => d.id !== id),
            },
            orders: { ...s.orders, [projectId]: updatedOrders },
          };
        });
      },

      // ── Invoices ───────────────────────────────────────────────────────
      addInvoice: (projectId, draft) => {
        const invoice: Invoice = {
          id: uid('invoice'),
          projectId,
          createdAt: now(),
          ...draft,
        };
        set((s) => ({
          invoices: {
            ...s.invoices,
            [projectId]: [invoice, ...(s.invoices[projectId] ?? [])],
          },
        }));
      },
      setInvoiceStatus: (projectId, id, status, paidDate) => {
        set((s) => ({
          invoices: {
            ...s.invoices,
            [projectId]: (s.invoices[projectId] ?? []).map((inv) =>
              inv.id === id
                ? { ...inv, status, paidDate: status === 'paid' ? paidDate ?? now().slice(0, 10) : inv.paidDate }
                : inv,
            ),
          },
        }));
      },
      updateInvoice: (projectId, id, patch) => {
        set((s) => ({
          invoices: {
            ...s.invoices,
            [projectId]: (s.invoices[projectId] ?? []).map((inv) =>
              inv.id === id ? { ...inv, ...patch } : inv,
            ),
          },
        }));
      },
      removeInvoice: (projectId, id) => {
        set((s) => ({
          invoices: {
            ...s.invoices,
            [projectId]: (s.invoices[projectId] ?? []).filter((inv) => inv.id !== id),
          },
        }));
      },

      // ── Warranties ─────────────────────────────────────────────────────
      addWarranty: (projectId, draft) => {
        const warranty: Warranty = {
          id: uid('warranty'),
          projectId,
          createdAt: now(),
          ...draft,
        };
        set((s) => ({
          warranties: {
            ...s.warranties,
            [projectId]: [warranty, ...(s.warranties[projectId] ?? [])],
          },
        }));
      },
      updateWarranty: (projectId, id, patch) => {
        set((s) => ({
          warranties: {
            ...s.warranties,
            [projectId]: (s.warranties[projectId] ?? []).map((w) =>
              w.id === id ? { ...w, ...patch } : w,
            ),
          },
        }));
      },
      removeWarranty: (projectId, id) => {
        set((s) => ({
          warranties: {
            ...s.warranties,
            [projectId]: (s.warranties[projectId] ?? []).filter((w) => w.id !== id),
          },
        }));
      },

      // ── Checklist ──────────────────────────────────────────────────────
      addChecklistItem: (taskId, text) => {
        const item: ChecklistItem = {
          id: uid('chk'),
          text,
          done: false,
          createdAt: now(),
        };
        set((s) => ({
          checklists: {
            ...s.checklists,
            [taskId]: [...(s.checklists[taskId] ?? []), item],
          },
        }));
      },
      toggleChecklistItem: (taskId, itemId) => {
        set((s) => ({
          checklists: {
            ...s.checklists,
            [taskId]: (s.checklists[taskId] ?? []).map((c) =>
              c.id === itemId
                ? {
                    ...c,
                    done: !c.done,
                    closedAt: !c.done ? now() : undefined,
                  }
                : c,
            ),
          },
        }));
      },
      updateChecklistItem: (taskId, itemId, patch) => {
        set((s) => ({
          checklists: {
            ...s.checklists,
            [taskId]: (s.checklists[taskId] ?? []).map((c) =>
              c.id === itemId ? { ...c, ...patch } : c,
            ),
          },
        }));
      },
      removeChecklistItem: (taskId, itemId) => {
        set((s) => ({
          checklists: {
            ...s.checklists,
            [taskId]: (s.checklists[taskId] ?? []).filter((c) => c.id !== itemId),
          },
        }));
      },
    }),
    {
      name: 'siteproof-gantt-side',
      version: 2,                  // bumped from v1 — triggers migrate
      // Run the legacy → v2 migration on every rehydration.
      // Any field shape can show up in `persisted` (v0, v1, partial v2),
      // and `migrate` handles all of them idempotently.
      migrate: (persisted, _version) => migrate(persisted) as never,
    },
  ),
);

// ─── Selectors ───────────────────────────────────────────────────────────
// Top-level helpers so consumers don't repeat the project-scope dance and
// don't trip the unstable-snapshot loop. All return stable references when
// the underlying slice is unchanged.

export const selectDiary       = (s: State, projectId: string) => s.diaryEntries[projectId] ?? [];
export const selectPunch       = (s: State, projectId: string) => s.punchItems[projectId] ?? [];
export const selectOrders      = (s: State, projectId: string) => s.orders[projectId] ?? [];
export const selectDeliveries  = (s: State, projectId: string) => s.deliveries[projectId] ?? [];
export const selectInvoices    = (s: State, projectId: string) => s.invoices[projectId] ?? [];
export const selectWarranties  = (s: State, projectId: string) => s.warranties[projectId] ?? [];

// Computed: order total (qty × unitCost summed across line items).
export const orderTotal = (order: Order) =>
  order.lineItems.reduce((sum, li) => sum + li.qty * li.unitCost, 0);

// ─── Reference-stable empty fallbacks ────────────────────────────────────
// These fixed arrays are returned by the convenience hooks below so "this
// project has no X yet" never produces a new reference per render. The
// React 18 useSyncExternalStore snapshot equality check goes infinite if
// the selector returns a new `[]` every call — see the Daily Logs crash
// log on 2026-05-04 for the painful version of learning this.
const EMPTY_DIARY:      DiaryEntry[]    = [];
const EMPTY_PUNCH:      PunchItem[]     = [];
const EMPTY_ORDERS:     Order[]         = [];
const EMPTY_DELIVERIES: Delivery[]      = [];
const EMPTY_INVOICES:   Invoice[]       = [];
const EMPTY_WARRANTIES: Warranty[]      = [];
const EMPTY_CHECKLIST:  ChecklistItem[] = [];

export const useDiaryEntries        = (projectId: string) => useGanttSideStore((s) => s.diaryEntries[projectId] ?? EMPTY_DIARY);
export const usePunchItems          = (projectId: string) => useGanttSideStore((s) => s.punchItems[projectId]   ?? EMPTY_PUNCH);
export const useOrdersForProject    = (projectId: string) => useGanttSideStore((s) => s.orders[projectId]       ?? EMPTY_ORDERS);
export const useDeliveries          = (projectId: string) => useGanttSideStore((s) => s.deliveries[projectId]   ?? EMPTY_DELIVERIES);
export const useInvoices            = (projectId: string) => useGanttSideStore((s) => s.invoices[projectId]     ?? EMPTY_INVOICES);
export const useWarrantiesForProject = (projectId: string) => useGanttSideStore((s) => s.warranties[projectId]  ?? EMPTY_WARRANTIES);
export const useChecklist           = (taskId: string)    => useGanttSideStore((s) => s.checklists[taskId]      ?? EMPTY_CHECKLIST);