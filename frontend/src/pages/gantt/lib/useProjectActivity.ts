import { useMemo } from 'react';
import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { useGanttSideStore } from '../store';
import type { ActivityEvent, ActivityKind, TabId } from '../types';

interface Options {
  limit?: number;
}

// Read-time activity feed for a project. Walks every relevant slice and
// produces a unified, sorted timeline. Memoized so the Overview tab can
// call this on every render without thrashing.
//
// When we move to Supabase, replace the body with a query against the real
// audit_log table — the return shape (ActivityEvent[]) stays identical.
export function useProjectActivity(projectId: string, opts: Options = {}): ActivityEvent[] {
  const limit = opts.limit ?? 8;

  const tasks       = useFeatureStore((s) => s.tasks);
  const comments    = useFeatureStore((s) => s.comments);
  const photos      = useAppStore((s) => s.photos);
  const orders      = useGanttSideStore((s) => s.orders);
  const deliveries  = useGanttSideStore((s) => s.deliveries);
  const invoices    = useGanttSideStore((s) => s.invoices);
  const diary       = useGanttSideStore((s) => s.diaryEntries);
  const punch       = useGanttSideStore((s) => s.punchItems);

  return useMemo(() => {
    const events: ActivityEvent[] = [];

    const projectTasks = tasks.filter((t) => t.projectId === projectId);
    const taskById = new Map(projectTasks.map((t) => [t.id, t]));

    // ── Task progress updates ──────────────────────────────────────────
    for (const t of projectTasks) {
      if (!t.lastUpdated) continue;
      events.push({
        id: `task_progress:${t.id}:${t.lastUpdated}`,
        kind: 'task_progress',
        actorId: 'system',
        actorName: t.updateSource === 'ai_auto' ? 'AI Analysis' : 'Manual',
        targetLabel: `${t.name} → ${t.percentComplete}%`,
        targetTabId: 'overview',
        targetEntityId: t.id,
        timestamp: t.lastUpdated,
      });
    }

    // ── Photo uploads ──────────────────────────────────────────────────
    for (const p of photos) {
      if (p.projectId !== projectId) continue;
      const taskName = p.taskId ? taskById.get(p.taskId)?.name : undefined;
      events.push({
        id: `photo_upload:${p.id}:${p.uploadedAt}`,
        kind: 'photo_upload',
        actorId: p.uploadedBy,
        actorName: p.uploadedBy,
        targetLabel: taskName ? `Photo on ${taskName}` : `Photo: ${p.filename ?? p.id}`,
        targetTabId: 'uploads',
        targetEntityId: p.id,
        timestamp: p.uploadedAt,
      });
    }

    // ── Orders ─────────────────────────────────────────────────────────
    for (const o of orders[projectId] ?? []) {
      events.push({
        id: `order_placed:${o.id}:${o.orderedDate}`,
        kind: 'order_placed',
        actorId: 'system',
        actorName: o.supplierName,
        targetLabel: `${o.poNumber} — ${o.lineItems.length} item${o.lineItems.length === 1 ? '' : 's'}`,
        targetTabId: 'orders',
        targetEntityId: o.id,
        timestamp: o.orderedDate,
      });
      if (o.status === 'received') {
        events.push({
          id: `order_received:${o.id}`,
          kind: 'order_received',
          actorId: 'system',
          actorName: o.supplierName,
          targetLabel: `${o.poNumber} fully received`,
          targetTabId: 'orders',
          targetEntityId: o.id,
          timestamp: o.expectedDelivery ?? o.orderedDate,
        });
      }
    }

    // ── Deliveries ─────────────────────────────────────────────────────
    for (const d of deliveries[projectId] ?? []) {
      events.push({
        id: `delivery_received:${d.id}`,
        kind: 'delivery_received',
        actorId: d.receivedBy,
        actorName: d.receivedBy,
        targetLabel: `Delivery received — ${d.items.length} line${d.items.length === 1 ? '' : 's'}`,
        targetTabId: 'deliveries',
        targetEntityId: d.id,
        timestamp: d.receivedDate,
      });
    }

    // ── Invoices ───────────────────────────────────────────────────────
    for (const inv of invoices[projectId] ?? []) {
      if (inv.status !== 'paid' || !inv.paidDate) continue;
      events.push({
        id: `invoice_paid:${inv.id}`,
        kind: 'invoice_paid',
        actorId: 'system',
        actorName: 'Accounts',
        targetLabel: `Invoice ${inv.invoiceNumber} paid — $${inv.amount.toLocaleString()}`,
        targetTabId: 'invoices',
        targetEntityId: inv.id,
        timestamp: inv.paidDate,
      });
    }

    // ── Punch list adds & closes ───────────────────────────────────────
    for (const p of punch[projectId] ?? []) {
      events.push({
        id: `punch_item_added:${p.id}`,
        kind: 'punch_item_added',
        actorId: p.createdBy,
        actorName: p.createdBy,
        targetLabel: `Punch: ${p.text}`,
        targetTabId: 'punch_list',
        targetEntityId: p.id,
        timestamp: p.createdAt,
      });
      if (p.status === 'done' && p.closedAt) {
        events.push({
          id: `punch_item_closed:${p.id}`,
          kind: 'punch_item_closed',
          actorId: p.createdBy,
          actorName: p.createdBy,
          targetLabel: `Closed: ${p.text}`,
          targetTabId: 'punch_list',
          targetEntityId: p.id,
          timestamp: p.closedAt,
        });
      }
    }

    // ── Diary entries ──────────────────────────────────────────────────
    for (const e of diary[projectId] ?? []) {
      const headcount = e.personnel.reduce((s, p) => s + p.hours, 0);
      events.push({
        id: `diary_entry:${e.id}`,
        kind: 'diary_entry',
        actorId: e.createdBy,
        actorName: e.createdBy,
        targetLabel: `Site diary — ${e.personnel.length} crew · ${headcount}h`,
        targetTabId: 'site_diary',
        targetEntityId: e.id,
        timestamp: e.createdAt,
      });
    }

    // ── Comments ───────────────────────────────────────────────────────
    for (const c of comments) {
      const t = taskById.get(c.taskId);
      if (!t) continue;
      events.push({
        id: `comment_added:${c.id}`,
        kind: 'comment_added',
        actorId: c.userId,
        actorName: c.userName,
        targetLabel: `Note on ${t.name}`,
        targetTabId: 'tasks',
        targetEntityId: t.id,
        timestamp: c.createdAt,
      });
    }

    // Sort newest-first, take the cap.
    return events
      .sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp))
      .slice(0, limit);
  }, [projectId, limit, tasks, comments, photos, orders, deliveries, invoices, diary, punch]);
}

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

// Lightweight verb mapping — drives the activity feed's icon + verb tone.
export const ACTIVITY_VERBS: Record<ActivityKind, string> = {
  task_progress:     'updated',
  task_created:      'created task',
  photo_upload:      'uploaded',
  order_placed:      'placed order',
  order_received:    'received order',
  delivery_received: 'logged delivery',
  invoice_paid:      'paid invoice',
  punch_item_added:  'added punch item',
  punch_item_closed: 'closed punch item',
  diary_entry:       'logged site diary',
  comment_added:     'commented',
};

export function activityTabLabel(_e: ActivityEvent): TabId {
  return _e.targetTabId;
}