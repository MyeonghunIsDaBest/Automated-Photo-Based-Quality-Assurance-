import { useEffect } from 'react';
import { useNotificationStore } from '../../store/notifications';
import { subscribeToUserNotifications } from '../api/notifications';
import { supabaseConfigured } from '../supabase';

// Durable-notifications wiring (Tier-3 #12). On sign-in: hydrate the bell from
// the `notifications` table (so prior alerts survive a reload), then subscribe
// to live INSERTs for this user (so a teammate-triggered alert — e.g. being
// added to a project — pushes in real time and across devices).
//
// Fully degrades: when Supabase isn't configured or migration 46 isn't applied,
// hydrate() returns nothing and the subscription is a no-op, leaving the
// existing in-memory bell behaviour untouched. Mounted once in Layout.
export function useNotificationsRealtime(userId: string | null | undefined): void {
  useEffect(() => {
    if (!supabaseConfigured() || !userId) return;

    void useNotificationStore.getState().hydrate();

    const unsubscribe = subscribeToUserNotifications(userId, (row) => {
      useNotificationStore.getState().upsertFromRow(row);
    });

    return unsubscribe;
  }, [userId]);
}
