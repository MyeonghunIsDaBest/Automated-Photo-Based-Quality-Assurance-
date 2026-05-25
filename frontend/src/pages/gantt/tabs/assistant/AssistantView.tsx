// frontend/src/pages/gantt/tabs/assistant/AssistantView.tsx
//
// Sparky — the conversational Site Diary assistant. Renders inside the
// SiteDiaryTab's 5th sub-view. Fresh chat every mount (no persistence).
//
// This file's body grows across tasks 9–12. This first cut is the shell
// with a "Demo only" banner when AI is disabled, plus a placeholder for
// the chat UI that's built in subsequent tasks.

import { useEffect } from 'react';
import { Zap } from 'lucide-react';
import type { Project, User } from '../../../../types';
import { Card, CardContent } from '../../../../components/ui/card';
import { useAssistantChat } from './useAssistantChat';

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

  useEffect(() => {
    if (initialSeedText && initialSeedText.trim()) {
      chat.seedComposer(initialSeedText);
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeedText]);

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

  // Placeholder — filled in by tasks 9–12.
  return (
    <Card>
      <CardContent className="p-6 text-center text-sm text-slate-500">
        Sparky placeholder. Project: {project.name} · User: {currentUser?.fullName ?? '—'} ·
        Messages: {chat.messages.length}
      </CardContent>
    </Card>
  );
}
