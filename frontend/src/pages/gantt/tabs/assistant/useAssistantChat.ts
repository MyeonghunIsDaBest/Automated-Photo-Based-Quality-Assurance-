// frontend/src/pages/gantt/tabs/assistant/useAssistantChat.ts
//
// In-memory chat state for the Sparky assistant. Fresh on every mount —
// no localStorage, no DB. Closing the sub-view drops the conversation.

import { useCallback, useState } from 'react';
import { sendAssistantTurn, type AssistantMessage } from '../../../../lib/api/siteDiaryAssistant';

export type ChatMessage =
  | { id: string; kind: 'user'; content: string }
  | { id: string; kind: 'assistant'; content: string; draftText: string | null };

interface UseAssistantChatInput {
  projectId: string;
  targetDate: string;
}

const newId = () =>
  `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function useAssistantChat({ projectId, targetDate }: UseAssistantChatInput) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedText, setSeedTextState] = useState<string>('');

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const seedComposer = useCallback((text: string) => {
    setSeedTextState(text);
  }, []);

  const clearSeed = useCallback(() => {
    setSeedTextState('');
  }, []);

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = { id: newId(), kind: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setError(null);

    // Build messages[] payload — convert ChatMessage to the API's
    // AssistantMessage shape. Include all prior turns + the new user turn.
    const history: AssistantMessage[] = [
      ...messages.map<AssistantMessage>((m) =>
        m.kind === 'user'
          ? { role: 'user', content: m.content }
          : { role: 'assistant', content: m.content },
      ),
      { role: 'user', content: trimmed },
    ];

    const result = await sendAssistantTurn({ messages: history, targetDate, projectId });

    if (!result.ok) {
      const detail = result.reason === 'disabled'
        ? 'AI is disabled in this environment.'
        : `Assistant error: ${result.detail}`;
      setError(detail);
      setSending(false);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: newId(), kind: 'assistant', content: result.reply, draftText: result.draftText },
    ]);
    setSending(false);
  }, [messages, sending, projectId, targetDate]);

  return {
    messages,
    sending,
    error,
    seedText,
    sendMessage,
    seedComposer,
    clearSeed,
    reset,
  };
}
