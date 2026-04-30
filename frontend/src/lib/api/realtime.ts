// Thin wrapper around Supabase Realtime so feature components don't need
// to know about the channel object. Each helper returns an `unsubscribe`
// function — call it in a `useEffect` cleanup.

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../supabase';
import type { TaskRow } from './tasks';
import type { PhotoRow } from './photos';

type Unsubscribe = () => void;

function noop(): Unsubscribe {
  return () => void 0;
}

// Subscribe to every change on the `tasks` table for a single project.
// Use case: keep the Gantt in sync while another window is editing.
export function subscribeToProjectTasks(
  projectId: string,
  onChange: (payload: RealtimePostgresChangesPayload<TaskRow>) => void,
): Unsubscribe {
  if (!supabaseConfigured()) return noop();

  const channel: RealtimeChannel = supabase
    .channel(`tasks:${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
      (payload) => onChange(payload as RealtimePostgresChangesPayload<TaskRow>),
    )
    .subscribe();

  return () => {
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

  const channel = supabase
    .channel(`photos:${projectId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'photos', filter: `project_id=eq.${projectId}` },
      (payload) => onInsert(payload.new as PhotoRow),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
