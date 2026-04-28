import { useState } from 'react';
import { Search, Plus, Send, Paperclip, Smile, MoreVertical } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';

const mockConversations = [
  {
    id: 'conv_1',
    participant: {
      id: 'user_2',
      name: 'Maria Garcia',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria',
    },
    lastMessage: 'Hey, can we schedule a meeting to discuss the framing progress?',
    timestamp: '10:30 AM',
    unread: true,
    online: true,
    messages: [
      { id: 'm1', sender: 'them', content: 'Hey, can we schedule a meeting to discuss the framing progress?', timestamp: '10:30 AM' },
      { id: 'm2', sender: 'them', content: 'The AI analysis shows 65% completion but I want to verify on-site.', timestamp: '10:31 AM' },
    ],
  },
  {
    id: 'conv_2',
    participant: {
      id: 'user_3',
      name: 'Dr. Sarah Chen',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    },
    lastMessage: 'The blueprints have been updated. Please review the changes.',
    timestamp: '9:15 AM',
    unread: true,
    online: true,
    messages: [
      { id: 'm1', sender: 'them', content: 'The blueprints have been updated. Please review the changes.', timestamp: '9:15 AM' },
    ],
  },
  {
    id: 'conv_3',
    participant: {
      id: 'user_4',
      name: 'Mike Thompson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
    },
    lastMessage: 'Materials have been delivered to the site. Inspection scheduled for tomorrow.',
    timestamp: 'Yesterday',
    unread: false,
    online: false,
    messages: [
      { id: 'm1', sender: 'them', content: 'Materials have been delivered to the site.', timestamp: 'Yesterday' },
      { id: 'm2', sender: 'them', content: 'Inspection scheduled for tomorrow.', timestamp: 'Yesterday' },
    ],
  },
  {
    id: 'conv_4',
    participant: {
      id: 'user_1',
      name: 'John Anderson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    },
    lastMessage: 'Great work on the weekly report!',
    timestamp: 'Mon',
    unread: false,
    online: false,
    messages: [
      { id: 'm1', sender: 'them', content: 'Great work on the weekly report!', timestamp: 'Mon' },
    ],
  },
];

export default function Messages() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');

  const filteredConversations = mockConversations.filter(conv =>
    conv.participant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeConversation = mockConversations.find(c => c.id === selectedConversation);

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Conversations List */}
      <div className="w-80 border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
          <Button variant="ghost" size="icon">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Separator />

        <ScrollArea className="h-[calc(100%-8rem)]">
          <div className="p-2">
            {filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConversation(conv.id)}
                className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                  selectedConversation === conv.id
                    ? 'bg-emerald-50'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={conv.participant.avatar} />
                    <AvatarFallback>
                      {conv.participant.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  {conv.online && (
                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">{conv.participant.name}</p>
                    <span className="text-xs text-slate-500">{conv.timestamp}</span>
                  </div>
                  <p className="truncate text-sm text-slate-600">{conv.lastMessage}</p>
                </div>
                {conv.unread && (
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-white">
        {activeConversation ? (
          <div className="flex h-full flex-col">
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={activeConversation.participant.avatar} />
                  <AvatarFallback>
                    {activeConversation.participant.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-slate-900">{activeConversation.participant.name}</p>
                  <p className="text-sm text-slate-500">
                    {activeConversation.online ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {activeConversation.messages.map((message) => {
                  const isMe = message.sender === 'me';
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                          isMe
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <p className={`mt-1 text-xs ${isMe ? 'text-emerald-100' : 'text-slate-500'}`}>
                          {message.timestamp}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon">
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newMessage.trim()) {
                      setNewMessage('');
                    }
                  }}
                />
                <Button variant="ghost" size="icon">
                  <Smile className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  disabled={!newMessage.trim()}
                  onClick={() => setNewMessage('')}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-slate-900">Conversations will be displayed here</h3>
              <p className="text-slate-500">Select a conversation from the list or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
