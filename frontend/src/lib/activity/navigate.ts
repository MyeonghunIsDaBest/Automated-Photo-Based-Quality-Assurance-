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
      // Go directly to the Uploads tab and pass the photo id forward.
      // The previous `/gallery?photo=…` path hit the App-level redirect
      // (Navigate to=`/gantt?tab=uploads`) which discards the query string,
      // so the photo context was lost. Routing straight to the Gantt
      // preserves `?photo=` for UploadsTab to consume.
      navigate(`/gantt${q(`tab=uploads&photo=${event.targetEntityId}`)}`);
      return;

    case 'safety_flag':
      navigate(`/safety${q(`tab=hazards&incident=${event.targetEntityId}`)}`);
      return;

    case 'order_placed':
    case 'order_received':
      navigate(`/gantt${q(`tab=supplier&order=${event.targetEntityId}`)}`);
      return;

    case 'delivery_received':
      navigate(`/gantt${q(`tab=supplier&delivery=${event.targetEntityId}`)}`);
      return;

    case 'invoice_paid':
      navigate(`/gantt${q(`tab=supplier&invoice=${event.targetEntityId}`)}`);
      return;

    case 'punch_item_added':
    case 'punch_item_closed':
      // Punch list lives as a sub-view under Site Diary. The legacy
      // `?tab=punch_list` alias in Gantt.tsx resolves to it.
      navigate(`/gantt${q(`tab=punch_list&punch=${event.targetEntityId}`)}`);
      return;

    case 'diary_entry':
      navigate(`/gantt${q(`tab=site_diary&diary=${event.targetEntityId}`)}`);
      return;
  }
}
