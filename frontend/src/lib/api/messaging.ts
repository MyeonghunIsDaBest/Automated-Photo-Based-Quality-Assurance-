// CRUD wrappers for the Phase D-1 messaging tables (conversations,
// conversation_members, messages). Mirrors the conventions in
// `lib/api/profiles.ts` — supabaseConfigured() guard, snake↔camel mapping,
// throw on Supabase error.

import { supabase, supabaseConfigured } from '../supabase';
import type { Profile } from '../../types';
import { listProfiles } from './profiles';

// ─── Row shapes (snake_case, mirror DB) ────────────────────────────────────

export interface ConversationRow {
  id: string;
  name: string | null;
  is_group: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ConversationMemberRow {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
}

// ─── Camel-case shapes used in the UI ──────────────────────────────────────

export interface Conversation {
  id: string;
  name: string | null;
  isGroup: boolean;
  createdBy: string | null;
  createdAt: string;
  /** Most-recent message body — joined when fetching the inbox. */
  lastMessageBody?: string | null;
  lastMessageAt?: string | null;
  /** Members; populated by `listMyConversations` so the inbox can render
   *  avatars + the "X others" group caption without a second round-trip. */
  members?: ConversationMember[];
  /** Per-row `last_read_at` for the current user; drives the unread dot. */
  lastReadAt?: string | null;
}

export interface ConversationMember {
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  createdAt: string;
}

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

// ─── Mappers ───────────────────────────────────────────────────────────────

export function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    name: r.name,
    isGroup: r.is_group,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function rowToMember(r: ConversationMemberRow): ConversationMember {
  return {
    conversationId: r.conversation_id,
    userId: r.user_id,
    joinedAt: r.joined_at,
    lastReadAt: r.last_read_at,
  };
}

export function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────

// Lists every conversation the current user is a member of, sorted by most
// recent activity. Joins members + the most recent message in two passes —
// keeps SQL simple, surface area small. Volume of conversations per user
// is low (handful of project rooms), so the second pass is cheap.
export async function listMyConversations(): Promise<Conversation[]> {
  if (!supabaseConfigured()) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Step 1 — pull every conversation we're a member of, plus our own
  // last_read_at on each.
  const { data: memberRows, error: memberErr } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id, joined_at, last_read_at')
    .eq('user_id', user.id);
  if (memberErr) throw memberErr;
  const myConversationIds = (memberRows ?? []).map((m) => m.conversation_id as string);
  if (myConversationIds.length === 0) return [];

  // Step 2 — full conversation rows for those ids.
  const { data: convRows, error: convErr } = await supabase
    .from('conversations')
    .select('*')
    .in('id', myConversationIds);
  if (convErr) throw convErr;

  // Step 3 — every member of every conversation we belong to (RLS filters
  // automatically — only conversations we're in are visible).
  const { data: allMembers, error: allMembersErr } = await supabase
    .from('conversation_members')
    .select('*')
    .in('conversation_id', myConversationIds);
  if (allMembersErr) throw allMembersErr;

  // Step 4 — most recent message per conversation. One query, then group
  // by conversation_id on the client.
  const { data: recentMessages, error: recentErr } = await supabase
    .from('messages')
    .select('conversation_id, body, created_at')
    .in('conversation_id', myConversationIds)
    .order('created_at', { ascending: false });
  if (recentErr) throw recentErr;
  const lastByConv = new Map<string, { body: string; created_at: string }>();
  for (const m of recentMessages ?? []) {
    const id = m.conversation_id as string;
    if (!lastByConv.has(id)) {
      lastByConv.set(id, { body: m.body as string, created_at: m.created_at as string });
    }
  }

  const myLastReadByConv = new Map<string, string | null>(
    (memberRows ?? []).map((m) => [m.conversation_id as string, (m.last_read_at as string | null) ?? null]),
  );

  const membersByConv = new Map<string, ConversationMember[]>();
  for (const m of allMembers ?? []) {
    const id = m.conversation_id as string;
    const list = membersByConv.get(id) ?? [];
    list.push(rowToMember(m as ConversationMemberRow));
    membersByConv.set(id, list);
  }

  return (convRows ?? [])
    .map((r) => {
      const conv = rowToConversation(r as ConversationRow);
      const last = lastByConv.get(conv.id);
      return {
        ...conv,
        members: membersByConv.get(conv.id) ?? [],
        lastMessageBody: last?.body ?? null,
        lastMessageAt: last?.created_at ?? null,
        lastReadAt: myLastReadByConv.get(conv.id) ?? null,
      };
    })
    .sort((a, b) => {
      const at = a.lastMessageAt ?? a.createdAt;
      const bt = b.lastMessageAt ?? b.createdAt;
      return Date.parse(bt) - Date.parse(at);
    });
}

// Newest-first message page for a conversation. `before` is a cursor — pass
// the createdAt of the oldest message in the current view to fetch the
// next slice. Default page size 50 matches the UI's initial render.
export async function listMessages(
  conversationId: string,
  opts?: { before?: string; limit?: number },
): Promise<Message[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.before) q = q.lt('created_at', opts.before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => rowToMessage(r as MessageRow));
}

// ─── Writes ────────────────────────────────────────────────────────────────

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Message body cannot be empty.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id:       user.id,
      body:            trimmed,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToMessage(data as MessageRow);
}

// Returns an existing 1:1 conversation between the current user and
// `otherUserId` if one exists; otherwise creates a fresh conversation +
// adds both users as members. Idempotent at the application layer — a
// concurrent race would briefly yield two rooms; the Pass 3 plan flags
// adding a partial unique index as a follow-up.
export async function createDirectConversation(otherUserId: string): Promise<Conversation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Find existing — pull every direct conversation `me` is in, then check
  // whether each one also has `other` as a member. The select includes a
  // `conversations!inner(...)` join; the row shape is captured below so no
  // `as unknown as` cast is needed at the read site.
  interface MyDirectRow {
    conversation_id: string;
    conversations: ConversationRow;
  }
  const { data: myDirect, error: myErr } = await supabase
    .from('conversation_members')
    .select('conversation_id, conversations!inner(id, is_group, name, created_by, created_at)')
    .eq('user_id', user.id)
    .eq('conversations.is_group', false)
    .returns<MyDirectRow[]>();
  if (myErr) throw myErr;

  const candidateIds = (myDirect ?? []).map((m) => m.conversation_id);
  if (candidateIds.length > 0) {
    const { data: otherMembers, error: otherErr } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .in('conversation_id', candidateIds)
      .eq('user_id', otherUserId);
    if (otherErr) throw otherErr;
    const matchId = (otherMembers ?? [])[0]?.conversation_id as string | undefined;
    if (matchId) {
      const existing = (myDirect ?? []).find((m) => m.conversation_id === matchId);
      if (existing) {
        return rowToConversation(existing.conversations);
      }
    }
  }

  // Create new conversation + both members.
  const { data: convRow, error: convErr } = await supabase
    .from('conversations')
    .insert({ is_group: false, created_by: user.id })
    .select('*')
    .single();
  if (convErr) throw convErr;
  const conv = rowToConversation(convRow as ConversationRow);

  const { error: membersErr } = await supabase
    .from('conversation_members')
    .insert([
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: otherUserId },
    ]);
  if (membersErr) throw membersErr;
  return conv;
}

export async function createGroupConversation(input: {
  name: string;
  memberIds: string[];
}): Promise<Conversation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('Group name is required.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data: convRow, error: convErr } = await supabase
    .from('conversations')
    .insert({ is_group: true, name: trimmedName, created_by: user.id })
    .select('*')
    .single();
  if (convErr) throw convErr;
  const conv = rowToConversation(convRow as ConversationRow);

  // Self + every requested member, deduped — RLS allows the creator to
  // add other members because conversations.created_by = auth.uid().
  const uniqueIds = Array.from(new Set([user.id, ...input.memberIds]));
  const rows = uniqueIds.map((id) => ({ conversation_id: conv.id, user_id: id }));
  const { error: membersErr } = await supabase
    .from('conversation_members')
    .insert(rows);
  if (membersErr) throw membersErr;
  return conv;
}

export async function markRead(conversationId: string): Promise<void> {
  if (!supabaseConfigured()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);
}

// ─── Profile search (used by NewConversationModal) ─────────────────────────

interface SearchOpts {
  excludeUserIds?: string[];
}

// Thin filter on top of `listProfiles` — keeps the search logic in one
// place. Filters out inactive accounts + any explicitly excluded ids
// (typically the caller's own id so they don't message themselves).
export async function searchProfiles(query: string, opts?: SearchOpts): Promise<Profile[]> {
  const all = await listProfiles();
  const q = query.trim().toLowerCase();
  const exclude = new Set(opts?.excludeUserIds ?? []);
  return all
    .filter((p) => p.isActive)
    .filter((p) => !exclude.has(p.id))
    .filter((p) => {
      if (!q) return true;
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      return name.includes(q) || p.email.toLowerCase().includes(q);
    });
}
