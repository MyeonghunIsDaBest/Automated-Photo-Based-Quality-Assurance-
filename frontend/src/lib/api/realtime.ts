// Thin wrapper around Supabase Realtime so feature components don't need
// to know about the channel object. Each helper returns an `unsubscribe`
// function — call it in a `useEffect` cleanup.

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../supabase';
import {
  useRealtimeStatusStore,
  type RealtimeChannelStatus,
} from '../../store/realtimeStatus';
import type { TaskRow } from './tasks';
import type { PhotoRow } from './photos';
import type { AIAnalysisRow } from './aiAnalyses';
import type { SafetyIncidentRow } from './safetyIncidents';

type Unsubscribe = () => void;

function noop(): Unsubscribe {
  return () => void 0;
}

// Shared status callback used by every channel below. Pushes the latest
// state into the global realtimeStatus store so TopNav can light up the
// "Reconnecting…" pill if anything stays degraded.
function reportStatus(channelName: string): (status: string) => void {
  return (status: string) => {
    useRealtimeStatusStore.getState().setStatus(
      channelName,
      status as RealtimeChannelStatus,
    );
  };
}
function clearStatus(channelName: string) {
  useRealtimeStatusStore.getState().clear(channelName);
}

// Subscribe to every change on the `tasks` table for a single project.
// Use case: keep the Gantt in sync while another window is editing.
export function subscribeToProjectTasks(
  projectId: string,
  onChange: (payload: RealtimePostgresChangesPayload<TaskRow>) => void,
): Unsubscribe {
  if (!supabaseConfigured()) return noop();

  const name = `tasks:${projectId}`;
  const channel: RealtimeChannel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
      (payload) => onChange(payload as RealtimePostgresChangesPayload<TaskRow>),
    )
    .subscribe(reportStatus(name));

  return () => {
    clearStatus(name);
    supabase.removeChannel(channel);
  };
}

// Subscribe to new photos for a project (INSERT-only) — feeds the
// activity sidebar / Files page.
export function subscribeToProjectPhotos(
  projectId: string,
  onInsert: (photo: PhotoRow) => void,
): Unsubscribe {
  if (!supabaseConfigured()) return noop();

  const name = `photos:${projectId}`;
  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'photos', filter: `project_id=eq.${projectId}` },
      (payload) => onInsert(payload.new as PhotoRow),
    )
    .subscribe(reportStatus(name));

  return () => {
    clearStatus(name);
    supabase.removeChannel(channel);
  };
}

// Subscribe to every change on `safety_incidents` for a project. Fed into
// the Layout-level safety incidents cache + dashboard counts. UPDATEs flip
// the status (open→acknowledged→resolved); the cache upserts on each.
export function subscribeToProjectSafetyIncidents(
  projectId: string,
  onChange: (payload: RealtimePostgresChangesPayload<SafetyIncidentRow>) => void,
): Unsubscribe {
  if (!supabaseConfigured()) return noop();

  const name = `safety-incidents:${projectId}`;
  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'safety_incidents', filter: `project_id=eq.${projectId}` },
      (payload) => onChange(payload as RealtimePostgresChangesPayload<SafetyIncidentRow>),
    )
    .subscribe(reportStatus(name));

  return () => {
    clearStatus(name);
    supabase.removeChannel(channel);
  };
}

// Subscribe to every change on the `comments` table for a project. The
// table doesn't carry project_id directly — comments live on tasks, so we
// can't filter server-side without a join. Layout-level subscribers receive
// every comment fire and filter on the client; cheap because comment
// volume is low.
export function subscribeToAllComments(
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
): Unsubscribe {
  if (!supabaseConfigured()) return noop();

  const name = `comments:all`;
  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments' },
      (payload) => onChange(payload as RealtimePostgresChangesPayload<Record<string, unknown>>),
    )
    .subscribe(reportStatus(name));

  return () => {
    clearStatus(name);
    supabase.removeChannel(channel);
  };
}

// Subscribe to every change on `ai_analyses`. Like comments, ai_analyses
// joins to project via photos.project_id; layout-level subscribers receive
// every event and filter on the client. INSERT carries the queued row;
// UPDATE flips analysis_status / action_taken — both kinds matter for
// the dashboard tiles + activity feed.
export function subscribeToAllAnalyses(
  onChange: (payload: RealtimePostgresChangesPayload<AIAnalysisRow>) => void,
): Unsubscribe {
  if (!supabaseConfigured()) return noop();

  const name = `ai-analyses:all`;
  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ai_analyses' },
      (payload) => onChange(payload as RealtimePostgresChangesPayload<AIAnalysisRow>),
    )
    .subscribe(reportStatus(name));

  return () => {
    clearStatus(name);
    supabase.removeChannel(channel);
  };
}
