// frontend/src/pages/gantt/tabs/assistant/AssistantView.tsx
//
// Sparky — the conversational Site Diary assistant. Renders inside the
// SiteDiaryTab's 5th sub-view. Fresh chat every mount (no persistence).
//
// This file's body grows across tasks 9–12. This first cut is the shell
// with a "Demo only" banner when AI is disabled, plus a placeholder for
// the chat UI that's built in subsequent tasks.

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import type { Project, User } from '../../../../types';
import { Card, CardContent } from '../../../../components/ui/card';
import { useAssistantChat } from './useAssistantChat';
import { ChatThread } from './ChatThread';
import { ComposerBar } from './ComposerBar';
import { useGanttSideStore, useDiaryEntries } from '../../store';

interface AssistantViewProps {
  project: Project;
  currentUser: User | null;
  initialSeedText?: string;
  onSeedConsumed?: () => void;
}

function isRealAiEnabled(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (import.meta as any).env?.VITE_ENABLE_REAL_AI;
  return typeof raw === 'string' && raw.toLowerCase() === 'true';
}

export function AssistantView({
  project, currentUser, initialSeedText, onSeedConsumed,
}: AssistantViewProps) {
  const today = new Date().toISOString().slice(0, 10);
  const chat = useAssistantChat({ projectId: project.id, targetDate: today });

  const entries = useDiaryEntries(project.id);
  const addDiaryEntry = useGanttSideStore((s) => s.addDiaryEntry);
  const updateDiaryEntry = useGanttSideStore((s) => s.updateDiaryEntry);

  useEffect(() => {
    if (initialSeedText && initialSeedText.trim()) {
      chat.seedComposer(initialSeedText);
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeedText]);

  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());

  const onDiscard = (id: string) => {
    setDiscardedIds((prev) => new Set(prev).add(id));
  };

  const onApply = (id: string, draft: string) => {
    if (!currentUser) return;
    const existing = entries.find((e) => e.date === today);
    if (!existing) {
      addDiaryEntry(project.id, {
        date: today,
        description: draft,
        personnel: [],
        photoIds: [],
        createdBy: currentUser.id,
      });
    } else if (!existing.description.trim()) {
      updateDiaryEntry(project.id, existing.id, { description: draft });
    } else {
      const ok = window.confirm(
        `An entry already exists for ${today} with a description. Replace it with the draft?`,
      );
      if (!ok) return;
      updateDiaryEntry(project.id, existing.id, { description: draft });
    }
    setAppliedIds((prev) => new Set(prev).add(id));
  };

  if (!isRealAiEnabled()) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Zap className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">
            Sparky is in demo mode
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Set <code>VITE_ENABLE_REAL_AI=true</code> in <code>frontend/.env.local</code>
            {' '}to enable AI assistance on Site Diary.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {chat.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {chat.error}
        </div>
      )}
      <div className="flex-1">
        {chat.messages.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <Zap className="mx-auto h-8 w-8 text-emerald-500" />
            <p
              className="mt-3 text-lg font-medium text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              G'day{currentUser?.fullName ? `, ${currentUser.fullName.split(' ')[0]}` : ''}.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Ready when you are. Bullets, voice memo, or just paste what you've got.
            </p>
          </div>
        ) : (
          <ChatThread
            messages={chat.messages}
            targetDate={today}
            appliedMessageIds={appliedIds}
            discardedMessageIds={discardedIds}
            onApply={onApply}
            onDiscard={onDiscard}
          />
        )}
      </div>
      <ComposerBar
        onSend={(t) => { void chat.sendMessage(t); }}
        disabled={chat.sending}
        seedText={chat.seedText}
        onSeedConsumed={chat.clearSeed}
      />
    </div>
  );
}
