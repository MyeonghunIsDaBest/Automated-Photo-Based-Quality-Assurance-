// Messaging cache. Backend is the source of truth (Phase D-1 Supabase
// tables); this store holds the in-memory mirror so the UI doesn't need a
// round-trip on every render. The layout-level `useMessagingRealtime` hook
// keeps the cache fresh by upserting on every realtime fire.
//
// Pre-Phase-D this store was Zustand+localStorage seeded with fake
// contacts and conversations. The persist middleware was dropped on the
// backend swap — we don't want to render stale messages from a previous
// session, especially across logins.

import { create } from 'zustand';
import type { Conversation, Message } from '../lib/api/messaging';

interface MessagingState {
  conversations: Conversation[];
  messagesByConv: Record<string, Message[]>;
  /** True once `listMyConversations()` has resolved at least once. */
  loaded: boolean;

  setConversations: (rows: Conversation[]) => void;
  upsertConversation: (row: Conversation) => void;
  setMessages: (conversationId: string, msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  updateLastRead: (conversationId: string, ts: string) => void;
  reset: () => void;
}

export const useMessagingStore = create<MessagingState>((set) => ({
  conversations: [],
  messagesByConv: {},
  loaded: false,

  setConversations: (rows) => set({ conversations: rows, loaded: true }),

  upsertConversation: (row) =>
    set((state) => {
      const idx = state.conversations.findIndex((c) => c.id === row.id);
      if (idx < 0) return { conversations: [row, ...state.conversations] };
      const next = state.conversations.slice();
      next[idx] = { ...next[idx], ...row };
      return { conversations: next };
    }),

  setMessages: (conversationId, msgs) =>
    set((state) => ({
      messagesByConv: { ...state.messagesByConv, [conversationId]: msgs },
    })),

  appendMessage: (msg) =>
    set((state) => {
      const list = state.messagesByConv[msg.conversationId] ?? [];
      // Dedupe — realtime can race with the local insert that returned the
      // same row from `sendMessage`. Drop if we've already seen the id.
      if (list.some((m) => m.id === msg.id)) return state;
      // Bump the parent conversation's lastMessage* + sort by recency.
      const conversations = state.conversations.map((c) =>
        c.id === msg.conversationId
          ? { ...c, lastMessageBody: msg.body, lastMessageAt: msg.createdAt }
          : c,
      );
      // Re-sort descending by lastMessageAt fallback to createdAt.
      conversations.sort((a, b) => {
        const at = a.lastMessageAt ?? a.createdAt;
        const bt = b.lastMessageAt ?? b.createdAt;
        return Date.parse(bt) - Date.parse(at);
      });
      return {
        messagesByConv: { ...state.messagesByConv, [msg.conversationId]: [...list, msg] },
        conversations,
      };
    }),

  updateLastRead: (conversationId, ts) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastReadAt: ts } : c,
      ),
    })),

  reset: () => set({ conversations: [], messagesByConv: {}, loaded: false }),
}));
