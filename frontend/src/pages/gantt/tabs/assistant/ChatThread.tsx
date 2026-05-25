// frontend/src/pages/gantt/tabs/assistant/ChatThread.tsx
//
// Renders the assistant chat. For each assistant message, parses out the
// <<<DRAFT...<<<END>>> block (if any) and renders three nodes:
//   1. plain text before
//   2. DraftCard
//   3. plain text after
//
// User messages render as right-aligned bubbles.

import { Zap } from 'lucide-react';
import type { ChatMessage } from './useAssistantChat';
import { parseDraftBlock } from './parseDraftBlock';
import { DraftCard } from './DraftCard';

interface ChatThreadProps {
  messages: ChatMessage[];
  targetDate: string;
  appliedMessageIds: Set<string>;
  discardedMessageIds: Set<string>;
  onApply: (messageId: string, draft: string) => void;
  onDiscard: (messageId: string) => void;
}

export function ChatThread({
  messages, targetDate, appliedMessageIds, discardedMessageIds, onApply, onDiscard,
}: ChatThreadProps) {
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        if (m.kind === 'user') {
          return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white">
                {m.content}
              </div>
            </div>
          );
        }

        // assistant
        const parsed = m.draftText ? parseDraftBlock(m.content) : null;
        const before = parsed?.before?.trim() ?? m.content.trim();
        const after = parsed?.after?.trim() ?? '';

        return (
          <div key={m.id} className="flex items-start gap-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 space-y-2">
              {before && (
                <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800">
                  {before}
                </div>
              )}
              {parsed && (
                <DraftCard
                  draft={parsed.draft}
                  targetDate={targetDate}
                  applied={appliedMessageIds.has(m.id)}
                  discarded={discardedMessageIds.has(m.id)}
                  onApply={() => onApply(m.id, parsed.draft)}
                  onDiscard={() => onDiscard(m.id)}
                />
              )}
              {after && (
                <div className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800">
                  {after}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
