import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ChangeOrder,
  ChangeOrderStatus,
  DailyLogEntry,
  Selection,
  SelectionStatus,
  Todo,
  Warranty,
} from './types';

// One Zustand slice for all four local-only tabs (daily logs, to-dos,
// change orders, selections, warranties). Persisted to localStorage so
// the demo survives a tab refresh. Replace with Supabase tables once a
// schema lands per entity.
//
// Convention: every collection is keyed by projectId so a single user
// switching active projects sees the right data. Project-agnostic
// callsites read `state.x[projectId] ?? []`.

interface GanttSideState {
  dailyLogs:    Record<string, DailyLogEntry[]>;
  todos:        Record<string, Todo[]>;
  changeOrders: Record<string, ChangeOrder[]>;
  selections:   Record<string, Selection[]>;
  warranties:   Record<string, Warranty[]>;

  addDailyLog: (projectId: string, entry: Omit<DailyLogEntry, 'id' | 'projectId' | 'createdAt'>) => void;
  removeDailyLog: (projectId: string, id: string) => void;

  addTodo: (projectId: string, text: string, dueDate?: string) => void;
  toggleTodo: (projectId: string, id: string) => void;
  removeTodo: (projectId: string, id: string) => void;

  addChangeOrder: (projectId: string, input: Omit<ChangeOrder, 'id' | 'projectId' | 'createdAt'>) => void;
  setChangeOrderStatus: (projectId: string, id: string, status: ChangeOrderStatus) => void;
  removeChangeOrder: (projectId: string, id: string) => void;

  addSelection: (projectId: string, input: Omit<Selection, 'id' | 'projectId' | 'createdAt'>) => void;
  setSelectionStatus: (projectId: string, id: string, status: SelectionStatus) => void;
  removeSelection: (projectId: string, id: string) => void;

  addWarranty: (projectId: string, input: Omit<Warranty, 'id' | 'projectId' | 'createdAt'>) => void;
  removeWarranty: (projectId: string, id: string) => void;
}

const newId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const useGanttSideStore = create<GanttSideState>()(
  persist(
    (set) => ({
      dailyLogs:    {},
      todos:        {},
      changeOrders: {},
      selections:   {},
      warranties:   {},

      // ─── Daily logs ────────────────────────────────────────────────
      addDailyLog: (projectId, entry) =>
        set((state) => ({
          dailyLogs: {
            ...state.dailyLogs,
            [projectId]: [
              {
                ...entry,
                id: newId('log'),
                projectId,
                createdAt: new Date().toISOString(),
              },
              ...(state.dailyLogs[projectId] ?? []),
            ],
          },
        })),
      removeDailyLog: (projectId, id) =>
        set((state) => ({
          dailyLogs: {
            ...state.dailyLogs,
            [projectId]: (state.dailyLogs[projectId] ?? []).filter((l) => l.id !== id),
          },
        })),

      // ─── To-dos ────────────────────────────────────────────────────
      addTodo: (projectId, text, dueDate) =>
        set((state) => ({
          todos: {
            ...state.todos,
            [projectId]: [
              {
                id: newId('todo'),
                projectId,
                text,
                done: false,
                dueDate,
                createdAt: new Date().toISOString(),
              },
              ...(state.todos[projectId] ?? []),
            ],
          },
        })),
      toggleTodo: (projectId, id) =>
        set((state) => ({
          todos: {
            ...state.todos,
            [projectId]: (state.todos[projectId] ?? []).map((t) =>
              t.id === id ? { ...t, done: !t.done } : t,
            ),
          },
        })),
      removeTodo: (projectId, id) =>
        set((state) => ({
          todos: {
            ...state.todos,
            [projectId]: (state.todos[projectId] ?? []).filter((t) => t.id !== id),
          },
        })),

      // ─── Change orders ─────────────────────────────────────────────
      addChangeOrder: (projectId, input) =>
        set((state) => ({
          changeOrders: {
            ...state.changeOrders,
            [projectId]: [
              {
                ...input,
                id: newId('co'),
                projectId,
                createdAt: new Date().toISOString(),
              },
              ...(state.changeOrders[projectId] ?? []),
            ],
          },
        })),
      setChangeOrderStatus: (projectId, id, status) =>
        set((state) => ({
          changeOrders: {
            ...state.changeOrders,
            [projectId]: (state.changeOrders[projectId] ?? []).map((c) =>
              c.id === id ? { ...c, status } : c,
            ),
          },
        })),
      removeChangeOrder: (projectId, id) =>
        set((state) => ({
          changeOrders: {
            ...state.changeOrders,
            [projectId]: (state.changeOrders[projectId] ?? []).filter((c) => c.id !== id),
          },
        })),

      // ─── Selections ────────────────────────────────────────────────
      addSelection: (projectId, input) =>
        set((state) => ({
          selections: {
            ...state.selections,
            [projectId]: [
              {
                ...input,
                id: newId('sel'),
                projectId,
                createdAt: new Date().toISOString(),
              },
              ...(state.selections[projectId] ?? []),
            ],
          },
        })),
      setSelectionStatus: (projectId, id, status) =>
        set((state) => ({
          selections: {
            ...state.selections,
            [projectId]: (state.selections[projectId] ?? []).map((s) =>
              s.id === id ? { ...s, status } : s,
            ),
          },
        })),
      removeSelection: (projectId, id) =>
        set((state) => ({
          selections: {
            ...state.selections,
            [projectId]: (state.selections[projectId] ?? []).filter((s) => s.id !== id),
          },
        })),

      // ─── Warranties ────────────────────────────────────────────────
      addWarranty: (projectId, input) =>
        set((state) => ({
          warranties: {
            ...state.warranties,
            [projectId]: [
              {
                ...input,
                id: newId('warr'),
                projectId,
                createdAt: new Date().toISOString(),
              },
              ...(state.warranties[projectId] ?? []),
            ],
          },
        })),
      removeWarranty: (projectId, id) =>
        set((state) => ({
          warranties: {
            ...state.warranties,
            [projectId]: (state.warranties[projectId] ?? []).filter((w) => w.id !== id),
          },
        })),
    }),
    {
      name: 'siteproof-gantt-side',
      version: 1,
      // Defensive merge — if the persisted blob predates one of these slices
      // (e.g. an early demo user with no `warranties` key), the missing slice
      // would arrive as `undefined` and crash every consumer that does
      // `state.warranties[projectId]`. Normalise here so the store always has
      // every slice as an object.
      merge: (persisted, current) => {
        const safe = (persisted ?? {}) as Partial<GanttSideState>;
        return {
          ...current,
          ...safe,
          dailyLogs:    safe.dailyLogs    ?? current.dailyLogs,
          todos:        safe.todos        ?? current.todos,
          changeOrders: safe.changeOrders ?? current.changeOrders,
          selections:   safe.selections   ?? current.selections,
          warranties:   safe.warranties   ?? current.warranties,
        };
      },
    },
  ),
);
