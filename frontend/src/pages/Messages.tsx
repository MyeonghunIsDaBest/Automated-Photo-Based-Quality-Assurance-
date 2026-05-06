import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search, Plus, Send, Paperclip, Smile, MoreVertical, Users, X, Check,
  ChevronRight, Hash, MessageSquare, ArrowUpRight,
} from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { useMessagingStore, type Participant } from '../store/messaging';
import { useAppStore } from '../store';
import NotAuthorized from '../components/NotAuthorized';
import { canViewMessages } from '../lib/permissions';

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const ALL_CONTACTS: Participant[] = [
  { id: 'user_1', name: 'John Anderson',  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',  online: false },
  { id: 'user_2', name: 'Maria Garcia',   avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria',  online: true  },
  { id: 'user_3', name: 'Dr. Sarah Chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',  online: true  },
  { id: 'user_4', name: 'Mike Thompson',  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',   online: false },
  { id: 'user_5', name: 'Priya Nair',     avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya',  online: true  },
  { id: 'user_6', name: 'Tom Walsh',      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tomw',   online: false },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

function getSenderName(senderId: string, contacts: Participant[]) {
  if (senderId === 'me') return 'You';
  return contacts.find(c => c.id === senderId)?.name.split(' ')[0] ?? 'Unknown';
}

const FONT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
  .messages-root { font-family: 'DM Sans', system-ui, sans-serif; }
  .messages-root .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
  .messages-root .num     { font-family: 'Fraunces', Georgia, serif; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
  .messages-root .grid-bg {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
  }
  .messages-root .scrollbar-thin::-webkit-scrollbar { width: 4px; }
  .messages-root .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .messages-root .scrollbar-thin::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 9999px; }
`;

// ─── New Chat Modal ────────────────────────────────────────────────────────────

function NewChatModal({
  onClose,
  onCreateDirect,
  onCreateGroup,
}: {
  onClose: () => void;
  onCreateDirect: (contact: Participant) => void;
  onCreateGroup: (name: string, members: Participant[]) => void;
}) {
  const [mode, setMode] = useState<'choose' | 'direct' | 'group'>('choose');
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Participant[]>([]);

  const filtered = ALL_CONTACTS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleMember = (contact: Participant) => {
    setSelectedMembers(prev =>
      prev.find(m => m.id === contact.id)
        ? prev.filter(m => m.id !== contact.id)
        : [...prev, contact]
    );
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedMembers.length >= 2) {
      onCreateGroup(groupName.trim(), selectedMembers);
    }
  };

  return (
    <div className="messages-root fixed inset-0 z-50 flex items-center justify-center">
      <style>{FONT_STYLES}</style>
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-5 pb-4">
          <div className="flex items-center gap-2">
            {mode !== 'choose' && (
              <button
                onClick={() => { setMode('choose'); setSearch(''); setSelectedMembers([]); setGroupName(''); }}
                className="mr-1 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            )}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
                {mode === 'choose' && 'Start'}
                {mode === 'direct' && 'Direct'}
                {mode === 'group' && 'Group'}
              </p>
              <h2 className="display text-lg font-medium text-slate-900">
                {mode === 'choose' && 'New conversation'}
                {mode === 'direct' && 'Message someone'}
                {mode === 'group' && 'Build a group'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'choose' && (
          <div className="space-y-2 p-4">
            <button
              onClick={() => setMode('direct')}
              className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-emerald-100">
                <Users className="h-5 w-5 text-slate-500 group-hover:text-emerald-700" />
              </div>
              <div className="text-left">
                <p className="font-medium text-slate-900">Direct message</p>
                <p className="text-xs text-slate-500">Chat one-on-one with someone on your team</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-emerald-500" />
            </button>

            <button
              onClick={() => setMode('group')}
              className="group flex w-full items-center gap-4 rounded-xl border border-slate-100 p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-emerald-100">
                <Hash className="h-5 w-5 text-slate-500 group-hover:text-emerald-700" />
              </div>
              <div className="text-left">
                <p className="font-medium text-slate-900">Group chat</p>
                <p className="text-xs text-slate-500">Create a channel for a project or trade</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-emerald-500" />
            </button>
          </div>
        )}

        {mode === 'direct' && (
          <div>
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search people..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-transparent bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-2">
              {filtered.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => onCreateDirect(contact)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={contact.avatar} />
                      <AvatarFallback className="text-xs">{getInitials(contact.name)}</AvatarFallback>
                    </Avatar>
                    {contact.online && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900">{contact.name}</p>
                    <p className="text-xs text-slate-500">{contact.online ? 'Online' : 'Offline'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'group' && (
          <div>
            <div className="space-y-3 border-b border-slate-100 px-4 pt-4 pb-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">
                  Group name
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. Site Inspection Team, Tower Crane crew…"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  className="w-full rounded-lg border border-transparent bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedMembers.map(m => (
                    <span
                      key={m.id}
                      className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800"
                    >
                      {m.name.split(' ')[0]}
                      <button onClick={() => toggleMember(m)} className="ml-0.5 hover:text-emerald-900">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Add members…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-transparent bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto py-2">
              {filtered.map(contact => {
                const selected = !!selectedMembers.find(m => m.id === contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => toggleMember(contact)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="relative">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={contact.avatar} />
                        <AvatarFallback className="text-xs">{getInitials(contact.name)}</AvatarFallback>
                      </Avatar>
                      {contact.online && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-slate-900">{contact.name}</p>
                      <p className="text-xs text-slate-500">{contact.online ? 'Online' : 'Offline'}</p>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                      selected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                    }`}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">
                {selectedMembers.length < 2
                  ? `Select at least ${2 - selectedMembers.length} more member${2 - selectedMembers.length > 1 ? 's' : ''}`
                  : `${selectedMembers.length} members selected`}
              </p>
              <button
                disabled={!groupName.trim() || selectedMembers.length < 2}
                onClick={handleCreateGroup}
                className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create group
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Group Avatar ──────────────────────────────────────────────────────────────

function GroupAvatarStack({ participants }: { participants: Participant[] }) {
  const shown = participants.slice(0, 2);
  return (
    <div className="relative h-10 w-10 flex-shrink-0">
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          className={`absolute h-7 w-7 ring-2 ring-white ${
            i === 0 ? 'left-0 top-0' : 'bottom-0 right-0'
          }`}
        >
          <AvatarImage src={p.avatar} />
          <AvatarFallback className="text-[10px]">{getInitials(p.name)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function Messages() {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const conversations = useMessagingStore((s) => s.conversations);
  const createDirect = useMessagingStore((s) => s.createDirect);
  const createGroup = useMessagingStore((s) => s.createGroup);
  const appendMessage = useMessagingStore((s) => s.appendMessage);
  const markRead = useMessagingStore((s) => s.markRead);

  if (!canViewMessages(currentProfile)) {
    return <NotAuthorized surface="messages" />;
  }

  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedConversation) markRead(selectedConversation);
  }, [selectedConversation, markRead]);

  const filteredConversations = conversations.filter(conv => {
    const name = conv.type === 'group' ? conv.name! : conv.participant!.name;
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const activeConversation = conversations.find(c => c.id === selectedConversation);

  const stats = useMemo(() => {
    const total   = conversations.length;
    const groups  = conversations.filter((c) => c.type === 'group').length;
    const direct  = conversations.filter((c) => c.type === 'direct').length;
    const unread  = conversations.filter((c) => c.unread).length;
    return { total, groups, direct, unread };
  }, [conversations]);

  const handleCreateDirect = (contact: Participant) => {
    const id = createDirect(contact);
    setSelectedConversation(id);
    setShowNewChat(false);
  };

  const handleCreateGroup = (name: string, members: Participant[]) => {
    const id = createGroup(name, members);
    setSelectedConversation(id);
    setShowNewChat(false);
  };

  const handleSend = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    appendMessage(selectedConversation, newMessage);
    setNewMessage('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="messages-root min-h-full bg-[#FAFAF7]">
      <style>{FONT_STYLES}</style>

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
                className="display text-2xl sm:text-4xl md:text-5xl font-medium leading-tight text-slate-900"
                style={{ textWrap: 'balance' }}
              >
                The <em className="font-normal italic text-emerald-700">thread</em>.
              </h1>
              <p className="mt-3 max-w-md text-sm sm:text-[15px] leading-relaxed text-slate-500">
                Direct lines, project channels, and the running record of everything said —
                kept together so nothing slips between sites.
              </p>
            </div>

            <button
              onClick={() => setShowNewChat(true)}
              className="group inline-flex items-center justify-center gap-2.5 self-start whitespace-nowrap rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 active:bg-emerald-800"
            >
              <Plus className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
              New chat
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </div>

          {/* Stat strip */}
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-4">
            <StatCell
              label="Conversations"
              value={stats.total.toString()}
              caption="Across direct and group"
              accent="#0F172A"
            />
            <StatCell
              label="Group channels"
              value={stats.groups.toString()}
              caption="Project and trade rooms"
              accent="#0F766E"
            />
            <StatCell
              label="Direct messages"
              value={stats.direct.toString()}
              caption="One-on-one threads"
              accent="#1E40AF"
            />
            <StatCell
              label="Unread"
              value={stats.unread.toString()}
              caption="Awaiting your reply"
              accent="#B45309"
            />
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        {/* Mobile: stack the inbox above the thread, both at natural height. */}
        {/* Desktop: side-by-side fixed-height pane like before.               */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-22rem)] md:min-h-[520px] md:flex-row">

          {/* ── Sidebar ─────────────────────────────────────── */}
          <div className="flex w-full max-h-[60vh] flex-col border-b border-slate-200 bg-white md:max-h-none md:w-80 md:flex-shrink-0 md:border-b-0 md:border-r">
            <div className="border-b border-slate-100 px-5 pt-5 pb-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Inbox
              </p>
              <h2 className="display mt-1 text-2xl font-medium text-slate-900">All threads</h2>
            </div>

            <div className="px-4 pb-3 pt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search conversations…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-9 rounded-lg border-slate-200 bg-slate-50 pl-9 text-sm"
                />
              </div>
            </div>

            <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
              {filteredConversations.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No conversations found</p>
              )}
              {filteredConversations.map(conv => {
                const isGroup = conv.type === 'group';
                const displayName = isGroup ? conv.name! : conv.participant!.name;
                const isActive = selectedConversation === conv.id;

                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv.id)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isActive
                        ? 'bg-slate-900 shadow-sm'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {isGroup ? (
                      conv.participants && <GroupAvatarStack participants={conv.participants} />
                    ) : (
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={conv.participant!.avatar} />
                          <AvatarFallback className="text-xs">{getInitials(conv.participant!.name)}</AvatarFallback>
                        </Avatar>
                        {conv.participant!.online && (
                          <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ${isActive ? 'ring-slate-900' : 'ring-white'}`} />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`truncate text-sm font-medium ${isActive ? 'text-white' : 'text-slate-900'}`}>
                          {displayName}
                        </p>
                        <span className={`flex-shrink-0 text-[11px] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                          {conv.timestamp}
                        </span>
                      </div>
                      <p className={`mt-0.5 truncate text-xs ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                        {conv.lastMessage}
                      </p>
                    </div>

                    {conv.unread && (
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Chat Area ───────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#FAFAF7]">
            {activeConversation ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {activeConversation.type === 'group' && activeConversation.participants ? (
                      <>
                        <GroupAvatarStack participants={activeConversation.participants} />
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                            Group · {activeConversation.participants.length} members
                          </p>
                          <p className="display truncate text-lg font-medium text-slate-900">
                            {activeConversation.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {activeConversation.participants.filter(p => p.online).length} online now
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="relative flex-shrink-0">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={activeConversation.participant!.avatar} />
                            <AvatarFallback className="text-xs">{getInitials(activeConversation.participant!.name)}</AvatarFallback>
                          </Avatar>
                          {activeConversation.participant!.online && (
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Direct message</p>
                          <p className="display truncate text-lg font-medium text-slate-900">
                            {activeConversation.participant!.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {activeConversation.participant!.online ? 'Online now' : 'Offline'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>

                <ScrollArea className="flex-1 px-6 py-5">
                  <div className="mx-auto max-w-2xl space-y-3">
                    {activeConversation.messages.map((message) => {
                      const isMe = message.sender === 'me';
                      const isSystem = message.sender === 'system';

                      if (isSystem) {
                        return (
                          <div key={message.id} className="flex justify-center">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                              {message.content}
                            </span>
                          </div>
                        );
                      }

                      const senderName = getSenderName(message.sender, ALL_CONTACTS);
                      const showName = !isMe && activeConversation.type === 'group';
                      const senderContact = ALL_CONTACTS.find(c => c.id === message.sender);

                      return (
                        <div key={message.id} className={`flex gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {!isMe && activeConversation.type === 'group' && senderContact && (
                            <Avatar className="mt-1 h-7 w-7 flex-shrink-0">
                              <AvatarImage src={senderContact.avatar} />
                              <AvatarFallback className="text-[10px]">{getInitials(senderContact.name)}</AvatarFallback>
                            </Avatar>
                          )}
                          <div className={`flex max-w-[68%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {showName && (
                              <span className="mb-1 px-1 text-[11px] font-medium text-slate-500">{senderName}</span>
                            )}
                            <div
                              className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                                isMe
                                  ? 'rounded-br-sm bg-slate-900 text-white'
                                  : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900'
                              }`}
                            >
                              <p className="text-sm leading-relaxed">{message.content}</p>
                              <p className={`mt-1 text-[11px] ${isMe ? 'text-slate-400' : 'text-slate-400'}`}>
                                {message.timestamp}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                <div className="border-t border-slate-200 bg-white px-5 py-3">
                  <div className="mx-auto flex max-w-2xl items-center gap-2">
                    <Button variant="ghost" size="icon" className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                      <Paperclip className="h-5 w-5" />
                    </Button>
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="Write a message…"
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      className="flex-1 rounded-xl border-slate-200 bg-slate-50 text-sm"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }}
                    />
                    <Button variant="ghost" size="icon" className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                      <Smile className="h-5 w-5" />
                    </Button>
                    <Button
                      size="icon"
                      disabled={!newMessage.trim()}
                      onClick={handleSend}
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
                    Choose a conversation from the inbox on the left, or kick off a new
                    direct message or group channel.
                  </p>
                  <button
                    onClick={() => setShowNewChat(true)}
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

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreateDirect={handleCreateDirect}
          onCreateGroup={handleCreateGroup}
        />
      )}
    </div>
  );
}

// ─── StatCell ──────────────────────────────────────────────────────────────────

function StatCell({
  label, value, caption, accent,
}: { label: string; value: string; caption: string; accent: string }) {
  return (
    <div className="relative overflow-hidden bg-white p-5">
      <div className="absolute left-0 top-0 h-px w-8" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="num mt-2 text-4xl font-medium text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </div>
  );
}
