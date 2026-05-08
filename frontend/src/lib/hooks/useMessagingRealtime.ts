import { useEffect } from 'react';
import { supabase, supabaseConfigured } from '../supabase';
import { useMessagingStore } from '../../store/messaging';
import {
  listMyConversations,
  rowToMessage,
  type MessageRow,
} from '../api/messaging';

// Layout-level messaging realtime — fires on every new message and on
// conversation_member inserts that include the current user (i.e. someone
// added them to a group). Cold-load is handled by the same hook to keep
// the cache lifecycle in one place.
//
// Pattern lifted from `useSafetyRealtime`. One channel per user-session,
// removed on sign-out / project switch.
export function useMessagingRealtime(currentUserId: string | null | undefined): void {
  const setConversations = useMessagingStore((s) => s.setConversations);
  const updateLastRead = useMessagingStore((s) => s.updateLastRead);
  const appendMessage = useMessagingStore((s) => s.appendMessage);
  const reset = useMessagingStore((s) => s.reset);

  useEffect(() => {
    if (!supabaseConfigured() || !currentUserId) {
      reset();
      return;
    }

    let cancelled = false;

    const refreshConversations = async () => {
      try {
        const list = await listMyConversations();
        if (!cancelled) setConversations(list);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[useMessagingRealtime] refreshConversations failed:', e);
      }
    };

    void refreshConversations();

    // Two filters: every messages INSERT (we filter on the client by
    // checking the cache; if the conversation isn't already in our cache,
    // a new member was just added — refresh) + conversation_members INSERT
    // for the current user (added to a new group).
    const channel = supabase
      .channel(`messaging:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as MessageRow;
          const cache = useMessagingStore.getState();
          if (cache.conversations.some((c) => c.id === row.conversation_id)) {
            appendMessage(rowToMessage(row));
          } else {
            // Not in cache yet — likely a fresh group add. Re-pull the
            // inbox so the new room appears with its first message.
            void refreshConversations();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => void refreshConversations(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          // markRead writes here — push the new last_read_at back so the
          // unread dot drops in this tab + every other open tab.
          const row = payload.new as { conversation_id: string; last_read_at: string | null };
          if (row.last_read_at) {
            updateLastRead(row.conversation_id, row.last_read_at);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, setConversations, updateLastRead, appendMessage, reset]);
}
