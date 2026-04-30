import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Participant {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
}

export interface Message {
  id: string;
  sender: string; // participant id, 'me', or 'system'
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  groupAvatar?: string;
  participant?: Participant;
  participants?: Participant[];
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  messages: Message[];
}

const SEED_CONTACTS: Participant[] = [
  { id: 'user_1', name: 'John Anderson',  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',  online: false },
  { id: 'user_2', name: 'Maria Garcia',   avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria',  online: true  },
  { id: 'user_3', name: 'Dr. Sarah Chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',  online: true  },
  { id: 'user_4', name: 'Mike Thompson',  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',   online: false },
  { id: 'user_5', name: 'Priya Nair',     avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=priya',  online: true  },
  { id: 'user_6', name: 'Tom Walsh',      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tomw',   online: false },
];

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_1', type: 'direct',
    participant: SEED_CONTACTS[1],
    lastMessage: 'Hey, can we schedule a meeting to discuss the framing progress?',
    timestamp: '10:30 AM', unread: true,
    messages: [
      { id: 'm1', sender: 'user_2', content: 'Hey, can we schedule a meeting to discuss the framing progress?', timestamp: '10:30 AM' },
      { id: 'm2', sender: 'user_2', content: 'The AI analysis shows 65% completion but I want to verify on-site.', timestamp: '10:31 AM' },
    ],
  },
  {
    id: 'conv_2', type: 'direct',
    participant: SEED_CONTACTS[2],
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
    participants: [SEED_CONTACTS[0], SEED_CONTACTS[1], SEED_CONTACTS[3]],
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
    participant: SEED_CONTACTS[0],
    lastMessage: 'Great work on the weekly report!',
    timestamp: 'Mon', unread: false,
    messages: [
      { id: 'm1', sender: 'user_1', content: 'Great work on the weekly report!', timestamp: 'Mon' },
    ],
  },
];

interface MessagingState {
  contacts: Participant[];
  conversations: Conversation[];
  createDirect: (contact: Participant) => string;
  createGroup: (name: string, members: Participant[]) => string;
  appendMessage: (conversationId: string, content: string) => void;
  markRead: (conversationId: string) => void;
}

export const useMessagingStore = create<MessagingState>()(
  persist(
    (set, get) => ({
      contacts: SEED_CONTACTS,
      conversations: SEED_CONVERSATIONS,

      createDirect: (contact) => {
        const existing = get().conversations.find(
          (c) => c.type === 'direct' && c.participant?.id === contact.id
        );
        if (existing) return existing.id;
        const id = `conv_d_${Date.now()}`;
        const conv: Conversation = {
          id,
          type: 'direct',
          participant: contact,
          lastMessage: 'Start a conversation…',
          timestamp: 'Now',
          unread: false,
          messages: [],
        };
        set((s) => ({ conversations: [conv, ...s.conversations] }));
        return id;
      },

      createGroup: (name, members) => {
        const id = `conv_g_${Date.now()}`;
        const conv: Conversation = {
          id,
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
              content: `🎉 Group "${name}" created with ${members.map((m) => m.name.split(' ')[0]).join(', ')}`,
              timestamp: 'Now',
            },
          ],
        };
        set((s) => ({ conversations: [conv, ...s.conversations] }));
        return id;
      },

      appendMessage: (conversationId, content) => {
        const trimmed = content.trim();
        if (!trimmed) return;
        const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const msg: Message = { id: `m_${Date.now()}`, sender: 'me', content: trimmed, timestamp: stamp };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, msg], lastMessage: msg.content, timestamp: 'Now', unread: false }
              : c
          ),
        }));
      },

      markRead: (conversationId) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId ? { ...c, unread: false } : c
          ),
        }));
      },
    }),
    {
      name: 'siteproof-messaging-v1',
      partialize: (state) => ({ conversations: state.conversations }),
    }
  )
);
