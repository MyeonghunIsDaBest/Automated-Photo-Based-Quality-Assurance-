// Transient UI state for the client-side mock-AI runtime.
//
// `useMockAnalysis` is the writer (it sets the field while a batch walks
// through photos), and `ReviewQueueTab` / `GanttChart` are the readers
// (they use the value to outline the analysing bar emerald + pulse while
// the AI is "thinking"). Pulling it out of the hook's local state means
// the writer doesn't have to be the same React instance as the reader —
// both consumers can subscribe to the same Zustand slice and stay in sync.
//
// This is *not* the audit log or any persisted state. Cleared on page
// refresh by design. The mock runtime sets it; nothing else writes here.

import { create } from 'zustand';

interface MockAiUiState {
  currentlyAnalysingTaskId: string | null;
  setCurrentlyAnalysingTaskId: (id: string | null) => void;
}

export const useMockAiUiStore = create<MockAiUiState>((set) => ({
  currentlyAnalysingTaskId: null,
  setCurrentlyAnalysingTaskId: (id) => set({ currentlyAnalysingTaskId: id }),
}));
