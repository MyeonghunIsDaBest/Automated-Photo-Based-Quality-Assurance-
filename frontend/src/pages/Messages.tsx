import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import {
  differenceInMinutes,
  format,
  formatDistanceToNow,
  isSameDay,
  isToday,
  isYesterday,
  parseISO,
} from 'date-fns';
import {
  ArrowDown, ArrowLeft, Hash, MessageSquare, MoreVertical, Plus,
  Search, Send, Settings, Smile, Sparkles, Users, X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
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
import GroupSettingsModal from '../components/messaging/GroupSettingsModal';
import { FRAUNCES } from './gantt/components/ledger';

// ─── Helpers ───────────────────────────────────────────────────────────────

// Deterministic-per-user accent color. Lets DM avatars feel personal without
// adding a `color` column to profiles — the same user always gets the same
// swatch across sessions. Palette tuned to sit alongside the warm logbook UI.
const COLOR_PALETTE = [
  '#2F8F5C', '#C44545', '#6D28D9', '#0369A1', '#B45309',
  '#246F47', '#9F1239', '#5B6B7B', '#A21CAF', '#C8841E',
];
function colorFor(id: string | null | undefined): string {
  if (!id) return '#475569';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

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

function isConversationUnread(conv: Conversation): boolean {
  if (!conv.lastMessageAt) return false;
  if (!conv.lastReadAt) return true;
  return Date.parse(conv.lastMessageAt) > Date.parse(conv.lastReadAt);
}

function dateDividerLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE · MMM d, yyyy');
}

type RenderItem =
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'message'; key: string; message: Message; compact: boolean };

function buildRenderItems(messages: Message[]): RenderItem[] {
  const out: RenderItem[] = [];
  let prevDate: Date | null = null;
  let prevSenderId: string | null = null;
  let prevCreatedAt: Date | null = null;

  for (const m of messages) {
    const created = parseISO(m.createdAt);
    if (!prevDate || !isSameDay(prevDate, created)) {
      out.push({ kind: 'divider', key: `div-${m.id}`, label: dateDividerLabel(created) });
      prevDate = created;
      prevSenderId = null;
      prevCreatedAt = null;
    }
    const compact =
      prevSenderId === m.senderId &&
      prevCreatedAt !== null &&
      Math.abs(differenceInMinutes(created, prevCreatedAt)) < 5;
    out.push({ kind: 'message', key: m.id, message: m, compact });
    prevSenderId = m.senderId;
    prevCreatedAt = created;
  }
  return out;
}

// Renders body text with <mark>'d highlights for in-thread search matches.
function highlightBody(body: string, query: string) {
  if (!query.trim()) return body;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = body.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="search-hit">{part}</mark>
      : <Fragment key={i}>{part}</Fragment>
  );
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉', '🔥', '👀', '✅', '💯', '👏'];
const QUICK_REPLIES = ['Got it 👍', 'On my way', 'Need 5 minutes', 'Confirmed for tomorrow'];

type InboxFilter = 'all' | 'unread' | 'groups' | 'direct';
type MobileView = 'inbox' | 'chat';

// ─── Main Component ────────────────────────────────────────────────────────

export default function Messages() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser = useAppStore((s) => s.currentUser);

  const conversations = useMessagingStore((s) => s.conversations);
  const loaded = useMessagingStore((s) => s.loaded);
  const messagesByConv = useMessagingStore((s) => s.messagesByConv);
  const setMessages = useMessagingStore((s) => s.setMessages);
  const appendMessage = useMessagingStore((s) => s.appendMessage);
  const updateLastRead = useMessagingStore((s) => s.updateLastRead);
  const patchConversation = useMessagingStore((s) => s.patchConversation);
  const removeConversation = useMessagingStore((s) => s.removeConversation);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sending, setSending] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('inbox');
  const [searchInThread, setSearchInThread] = useState('');
  const [showSearchInThread, setShowSearchInThread] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pre-load every profile so member names + colors render without an
  // N+1 round-trip on every inbox item.
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

  // Fetch + mark-read when a conversation is opened.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    if (!messagesByConv[selectedId]) {
      void (async () => {
        try {
          const list = await listMessages(selectedId);
          if (!cancelled) setMessages(selectedId, list.reverse());
        } catch {
          /* empty thread shows naturally */
        }
      })();
    }
    void markRead(selectedId).then(() => updateLastRead(selectedId, new Date().toISOString()));
    return () => { cancelled = true; };
  }, [selectedId, messagesByConv, setMessages, updateLastRead]);

  // ⌘K / Ctrl+K → focus inbox search · Esc → close panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('inbox-search')?.focus();
        return;
      }
      if (e.key !== 'Escape') return;
      if (showGroupSettings || showNew) return;
      if (showEmojis) { setShowEmojis(false); return; }
      if (showSearchInThread) { setShowSearchInThread(false); setSearchInThread(''); return; }
      if (searchQuery) { setSearchQuery(''); return; }
      setSelectedId(null);
      setMobileView('inbox');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showGroupSettings, showNew, showEmojis, showSearchInThread, searchQuery]);

  // Auto-grow textarea up to ~6 lines.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [draft]);

  const filteredConversations = useMemo(() => {
    if (!currentUser) return conversations;
    let list = conversations;
    if (inboxFilter === 'unread') list = list.filter(isConversationUnread);
    else if (inboxFilter === 'groups') list = list.filter((c) => c.isGroup);
    else if (inboxFilter === 'direct') list = list.filter((c) => !c.isGroup);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const title = conversationTitle(c, currentUser.id, profileById).toLowerCase();
      return title.includes(q) || (c.lastMessageBody ?? '').toLowerCase().includes(q);
    });
  }, [conversations, searchQuery, currentUser, profileById, inboxFilter]);

  const activeConversation = conversations.find((c) => c.id === selectedId) ?? null;
  const activeMessages: Message[] = activeConversation
    ? messagesByConv[activeConversation.id] ?? []
    : [];

  // In-thread search filter — client-side, no network needed.
  const filteredMessages = useMemo(() => {
    const q = searchInThread.trim().toLowerCase();
    if (!q) return activeMessages;
    return activeMessages.filter((m) => m.body.toLowerCase().includes(q));
  }, [activeMessages, searchInThread]);

  const renderItems = useMemo(() => buildRenderItems(filteredMessages), [filteredMessages]);

  // Per-tab counts for the inbox filter strip.
  const stats = useMemo(() => {
    const total = conversations.length;
    const groups = conversations.filter((c) => c.isGroup).length;
    const direct = total - groups;
    const unread = conversations.filter(isConversationUnread).length;
    return { total, groups, direct, unread };
  }, [conversations]);

  // Container-only scroll on conversation switch (no page jump). Instant —
  // the user just clicked, they want to land at the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedId) return;
    el.scrollTop = el.scrollHeight;
    setShowJumpToLatest(false);
    // Bring keyboard focus back to the composer so they can reply right away.
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [selectedId]);

  // Smooth scroll on new message — only if the user is already near the
  // bottom. If they're reading older messages we leave their scroll alone
  // and surface the "Jump to latest" pill instead.
  const lastLengthRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = activeMessages.length > lastLengthRef.current;
    lastLengthRef.current = activeMessages.length;
    if (!grew) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } else {
      setShowJumpToLatest(true);
    }
  }, [activeMessages.length]);

  const onMessagesScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowJumpToLatest(!atBottom && activeMessages.length > 0);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpToLatest(false);
  };

  const openConversation = (id: string) => {
    setSelectedId(id);
    setMobileView('chat');
    setShowSearchInThread(false);
    setSearchInThread('');
  };

  const handleSend = async (overrideText?: string) => {
    if (!activeConversation || !currentUser) return;
    const body = (overrideText ?? draft).trim();
    if (!body) return;
    setSending(true);
    try {
      const msg = await sendMessage(activeConversation.id, body);
      appendMessage(msg);
      setDraft('');
      setShowEmojis(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    } catch {
      // Realtime hook surfaces server-side errors elsewhere.
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    setDraft((d) => d + emoji);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  if (!canViewMessages(currentProfile)) {
    return <NotAuthorized surface="messages" />;
  }
  if (!currentUser) return null;

  const otherDmMemberId = activeConversation && !activeConversation.isGroup
    ? activeConversation.members?.find((m) => m.userId !== currentUser.id)?.userId
    : undefined;
  const otherDmProfile = otherDmMemberId ? profileById.get(otherDmMemberId) : undefined;

  return (
    <div className="editorial-root flex h-[calc(100vh-4rem)] flex-col bg-[#FAF8F2] text-[#1A1A1A]">
      {/* Page-scoped styles — keyframes that don't justify a global addition. */}
      <style>{`
        @keyframes msgRise {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .msg-rise { animation: msgRise 280ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: none; }
        }
        .slide-in-right { animation: slideInRight 220ms ease-out both; }
        .scrollbar-slim::-webkit-scrollbar { width: 6px; height: 6px; }
        .scrollbar-slim::-webkit-scrollbar-thumb {
          background: rgba(26,26,26,0.12); border-radius: 9999px;
        }
        .scrollbar-slim::-webkit-scrollbar-thumb:hover {
          background: rgba(26,26,26,0.22);
        }
        mark.search-hit {
          background-color: #F9EFD9;
          color: inherit;
          padding: 0 2px;
          border-radius: 2px;
        }
      `}</style>

      {/* ─── Slim title bar ─── */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#E6E1D4] bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-xl font-medium tracking-tight text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            Messages
          </h1>
          <span className="hidden text-xs text-[#A0A0A0] sm:inline">
            <span className="tabular-nums">{stats.total}</span> thread{stats.total === 1 ? '' : 's'}
            {stats.unread > 0 && (
              <>
                <span className="mx-2 text-[#D8D2C4]">·</span>
                <span className="font-medium text-[#246F47]">
                  {stats.unread} unread
                </span>
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="group flex shrink-0 items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#246F47]"
        >
          <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" />
          <span className="hidden sm:inline">New conversation</span>
          <span className="sm:hidden">New</span>
        </button>
      </header>

      {/* ─── Body ─── (capped + centred so the messenger doesn't sprawl on
          wide monitors — consistent with the rest of the app) */}
      <div className="mx-auto w-full min-h-0 max-w-[1400px] flex-1 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)] md:min-h-[520px] md:flex-row">

          {/* ── Sidebar ───────────────────────────────────────── */}
          <aside
            className={`flex w-full flex-col bg-white md:w-80 md:shrink-0 md:border-r md:border-[#E6E1D4] ${
              mobileView === 'chat' ? 'hidden md:flex' : 'flex'
            }`}
          >
            <div className="border-b border-[#EFEBE0] px-5 pt-5 pb-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                Inbox
              </p>
              <h2 className="mt-1 text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>All threads</h2>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1 border-b border-[#EFEBE0] px-4 pt-3 pb-2 text-xs">
              {([
                { id: 'all',    label: 'All',    count: stats.total },
                { id: 'unread', label: 'Unread', count: stats.unread },
                { id: 'groups', label: 'Groups', count: stats.groups },
                { id: 'direct', label: 'Direct', count: stats.direct },
              ] as { id: InboxFilter; label: string; count: number }[]).map((f) => {
                const active = inboxFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setInboxFilter(f.id)}
                    className={`flex min-h-11 items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors sm:min-h-0 ${
                      active
                        ? 'bg-[#1A1A1A] text-white'
                        : 'text-[#3A3A3A] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]'
                    }`}
                  >
                    {f.label}
                    <span className={`text-[10px] tabular-nums ${active ? 'text-[#A8D0B8]' : 'text-[#A0A0A0]'}`}>
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
                <input
                  id="inbox-search"
                  type="text"
                  placeholder="Search conversations…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full rounded-[14px] border border-[#E6E1D4] bg-[#FAF8F2] pl-9 pr-14 text-base transition-colors focus:border-[#2F8F5C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[#E6E1D4] bg-white px-1.5 py-0.5 text-[10px] tabular-nums text-[#A0A0A0]">
                  ⌘K
                </kbd>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-9 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Conversation list */}
            <div className="scrollbar-slim flex-1 overflow-y-auto px-2 pb-3">
              {!loaded && (
                <p className="px-4 py-6 text-center text-sm text-[#A0A0A0]">
                  Loading conversations…
                </p>
              )}
              {loaded && filteredConversations.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-[#A0A0A0]">
                  {conversations.length === 0
                    ? 'Nothing here yet — start a conversation.'
                    : inboxFilter !== 'all'
                      ? `No ${inboxFilter === 'unread' ? 'unread' : inboxFilter} threads.`
                      : 'No conversations match.'}
                </p>
              )}
              {filteredConversations.map((conv) => {
                const isActive = selectedId === conv.id;
                const title = conversationTitle(conv, currentUser.id, profileById);
                const isUnread = isConversationUnread(conv);
                const stamp = conv.lastMessageAt ? relativeTime(conv.lastMessageAt) : '';
                const otherId = !conv.isGroup
                  ? conv.members?.find((m) => m.userId !== currentUser.id)?.userId
                  : undefined;
                const otherProfile = otherId ? profileById.get(otherId) : undefined;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => openConversation(conv.id)}
                    className={`group relative mb-1 flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors ${
                      isActive ? 'bg-[#E5F2EA]' : 'hover:bg-[#FAF8F2]'
                    }`}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 h-8 w-0.5 -translate-y-1/2 rounded-r-full bg-[#2F8F5C]"
                        aria-hidden
                      />
                    )}
                    <div className="relative shrink-0">
                      {conv.isGroup ? (
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#E5F2EA] text-[#246F47]">
                          <Hash className="h-4 w-4" />
                        </div>
                      ) : otherProfile?.avatarUrl ? (
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={otherProfile.avatarUrl} />
                          <AvatarFallback
                            className="text-[10px] font-medium text-white"
                            style={{ background: colorFor(otherId) }}
                          >
                            {initialsFromName(profileDisplayName(otherProfile))}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div
                          className="grid h-10 w-10 place-items-center rounded-full text-[11px] font-medium text-white"
                          style={{ background: colorFor(otherId) }}
                        >
                          {initialsFromName(profileDisplayName(otherProfile))}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm font-medium ${isActive ? 'text-[#246F47]' : 'text-[#1A1A1A]'}`}>
                          {title}
                        </p>
                        <span className={`shrink-0 text-[10px] tabular-nums ${isActive ? 'text-[#2F8F5C]' : 'text-[#A0A0A0]'}`}>
                          {stamp}
                        </span>
                      </div>
                      <p className={`mt-0.5 truncate text-xs ${isActive ? 'text-[#2F8F5C]' : 'text-[#6B6B6B]'}`}>
                        {conv.lastMessageBody ?? 'No messages yet.'}
                      </p>
                    </div>
                    {isUnread && (
                      <span
                        className="flex h-2 w-2 shrink-0 rounded-full bg-[#2F8F5C]"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Chat Area ───────────────────────────────────────── */}
          <section
            className={`relative flex min-w-0 flex-1 flex-col bg-[#FAF8F2] ${
              mobileView === 'inbox' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {activeConversation ? (
              <>
                {/* Chat header */}
                <div className="flex items-center justify-between border-b border-[#E6E1D4] bg-white px-4 py-3 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMobileView('inbox')}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#3A3A3A] hover:bg-[#F0EDE4] md:hidden"
                      aria-label="Back to inbox"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!activeConversation.isGroup}
                      onClick={() => activeConversation.isGroup && setShowGroupSettings(true)}
                      className={`flex min-w-0 items-center gap-3 rounded-[14px] -m-1 p-1 transition-colors ${
                        activeConversation.isGroup ? 'hover:bg-[#FAF8F2]' : 'cursor-default'
                      }`}
                    >
                      {activeConversation.isGroup ? (
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E5F2EA] text-[#246F47]">
                          <Users className="h-5 w-5" />
                        </div>
                      ) : otherDmProfile?.avatarUrl ? (
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={otherDmProfile.avatarUrl} />
                          <AvatarFallback
                            className="text-xs font-medium text-white"
                            style={{ background: colorFor(otherDmMemberId) }}
                          >
                            {initialsFromName(profileDisplayName(otherDmProfile))}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <div
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-medium text-white"
                          style={{ background: colorFor(otherDmMemberId) }}
                        >
                          {initialsFromName(profileDisplayName(otherDmProfile))}
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                          {activeConversation.isGroup
                            ? `Group · ${activeConversation.members?.length ?? 0} members`
                            : 'Direct message'}
                        </p>
                        <p className="truncate text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
                          {conversationTitle(activeConversation, currentUser.id, profileById)}
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowSearchInThread((v) => !v)}
                      className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
                        showSearchInThread
                          ? 'bg-[#F9EFD9] text-[#C8841E]'
                          : 'text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]'
                      }`}
                      title="Search in thread"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                    {activeConversation.isGroup ? (
                      <button
                        type="button"
                        onClick={() => setShowGroupSettings(true)}
                        className="grid h-9 w-9 place-items-center rounded-full text-[#6B6B6B] transition-colors hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
                        title="Group settings"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="grid h-9 w-9 cursor-default place-items-center rounded-full text-[#D8D2C4]"
                        aria-label="More (no actions yet for direct messages)"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* In-thread search bar */}
                {showSearchInThread && (
                  <div className="slide-in-right flex items-center gap-2 border-b border-[#F9EFD9] bg-[#F9EFD9] px-4 py-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-[#C8841E]" />
                    <input
                      autoFocus
                      type="text"
                      value={searchInThread}
                      onChange={(e) => setSearchInThread(e.target.value)}
                      placeholder="Find in conversation…"
                      className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#C8841E]/60 focus:outline-none"
                    />
                    <span className="shrink-0 text-xs tabular-nums text-[#C8841E]">
                      {filteredMessages.length} match{filteredMessages.length === 1 ? '' : 'es'}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setShowSearchInThread(false); setSearchInThread(''); }}
                      className="rounded-full p-1 text-[#C8841E] hover:bg-[#F9EFD9]"
                      aria-label="Close in-thread search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Messages */}
                <div
                  ref={scrollRef}
                  onScroll={onMessagesScroll}
                  className="scrollbar-slim relative min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
                >
                  <div className="mx-auto max-w-2xl">
                    {renderItems.length === 0 ? (
                      <div className="py-16 text-center">
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#F0EDE4]">
                          <Sparkles className="h-6 w-6 text-[#A0A0A0]" />
                        </div>
                        <p className="mt-4 text-sm text-[#A0A0A0]">
                          {searchInThread ? 'No messages match.' : 'No messages yet — say hello.'}
                        </p>
                      </div>
                    ) : (
                      renderItems.map((item) => {
                        if (item.kind === 'divider') {
                          return (
                            <div key={item.key} className="my-6 flex items-center gap-3">
                              <span className="h-px flex-1 bg-[#E6E1D4]" />
                              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#A0A0A0]">
                                {item.label}
                              </span>
                              <span className="h-px flex-1 bg-[#E6E1D4]" />
                            </div>
                          );
                        }
                        const m = item.message;
                        const isMe = m.senderId === currentUser.id;
                        const sender = m.senderId ? profileById.get(m.senderId) : undefined;
                        const showName = !isMe && activeConversation.isGroup && !item.compact;
                        const showAvatar = !isMe && activeConversation.isGroup && !item.compact;
                        return (
                          <div
                            key={item.key}
                            className={`msg-rise flex gap-2 ${isMe ? 'justify-end' : 'justify-start'} ${
                              item.compact ? 'mt-0.5' : 'mt-3'
                            }`}
                          >
                            {!isMe && activeConversation.isGroup && (
                              showAvatar ? (
                                sender?.avatarUrl ? (
                                  <Avatar className="mt-1 h-7 w-7 shrink-0">
                                    <AvatarImage src={sender.avatarUrl} />
                                    <AvatarFallback
                                      className="text-[10px] font-medium text-white"
                                      style={{ background: colorFor(m.senderId) }}
                                    >
                                      {initialsFromName(profileDisplayName(sender))}
                                    </AvatarFallback>
                                  </Avatar>
                                ) : (
                                  <div
                                    className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white"
                                    style={{ background: colorFor(m.senderId) }}
                                  >
                                    {initialsFromName(profileDisplayName(sender))}
                                  </div>
                                )
                              ) : (
                                <span className="mt-1 h-7 w-7 shrink-0" aria-hidden />
                              )
                            )}
                            <div className={`flex max-w-[78%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              {showName && (
                                <span
                                  className="mb-1 px-1 text-[11px] font-medium"
                                  style={{ color: colorFor(m.senderId) }}
                                >
                                  {profileDisplayName(sender)}
                                </span>
                              )}
                              <div
                                className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                                  isMe
                                    ? `${item.compact ? 'rounded-br-2xl' : 'rounded-br-sm'} bg-[#2F8F5C] text-white`
                                    : `${item.compact ? 'rounded-bl-2xl' : 'rounded-bl-sm'} border border-[#E6E1D4] bg-white text-[#1A1A1A]`
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                  {highlightBody(m.body, searchInThread)}
                                </p>
                                {!item.compact && (
                                  <p className={`mt-1 text-[11px] ${isMe ? 'text-[#A8D0B8]' : 'text-[#A0A0A0]'}`}>
                                    {format(parseISO(m.createdAt), 'h:mm a')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Jump-to-latest pill */}
                {showJumpToLatest && (
                  <button
                    type="button"
                    onClick={scrollToBottom}
                    className="slide-in-right absolute bottom-28 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-xs font-medium text-white shadow-[0_4px_12px_rgba(47,143,92,0.3)] transition-colors hover:bg-[#246F47]"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Jump to latest
                  </button>
                )}

                {/* Composer */}
                <div className="relative border-t border-[#E6E1D4] bg-white px-3 py-3 sm:px-5">
                  {/* Quick replies — only when the composer is empty */}
                  {!draft.trim() && (
                    <div className="mx-auto mb-2 flex max-w-2xl flex-wrap gap-1.5">
                      {QUICK_REPLIES.map((q) => (
                        <button
                          key={q}
                          type="button"
                          disabled={sending}
                          onClick={() => void handleSend(q)}
                          className="rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-xs text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:bg-[#E5F2EA] hover:text-[#246F47] disabled:opacity-50"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Emoji bar */}
                  {showEmojis && (
                    <div className="slide-in-right mx-auto mb-2 flex max-w-2xl flex-wrap items-center gap-1 rounded-[14px] border border-[#E6E1D4] bg-white px-2 py-1.5 shadow-[0_4px_12px_rgba(20,20,20,0.08)]">
                      {QUICK_EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => insertEmoji(e)}
                          className="rounded-lg px-1.5 py-1 text-lg transition-transform hover:scale-125"
                          aria-label={`Insert ${e}`}
                        >
                          {e}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowEmojis(false)}
                        className="ml-auto rounded-full p-1 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
                        aria-label="Close emoji picker"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="mx-auto flex max-w-2xl items-end gap-2">
                    <div className="relative flex flex-1 items-end rounded-2xl border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2 transition-colors focus-within:border-[#2F8F5C] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#2F8F5C]">
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        placeholder="Write a message…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void handleSend();
                          }
                        }}
                        className="scrollbar-slim min-h-6 flex-1 resize-none bg-transparent text-base leading-relaxed text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:outline-none sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmojis((v) => !v)}
                        className={`ml-1 grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${
                          showEmojis ? 'text-[#246F47]' : 'text-[#A0A0A0] hover:text-[#6B6B6B]'
                        }`}
                        title="Insert emoji"
                      >
                        <Smile className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!draft.trim() || sending}
                      onClick={() => void handleSend()}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#2F8F5C] text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:bg-[#E6E1D4] disabled:text-[#A0A0A0]"
                      aria-label="Send"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mx-auto mt-1.5 max-w-2xl text-[10px] text-[#A0A0A0]">
                    Press{' '}
                    <kbd className="rounded border border-[#E6E1D4] bg-white px-1 py-0.5 tabular-nums">Enter</kbd>{' '}
                    to send ·{' '}
                    <kbd className="rounded border border-[#E6E1D4] bg-white px-1 py-0.5 tabular-nums">Shift+Enter</kbd>{' '}
                    for new line
                  </p>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-sm text-center">
                  <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                    <MessageSquare className="h-7 w-7 text-[#A0A0A0]" />
                  </div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                    Nothing selected
                  </p>
                  <h3 className="mt-1 text-2xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
                    Pick a thread.
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#6B6B6B]">
                    Choose a conversation from the inbox on the left, or start a new direct
                    message or group channel.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNew(true)}
                    className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#2F8F5C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47]"
                  >
                    <Plus className="h-4 w-4" />
                    Start a conversation
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <NewConversationModal
        open={showNew}
        onClose={() => setShowNew(false)}
        currentUserId={currentUser.id}
        onCreated={(id) => {
          setSelectedId(id);
          setMobileView('chat');
        }}
      />

      {activeConversation?.isGroup && (
        <GroupSettingsModal
          open={showGroupSettings}
          onClose={() => setShowGroupSettings(false)}
          conversation={activeConversation}
          profileById={profileById}
          currentUserId={currentUser.id}
          onUpdated={(patch) => patchConversation(activeConversation.id, patch)}
          onLeft={() => {
            const id = activeConversation.id;
            setSelectedId(null);
            setMobileView('inbox');
            removeConversation(id);
          }}
        />
      )}
    </div>
  );
}
