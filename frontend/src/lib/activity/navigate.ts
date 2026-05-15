// Shared deep-link router for ActivityFeed rows. Both the Dashboard
// "Recent activity" panel and the Gantt Overview "Live activity" panel
// route clicks through this — so a row click always lands on the same
// destination, regardless of which page hosted the feed.
//
// Routing is keyed off the event `kind` first (so a `task_progress` event
// always opens the task drawer, even though `targetTabId='overview'`),
// then falls back to `targetTabId` for kinds we don't special-case.

import type { NavigateFunction } from 'react-router-dom';
import type { ActivityEvent } from './types';

export function navigateActivityEvent(
  event: ActivityEvent,
  projectId: string,
  navigate: NavigateFunction,
): void {
  const q = (extra: string) => `?project=${projectId}&${extra}`;

  switch (event.kind) {
    case 'task_progress':
    case 'task_created':
    case 'comment_added':
      // Opens the TaskDrawer for the specific task.
      navigate(`/gantt${q(`tab=tasks&task=${event.targetEntityId}`)}`);
      return;

    case 'photo_upload':
    case 'ai_analysed':
      // Photo lightbox in the gallery.
      navigate(`/gallery${q(`photo=${event.targetEntityId}`)}`);
      return;

    case 'safety_flag':
      navigate(`/safety${q(`tab=hazards&incident=${event.targetEntityId}`)}`);
      return;

    case 'order_placed':
    case 'order_received':
    case 'delivery_received':
    case 'invoice_paid':
      // All procurement events resolve to the merged Supplier tab. Per-
      // entity deep-link inside Supplier isn't wired yet (Supplier's URL
      // hydration doesn't recognise `?order=` etc.) — landing the user on
      // the tab is the first step; entity scroll-to comes in a follow-up.
      navigate(`/gantt${q('tab=supplier')}`);
      return;

    case 'punch_item_added':
    case 'punch_item_closed':
      // Punch list lives as a sub-view under Site Diary. The legacy
      // `?tab=punch_list` alias in Gantt.tsx resolves to it.
      navigate(`/gantt${q('tab=punch_list')}`);
      return;

    case 'diary_entry':
      navigate(`/gantt${q('tab=site_diary')}`);
      return;
  }
}
