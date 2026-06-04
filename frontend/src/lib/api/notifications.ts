// Durable-notifications API (Tier-3 #12). Thin, FULLY-GUARDED wrappers around
// the `notifications` table (migration 46). Every call no-ops / swallows when
// Supabase isn't configured OR the table isn't deployed yet, so the in-memory
// bell (useNotificationStore) keeps working unchanged until the migration is
// applied — deploying it is purely additive.

import { supabase, supabaseConfigured } from '../supabase';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  task_id: string | null;
  project_id: string | null;
  read: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  created_at: string;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function listNotifications(limit = 50): Promise<NotificationRow[]> {
  if (!supabaseConfigured()) return [];
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return []; // table may not exist yet — degrade silently
    return (data ?? []) as NotificationRow[];
  } catch {
    return [];
  }
}

export interface NewNotification {
  id?: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  taskId?: string;
  projectId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

export async function insertNotification(n: NewNotification): Promise<void> {
  if (!supabaseConfigured()) return;
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await supabase.from('notifications').insert({
      ...(n.id ? { id: n.id } : {}),
      user_id: uid,
      type: n.type,
      priority: n.priority,
      title: n.title,
      message: n.message,
      task_id: n.taskId ?? null,
      project_id: n.projectId ?? null,
      metadata: n.metadata ?? null,
    });
  } catch {
    /* table missing / RLS — bell still has the optimistic in-memory copy */
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  } catch { /* swallow */ }
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!supabaseConfigured()) return;
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false);
  } catch { /* swallow */ }
}

// Live INSERTs for the signed-in user → push to the bell. No-op when not
// configured. Filter is server-side by user_id so we only get our own rows.
export function subscribeToUserNotifications(
  userId: string,
  onInsert: (row: NotificationRow) => void,
): () => void {
  if (!supabaseConfigured() || !userId) return () => { /* noop */ };
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new as NotificationRow),
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
