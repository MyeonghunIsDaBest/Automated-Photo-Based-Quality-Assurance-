import { useMemo } from 'react';
import { useAppStore } from '../../store';
import { useFeatureStore } from '../../store/features';
import { useGanttSideStore } from '../../pages/gantt/store';
import { useSafetyIncidentsStore } from '../../store/safetyIncidents';
import type { ActivityEvent, ActivityKind } from '../activity/types';

interface Options {
  /** Final cap on the merged, sorted timeline. Default 8. */
  limit?: number;
}

// Per-source cap before merge — keeps the worst-case sort bounded even on
// very active projects. 50 × 13 sources → ≤650 events to sort, which is
// trivial. Each source feeds in source-side time order so taking the head
// of each is safe (we keep the most-recent N per source).
const PER_SOURCE_CAP = 50;

// Read-time activity feed for a project. Walks every relevant slice and
// produces a unified, sorted timeline. Memoised so consumers can call this
// on every render without thrashing.
//
// Phase D follow-up: when the Supabase audit_log API ships, the body of
// this hook can be replaced with a query against that table — the return
// shape (ActivityEvent[]) stays identical so consumers don't have to change.
export function useProjectActivity(projectId: string, opts: Options = {}): ActivityEvent[] {
  const limit = opts.limit ?? 8;

  const tasks       = useFeatureStore((s) => s.tasks);
  const comments    = useFeatureStore((s) => s.comments);
  const photos      = useAppStore((s) => s.photos);
  const users       = useAppStore((s) => s.users);
  const orders      = useGanttSideStore((s) => s.orders);
  const deliveries  = useGanttSideStore((s) => s.deliveries);
  const invoices    = useGanttSideStore((s) => s.invoices);
  const diary       = useGanttSideStore((s) => s.diaryEntries);
  const punch       = useGanttSideStore((s) => s.punchItems);
  const incidents   = useSafetyIncidentsStore((s) => s.incidents);

  return useMemo(() => {
    const projectTasks = tasks.filter((t) => t.projectId === projectId);
    const taskById = new Map(projectTasks.map((t) => [t.id, t]));

    // Actor names, resolved: some sources store a raw user id (photos'
    // uploadedBy), others already store a display NAME (deliveries'
    // receivedBy is free text from the wizard). Resolve ids through the users
    // map; pass real names straight through; only an unresolvable UUID reads
    // as "Someone" — the feed never prints a 36-character code as a person.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const userById = new Map(users.map((u) => [u.id, u.fullName]));
    const nameFor = (v: string | null | undefined): string => {
      if (!v) return 'Someone';
      const resolved = userById.get(v);
      if (resolved) return resolved;
      return UUID_RE.test(v) ? 'Someone' : v;
    };

    // Build per-source arrays separately so we can cap each before merging.
    const taskEvents: ActivityEvent[] = [];
    for (const t of projectTasks) {
      if (!t.lastUpdated) continue;
      taskEvents.push({
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

    const photoEvents: ActivityEvent[] = [];
    const aiEvents:    ActivityEvent[] = [];
    for (const p of photos) {
      if (p.projectId !== projectId) continue;
      const taskName = p.taskId ? taskById.get(p.taskId)?.name : undefined;
      photoEvents.push({
        id: `photo_upload:${p.id}:${p.uploadedAt}`,
        kind: 'photo_upload',
        actorId: p.uploadedBy,
        actorName: nameFor(p.uploadedBy),
        targetLabel: taskName ? `Photo on ${taskName}` : `Photo: ${p.filename ?? p.id}`,
        targetTabId: 'uploads',
        targetEntityId: p.id,
        timestamp: p.uploadedAt,
      });

      // ai_analysed — fired by the existence of the analysis row, not by
      // a state flip. Once the analyser writes back, `analyzedAt` is set and
      // the analysis_status leaves the queued/analysing range; that's our
      // event. No prev-state ref-tracking needed.
      const a = p.aiAnalysis;
      if (a && a.analyzedAt && a.analysisStatus !== 'queued' && a.analysisStatus !== 'analysing') {
        aiEvents.push({
          id: `ai_analysed:${p.id}:${a.analyzedAt}`,
          kind: 'ai_analysed',
          actorId: 'system',
          actorName: a.modelUsed,
          targetLabel: taskName
            ? `AI ${a.completionPct}% on ${taskName}`
            : `AI ${a.completionPct}% — ${p.filename ?? p.id}`,
          targetTabId: 'uploads',
          targetEntityId: p.id,
          timestamp: a.analyzedAt,
        });
      }
    }

    const safetyEvents: ActivityEvent[] = [];
    for (const i of incidents) {
      if (i.projectId !== projectId) continue;
      const lead = i.flags[0]?.replace(/_/g, ' ') ?? 'safety flag';
      safetyEvents.push({
        id: `safety_flag:${i.id}:${i.createdAt}`,
        kind: 'safety_flag',
        actorId: 'system',
        actorName: i.aiAnalysisId ? 'AI safety check' : 'Manual',
        targetLabel: i.flags.length > 1
          ? `${i.severity} hazard — ${lead} +${i.flags.length - 1}`
          : `${i.severity} hazard — ${lead}`,
        targetTabId: 'overview',
        targetEntityId: i.id,
        timestamp: i.createdAt,
      });
    }

    const orderEvents: ActivityEvent[] = [];
    for (const o of orders[projectId] ?? []) {
      orderEvents.push({
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
        orderEvents.push({
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

    const deliveryEvents: ActivityEvent[] = [];
    for (const d of deliveries[projectId] ?? []) {
      deliveryEvents.push({
        id: `delivery_received:${d.id}`,
        kind: 'delivery_received',
        actorId: d.receivedBy,
        actorName: nameFor(d.receivedBy),
        targetLabel: `Delivery received — ${d.items.length} line${d.items.length === 1 ? '' : 's'}`,
        targetTabId: 'deliveries',
        targetEntityId: d.id,
        timestamp: d.receivedDate,
      });
    }

    const invoiceEvents: ActivityEvent[] = [];
    for (const inv of invoices[projectId] ?? []) {
      if (inv.status !== 'paid' || !inv.paidDate) continue;
      invoiceEvents.push({
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

    const punchEvents: ActivityEvent[] = [];
    for (const p of punch[projectId] ?? []) {
      punchEvents.push({
        id: `punch_item_added:${p.id}`,
        kind: 'punch_item_added',
        actorId: p.createdBy,
        actorName: nameFor(p.createdBy),
        targetLabel: `Punch: ${p.text}`,
        targetTabId: 'punch_list',
        targetEntityId: p.id,
        timestamp: p.createdAt,
      });
      if (p.status === 'done' && p.closedAt) {
        punchEvents.push({
          id: `punch_item_closed:${p.id}`,
          kind: 'punch_item_closed',
          actorId: p.createdBy,
          actorName: nameFor(p.createdBy),
          targetLabel: `Closed: ${p.text}`,
          targetTabId: 'punch_list',
          targetEntityId: p.id,
          timestamp: p.closedAt,
        });
      }
    }

    const diaryEvents: ActivityEvent[] = [];
    for (const e of diary[projectId] ?? []) {
      const headcount = e.personnel.reduce((s, pp) => s + pp.hours, 0);
      diaryEvents.push({
        id: `diary_entry:${e.id}`,
        kind: 'diary_entry',
        actorId: e.createdBy,
        actorName: nameFor(e.createdBy),
        targetLabel: `Site diary — ${e.personnel.length} crew · ${headcount}h`,
        targetTabId: 'site_diary',
        targetEntityId: e.id,
        timestamp: e.createdAt,
      });
    }

    const commentEvents: ActivityEvent[] = [];
    for (const c of comments) {
      if (!c.taskId) continue;
      const t = taskById.get(c.taskId);
      if (!t) continue;
      commentEvents.push({
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

    // Per-source cap → merge → global sort → final slice. Capping inside
    // each bucket first prevents one chatty source from drowning the others.
    const merged: ActivityEvent[] = [
      ...sortDescBy(taskEvents,     'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(photoEvents,    'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(aiEvents,       'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(safetyEvents,   'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(orderEvents,    'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(deliveryEvents, 'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(invoiceEvents,  'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(punchEvents,    'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(diaryEvents,    'timestamp').slice(0, PER_SOURCE_CAP),
      ...sortDescBy(commentEvents,  'timestamp').slice(0, PER_SOURCE_CAP),
    ];

    return sortDescBy(merged, 'timestamp').slice(0, limit);
  }, [projectId, limit, tasks, comments, photos, users, orders, deliveries, invoices, diary, punch, incidents]);
}

function sortDescBy(events: ActivityEvent[], key: 'timestamp'): ActivityEvent[] {
  return [...events].sort((a, b) => parseTime(b[key]) - parseTime(a[key]));
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
  ai_analysed:       'analysed photo',
  safety_flag:       'flagged hazard',
};
