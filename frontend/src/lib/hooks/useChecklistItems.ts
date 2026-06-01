// Shared per-task checklist state, backed by Supabase (roadmap P1.6). Both the
// Task drawer's progress block (reads `items` for the done%) and its Checklist
// pane (reads + mutates) call this hook. Loads on mount, subscribes to realtime,
// and exposes optimistic add/toggle/remove. Empty + inert in mock mode or for a
// non-UUID (demo) task id.

import { useCallback, useEffect, useState } from 'react';
import type { ChecklistItem } from '../../pages/gantt/types';
import {
  listChecklistItems,
  createChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  subscribeToTaskChecklist,
} from '../api/checklistItems';

export interface UseChecklistItems {
  items: ChecklistItem[];
  addItem: (text: string) => void;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
}

export function useChecklistItems(taskId: string): UseChecklistItems {
  const [items, setItems] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    void listChecklistItems(taskId)
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { /* empty in mock mode / on error */ });
    const unsubscribe = subscribeToTaskChecklist(taskId, {
      onInsert: (i) => setItems((prev) => (prev.some((x) => x.id === i.id) ? prev : [...prev, i])),
      onUpdate: (i) => setItems((prev) => prev.map((x) => (x.id === i.id ? i : x))),
      onDelete: (id) => setItems((prev) => prev.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [taskId]);

  const addItem = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void createChecklistItem(taskId, trimmed)
      .then((created) => setItems((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created])))
      .catch(() => { /* surfaced by the realtime miss; non-fatal */ });
  }, [taskId]);

  const toggleItem = useCallback((id: string) => {
    setItems((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      const done = !x.done;
      void updateChecklistItem(id, { done, closedAt: done ? new Date().toISOString() : null }).catch(() => void 0);
      return { ...x, done, closedAt: done ? new Date().toISOString() : undefined };
    }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    void deleteChecklistItem(id).catch(() => void 0);
  }, []);

  return { items, addItem, toggleItem, removeItem };
}
