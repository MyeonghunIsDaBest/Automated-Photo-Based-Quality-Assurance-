import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  Hash, MessageSquare, MoreVertical, Plus, Search, Send, Smile, Users,
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { useMessagingStore } from '../store/messaging';
import { useAppStore } from '../store';
import NotAuthorized from '../components/NotAuthorized';
import { canViewMessages } from '../lib/permissions';
import {
  listMessages,
  markRead,
  sendMessage,
  type Conversation,
  type Message,
} from '../lib/api/messaging';
import { listProfiles } from '../lib/api/profiles';
import type { Profile } from '../types';
import NewConversationModal from '../components/messaging/NewConversationModal';
import { EditorialButton, StatCell } from '../components/editorial';

// ─── Helpers ───────────────────────────────────────────────────────────────

function initialsFromName(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function profileDisplayName(p: Profile | undefined): string {
  if (!p) return 'Unknown';
  const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  return full || p.email;
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return format(parseISO(iso), 'MMM d, h:mm a');
  }
}

function conversationTitle(
  conv: Conversation,
  currentUserId: string,
  profileById: Map<string, Profile>,
): string {
  if (conv.isGroup) return conv.name ?? 'Untitled group';
  const otherId = conv.members?.find((m) => m.userId !== currentUserId)?.userId;
  return otherId ? profileDisplayName(profileById.get(otherId)) : 'Direct message';
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function Messages() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser = useAppStore((s) => s.currentUser);

  // Hooks must run before any early-return (React rules-of-hooks); the
  // permission gate happens at the very end of the function body.
  const conversations = useMessagingStore((s) => s.conversations);
  const loaded = useMessagingStore((s) => s.loaded);
  const messagesByConv = useMessagingStore((s) => s.messagesByConv);
  const setMessages = useMessagingStore((s) => s.setMessages);
  const appendMessage = useMessagingStore((s) => s.appendMessage);
  const updateLastRead = useMessagingStore((s) => s.updateLastRead);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-load every profile so we can render member names/avatars in the
  // inbox without N round-trips. The user count is small (org-bounded);
  // moving to a per-conversation join is a future optimisation.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listProfiles();
        if (!cancelled) setProfiles(list);
      } catch {
        // Non-critical — names fall back to "Unknown".
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  // When a conversation is opened, fetch its message page (if not already
  // cached) and mark it read.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    if (!messagesByConv[selectedId]) {
      void (async () => {
        try {
          const list = await listMessages(selectedId);
          if (!cancelled) setMessages(selectedId, list.reverse());
        } catch {
          // silent — empty thread shows naturally
        }
      })();
    }
    void markRead(selectedId).then(() => updateLastRead(selectedId, new Date().toISOString()));
    return () => { cancelled = true; };
  }, [selectedId, messagesByConv, setMessages, updateLastRead]);

  const filteredConversations = useMemo(() => {
    if (!currentUser) return conversations;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const title = conversationTitle(c, currentUser.id, profileById).toLowerCase();
      return title.includes(q) || (c.lastMessageBody ?? '').toLowerCase().includes(q);
    });
  }, [conversations, searchQuery, currentUser, profileById]);

  const activeConversation = conversations.find((c) => c.id === selectedId) ?? null;
  const activeMessages: Message[] = activeConversation ? messagesByConv[activeConversation.id] ?? [] : [];

  const stats = useMemo(() => {
    const total = conversations.length;
    const groups = conversations.filter((c) => c.isGroup).length;
    const direct = total - groups;
    const unread = currentUser
      ? conversations.filter((c) => {
          if (!c.lastMessageAt) return false;
          if (!c.lastReadAt) return true;
          return Date.parse(c.lastMessageAt) > Date.parse(c.lastReadAt);
        }).length
      : 0;
    return { total, groups, direct, unread };
  }, [conversations, currentUser]);

  const handleSend = async () => {
    if (!activeConversation || !currentUser) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const msg = await sendMessage(activeConversation.id, body);
      appendMessage(msg);
      setDraft('');
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      // The realtime hook will surface a server-side message if RLS rejects.
    } finally {
      setSending(false);
    }
  };

  if (!canViewMessages(currentProfile)) {
    return <NotAuthorized surface="messages" />;
  }
  if (!currentUser) return null;

  return (
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      {/* ─── Editorial Header ─── */}
      <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                <span className="inline-block h-px w-6 bg-slate-400" />
                Workspace · Messages
              </div>
              <h1
                className="display text-2xl font-medium leading-tight text-slate-900 sm:text-4xl md:text-5xl"
                style={{ textWrap: 'balance' }}
              >
                The <em className="font-normal italic text-emerald-700">thread</em>.
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                Direct lines and project channels — every message backed by Supabase, kept in
                sync across browsers in realtime.
              </p>
            </div>

            <EditorialButton
              variant="pill"
              onClick={() => setShowNew(true)}
              className="self-start"
            >
              <Plus className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
              New conversation
            </EditorialButton>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-4">
            <StatCell
              label="Conversations"
              value={stats.total.toString()}
              caption={loaded ? 'Across direct and group' : 'Loading…'}
              accentColor="#0F172A"
            />
            <StatCell
              label="Group channels"
              value={stats.groups.toString()}
              caption="Project and trade rooms"
              accentColor="#0F766E"
            />
            <StatCell
              label="Direct messages"
              value={stats.direct.toString()}
              caption="One-on-one threads"
              accentColor="#1E40AF"
            />
            <StatCell
              label="Unread"
              value={stats.unread.toString()}
              caption="Awaiting your reply"
              accentColor="#B45309"
            />
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-22rem)] md:min-h-[520px] md:flex-row">

          {/* ── Sidebar ───────────────────────────────────────── */}
          <div className="flex w-full max-h-[60vh] flex-col border-b border-slate-200 bg-white md:max-h-none md:w-80 md:flex-shrink-0 md:border-b-0 md:border-r">
            <div className="border-b border-slate-100 px-5 pt-5 pb-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Inbox
              </p>
              <h2 className="display mt-1 text-2xl font-medium text-slate-900">All threads</h2>
            </div>

            <div className="px-4 pt-3 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search conversations…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 rounded-lg border-slate-200 bg-slate-50 pl-9 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {!loaded && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Loading conversations…</p>
              )}
              {loaded && filteredConversations.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  {conversations.length === 0
                    ? 'Nothing here yet — start a conversation.'
                    : 'No conversations match.'}
                </p>
              )}
              {filteredConversations.map((conv) => {
                const isActive = selectedId === conv.id;
                const title = conversationTitle(conv, currentUser.id, profileById);
                const isUnread =
                  !!conv.lastMessageAt &&
                  (!conv.lastReadAt || Date.parse(conv.lastMessageAt) > Date.parse(conv.lastReadAt));
                const stamp = conv.lastMessageAt ? relativeTime(conv.lastMessageAt) : '';
                const otherId = !conv.isGroup
                  ? conv.members?.find((m) => m.userId !== currentUser.id)?.userId
                  : undefined;
                const otherProfile = otherId ? profileById.get(otherId) : undefined;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedId(conv.id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isActive ? 'bg-slate-900 shadow-sm' : 'hover:bg-slate-50'
                    }`}
                  >
                    {conv.isGroup ? (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Hash className="h-4 w-4" />
                      </div>
                    ) : (
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage src={otherProfile?.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {initialsFromName(profileDisplayName(otherProfile))}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`truncate text-sm font-medium ${isActive ? 'text-white' : 'text-slate-900'}`}>
                          {title}
                        </p>
                        <span className={`flex-shrink-0 text-[11px] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                          {stamp}
                        </span>
                      </div>
                      <p className={`mt-0.5 truncate text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                        {conv.lastMessageBody ?? 'No messages yet.'}
                      </p>
                    </div>
                    {isUnread && (
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Chat Area ─────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#FAFAF7]">
            {activeConversation ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {activeConversation.isGroup ? (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Users className="h-5 w-5" />
                      </div>
                    ) : (
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarImage
                          src={profileById.get(
                            activeConversation.members?.find((m) => m.userId !== currentUser.id)?.userId ?? '',
                          )?.avatarUrl ?? undefined}
                        />
                        <AvatarFallback className="text-xs">
                          {initialsFromName(conversationTitle(activeConversation, currentUser.id, profileById))}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                        {activeConversation.isGroup ? `Group · ${activeConversation.members?.length ?? 0} members` : 'Direct message'}
                      </p>
                      <p className="display truncate text-lg font-medium text-slate-900">
                        {conversationTitle(activeConversation, currentUser.id, profileById)}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>

                <ScrollArea className="flex-1 px-6 py-5">
                  <div className="mx-auto max-w-2xl space-y-3">
                    {activeMessages.length === 0 ? (
                      <p className="py-12 text-center text-sm text-slate-400">
                        No messages yet — say hello.
                      </p>
                    ) : (
                      activeMessages.map((m) => {
                        const isMe = m.senderId === currentUser.id;
                        const sender = m.senderId ? profileById.get(m.senderId) : undefined;
                        const showName = !isMe && activeConversation.isGroup;
                        return (
                          <div key={m.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {!isMe && activeConversation.isGroup && sender && (
                              <Avatar className="mt-1 h-7 w-7 flex-shrink-0">
                                <AvatarImage src={sender.avatarUrl ?? undefined} />
                                <AvatarFallback className="text-[10px]">
                                  {initialsFromName(profileDisplayName(sender))}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className={`flex max-w-[68%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              {showName && (
                                <span className="mb-1 px-1 text-[11px] font-medium text-slate-500">
                                  {profileDisplayName(sender)}
                                </span>
                              )}
                              <div
                                className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                                  isMe
                                    ? 'rounded-br-sm bg-slate-900 text-white'
                                    : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900'
                                }`}
                              >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                                <p className={`mt-1 text-[11px] ${isMe ? 'text-slate-400' : 'text-slate-400'}`}>
                                  {format(parseISO(m.createdAt), 'h:mm a')}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>

                <div className="border-t border-slate-200 bg-white px-5 py-3">
                  <div className="mx-auto flex max-w-2xl items-center gap-2">
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="Write a message…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="flex-1 rounded-xl border-slate-200 bg-slate-50 text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void handleSend(); }}
                    />
                    <Button variant="ghost" size="icon" className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                      <Smile className="h-5 w-5" />
                    </Button>
                    <Button
                      size="icon"
                      disabled={!draft.trim() || sending}
                      onClick={() => void handleSend()}
                      className="flex-shrink-0 rounded-xl bg-slate-900 hover:bg-emerald-700 disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-sm text-center">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <MessageSquare className="h-7 w-7 text-slate-400" />
                  </div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    Nothing selected
                  </p>
                  <h3 className="display mt-1 text-2xl font-medium text-slate-900">
                    Pick a thread.
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Choose a conversation from the inbox on the left, or start a new direct
                    message or group channel.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNew(true)}
                    className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    <Plus className="h-4 w-4" />
                    Start a conversation
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <NewConversationModal
        open={showNew}
        onClose={() => setShowNew(false)}
        currentUserId={currentUser.id}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  );
}
