import { useState, useRef, useEffect } from 'react';
import { Search, Plus, Send, Paperclip, Smile, MoreVertical, Users, X, Check, ChevronRight, Hash } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';

// ─── Types ────────────────────────────────────────────────────────────────────

type Participant = {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
};

type Message = {
  id: string;
  sender: string; // participant id or 'me'
  content: string;
  timestamp: string;
};

type Conversation = {
  id: string;
  type: 'direct' | 'group';
  name?: string; // for group chats
  groupAvatar?: string; // emoji or letter
  participant?: Participant; // for direct chats
  participants?: Participant[]; // for group chats
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  messages: Message[];
};

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const ALL_CONTACTS: Participant[] = [
  { id: 'user_1', name: 'John Anderson',  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',  online: false },
  { id: 'user_2', name: 'Maria Garcia',   avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria',  online: true  },
  { id: 'user_3', name: 'Dr. Sarah Chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',  online: true  },
  { id: 'user_4', name: 'Mike Thompson',  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',   online: false },
  { id: 'user_5', name: 'Priya Nair',     avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya',  online: true  },
  { id: 'user_6', name: 'Tom Walsh',      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tomw',   online: false },
];

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_1', type: 'direct',
    participant: ALL_CONTACTS[1],
    lastMessage: 'Hey, can we schedule a meeting to discuss the framing progress?',
    timestamp: '10:30 AM', unread: true,
    messages: [
      { id: 'm1', sender: 'user_2', content: 'Hey, can we schedule a meeting to discuss the framing progress?', timestamp: '10:30 AM' },
      { id: 'm2', sender: 'user_2', content: 'The AI analysis shows 65% completion but I want to verify on-site.', timestamp: '10:31 AM' },
    ],
  },
  {
    id: 'conv_2', type: 'direct',
    participant: ALL_CONTACTS[2],
    lastMessage: 'The blueprints have been updated. Please review the changes.',
    timestamp: '9:15 AM', unread: true,
    messages: [
      { id: 'm1', sender: 'user_3', content: 'The blueprints have been updated. Please review the changes.', timestamp: '9:15 AM' },
    ],
  },
  {
    id: 'conv_g1', type: 'group',
    name: 'Site Inspection Team',
    groupAvatar: '🏗️',
    participants: [ALL_CONTACTS[0], ALL_CONTACTS[1], ALL_CONTACTS[3]],
    lastMessage: 'Mike: Inspection scheduled for tomorrow at 9 AM.',
    timestamp: 'Yesterday', unread: false,
    messages: [
      { id: 'm1', sender: 'user_4', content: 'Materials have been delivered to the site.', timestamp: 'Yesterday' },
      { id: 'm2', sender: 'user_1', content: 'Great. Let\'s plan the inspection.', timestamp: 'Yesterday' },
      { id: 'm3', sender: 'user_4', content: 'Inspection scheduled for tomorrow at 9 AM.', timestamp: 'Yesterday' },
    ],
  },
  {
    id: 'conv_3', type: 'direct',
    participant: ALL_CONTACTS[0],
    lastMessage: 'Great work on the weekly report!',
    timestamp: 'Mon', unread: false,
    messages: [
      { id: 'm1', sender: 'user_1', content: 'Great work on the weekly report!', timestamp: 'Mon' },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

function getSenderName(senderId: string, contacts: Participant[]) {
  if (senderId === 'me') return 'You';
  return contacts.find(c => c.id === senderId)?.name.split(' ')[0] ?? 'Unknown';
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
           style={{ fontFamily: "'DM Sans', sans-serif" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {mode !== 'choose' && (
              <button
                onClick={() => { setMode('choose'); setSearch(''); setSelectedMembers([]); setGroupName(''); }}
                className="mr-1 p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            )}
            <h2 className="text-base font-semibold text-slate-900">
              {mode === 'choose' && 'New conversation'}
              {mode === 'direct' && 'Direct message'}
              {mode === 'group' && 'Create group'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Choose mode ── */}
        {mode === 'choose' && (
          <div className="p-4 space-y-2">
            <button
              onClick={() => setMode('direct')}
              className="flex w-full items-center gap-4 rounded-xl p-4 hover:bg-emerald-50 transition-colors group border border-slate-100 hover:border-emerald-200"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 group-hover:bg-emerald-100 transition-colors">
                <Users className="h-5 w-5 text-slate-500 group-hover:text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-slate-900">Direct message</p>
                <p className="text-xs text-slate-500">Chat one-on-one with someone</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-emerald-400" />
            </button>

            <button
              onClick={() => setMode('group')}
              className="flex w-full items-center gap-4 rounded-xl p-4 hover:bg-emerald-50 transition-colors group border border-slate-100 hover:border-emerald-200"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 group-hover:bg-emerald-100 transition-colors">
                <Hash className="h-5 w-5 text-slate-500 group-hover:text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-slate-900">Group chat</p>
                <p className="text-xs text-slate-500">Create a channel for a team or project</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-slate-300 group-hover:text-emerald-400" />
            </button>
          </div>
        )}

        {/* ── Direct message ── */}
        {mode === 'direct' && (
          <div>
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search people..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 border border-transparent focus:border-emerald-300"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-2">
              {filtered.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => onCreateDirect(contact)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
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

        {/* ── Group chat ── */}
        {mode === 'group' && (
          <div>
            {/* Group name input */}
            <div className="px-4 pt-4 pb-3 space-y-3 border-b border-slate-100">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Group name
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. Design Review, Sprint Team…"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 border border-transparent focus:border-emerald-300"
                />
              </div>

              {/* Selected members chips */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedMembers.map(m => (
                    <span
                      key={m.id}
                      className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700"
                    >
                      {m.name.split(' ')[0]}
                      <button onClick={() => toggleMember(m)} className="ml-0.5 hover:text-emerald-900">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Add members…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300 border border-transparent focus:border-emerald-300"
                />
              </div>
            </div>

            {/* Contact list */}
            <div className="max-h-48 overflow-y-auto py-2">
              {filtered.map(contact => {
                const selected = !!selectedMembers.find(m => m.id === contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => toggleMember(contact)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
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
                      selected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                    }`}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {selectedMembers.length < 2
                  ? `Select at least ${2 - selectedMembers.length} more member${2 - selectedMembers.length > 1 ? 's' : ''}`
                  : `${selectedMembers.length} members selected`}
              </p>
              <button
                disabled={!groupName.trim() || selectedMembers.length < 2}
                onClick={handleCreateGroup}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create group
                <ChevronRight className="h-3.5 w-3.5" />
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
    <div className="relative h-10 w-10">
      {shown.map((p, i) => (
        <Avatar
          key={p.id}
          className={`absolute h-7 w-7 ring-2 ring-white ${
            i === 0 ? 'top-0 left-0' : 'bottom-0 right-0'
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
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredConversations = conversations.filter(conv => {
    const name = conv.type === 'group' ? conv.name! : conv.participant!.name;
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const activeConversation = conversations.find(c => c.id === selectedConversation);

  // ── Handlers ──

  const handleCreateDirect = (contact: Participant) => {
    const existing = conversations.find(
      c => c.type === 'direct' && c.participant?.id === contact.id
    );
    if (existing) {
      setSelectedConversation(existing.id);
    } else {
      const newConv: Conversation = {
        id: `conv_d_${Date.now()}`,
        type: 'direct',
        participant: contact,
        lastMessage: 'Start a conversation…',
        timestamp: 'Now',
        unread: false,
        messages: [],
      };
      setConversations(prev => [newConv, ...prev]);
      setSelectedConversation(newConv.id);
    }
    setShowNewChat(false);
  };

  const handleCreateGroup = (name: string, members: Participant[]) => {
    const newGroup: Conversation = {
      id: `conv_g_${Date.now()}`,
      type: 'group',
      name,
      groupAvatar: '👥',
      participants: members,
      lastMessage: `Group created with ${members.length} members`,
      timestamp: 'Now',
      unread: false,
      messages: [
        {
          id: 'sys_1',
          sender: 'system',
          content: `🎉 Group "${name}" created with ${members.map(m => m.name.split(' ')[0]).join(', ')}`,
          timestamp: 'Now',
        },
      ],
    };
    setConversations(prev => [newGroup, ...prev]);
    setSelectedConversation(newGroup.id);
    setShowNewChat(false);
  };

  const handleSend = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    const msg: Message = {
      id: `m_${Date.now()}`,
      sender: 'me',
      content: newMessage.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setConversations(prev =>
      prev.map(c =>
        c.id === selectedConversation
          ? { ...c, messages: [...c.messages, msg], lastMessage: msg.content, timestamp: 'Now' }
          : c
      )
    );
    setNewMessage('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── Render ──

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        .messages-root { font-family: 'DM Sans', sans-serif; }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 9999px; }
      `}</style>

      <div className="messages-root flex h-[calc(100vh-8rem)] rounded-2xl overflow-hidden border border-slate-200 shadow-sm">

        {/* ── Sidebar ─────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
            <button
              onClick={() => setShowNewChat(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200"
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200 text-sm h-9 rounded-lg"
              />
            </div>
          </div>

          <Separator />

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
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
                  className={`flex w-full items-center gap-3 px-3 py-2.5 mx-1 rounded-xl text-left transition-all ${
                    isActive ? 'bg-emerald-50 shadow-sm' : 'hover:bg-slate-50'
                  }`}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  {/* Avatar */}
                  {isGroup ? (
                    conv.participants && <GroupAvatarStack participants={conv.participants} />
                  ) : (
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={conv.participant!.avatar} />
                        <AvatarFallback className="text-xs">{getInitials(conv.participant!.name)}</AvatarFallback>
                      </Avatar>
                      {conv.participant!.online && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`truncate text-sm ${isActive ? 'font-semibold text-emerald-700' : 'font-medium text-slate-900'}`}>
                        {displayName}
                      </p>
                      <span className="flex-shrink-0 text-[11px] text-slate-400">{conv.timestamp}</span>
                    </div>
                    <p className="truncate text-xs text-slate-500 mt-0.5">{conv.lastMessage}</p>
                  </div>

                  {conv.unread && (
                    <span className="flex-shrink-0 h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chat Area ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
          {activeConversation ? (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between bg-white border-b border-slate-200 px-5 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  {activeConversation.type === 'group' && activeConversation.participants ? (
                    <>
                      <GroupAvatarStack participants={activeConversation.participants} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{activeConversation.name}</p>
                        <p className="text-xs text-slate-500">
                          {activeConversation.participants.length} members
                          {' · '}
                          {activeConversation.participants.filter(p => p.online).length} online
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={activeConversation.participant!.avatar} />
                          <AvatarFallback className="text-xs">{getInitials(activeConversation.participant!.name)}</AvatarFallback>
                        </Avatar>
                        {activeConversation.participant!.online && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{activeConversation.participant!.name}</p>
                        <p className="text-xs text-slate-500">{activeConversation.participant!.online ? 'Online' : 'Offline'}</p>
                      </div>
                    </>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-5 py-4">
                <div className="space-y-3 max-w-2xl mx-auto">
                  {activeConversation.messages.map((message) => {
                    const isMe = message.sender === 'me';
                    const isSystem = message.sender === 'system';

                    if (isSystem) {
                      return (
                        <div key={message.id} className="flex justify-center">
                          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-500">
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
                          <Avatar className="h-7 w-7 flex-shrink-0 mt-1">
                            <AvatarImage src={senderContact.avatar} />
                            <AvatarFallback className="text-[10px]">{getInitials(senderContact.name)}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`max-w-[68%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                          {showName && (
                            <span className="text-[11px] font-medium text-slate-500 mb-1 px-1">{senderName}</span>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                              isMe
                                ? 'bg-emerald-600 text-white rounded-br-sm'
                                : 'bg-white text-slate-900 rounded-bl-sm border border-slate-100'
                            }`}
                          >
                            <p className="text-sm leading-relaxed">{message.content}</p>
                            <p className={`mt-1 text-[11px] ${isMe ? 'text-emerald-200' : 'text-slate-400'}`}>
                              {message.timestamp}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="bg-white border-t border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2 max-w-2xl mx-auto">
                  <Button variant="ghost" size="icon" className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Write a message…"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    className="flex-1 bg-slate-50 border-slate-200 rounded-xl text-sm"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }}
                  />
                  <Button variant="ghost" size="icon" className="flex-shrink-0 text-slate-400 hover:text-slate-600">
                    <Smile className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    disabled={!newMessage.trim()}
                    onClick={handleSend}
                    className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-xl"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-200">
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900">No conversation selected</h3>
                <p className="mt-1 text-sm text-slate-500">Pick one from the list or start a new chat</p>
                <button
                  onClick={() => setShowNewChat(true)}
                  className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors mx-auto shadow-sm shadow-emerald-200"
                >
                  <Plus className="h-4 w-4" />
                  New chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreateDirect={handleCreateDirect}
          onCreateGroup={handleCreateGroup}
        />
      )}
    </>
  );
}