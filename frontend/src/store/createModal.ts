// store/createModal.ts — app-level "create" switchboard.
//
// The sidebar hover mega-menus (and anywhere else) dispatch a CreateIntent; a
// single <GlobalCreateModals> mounted at app level reads it and renders the
// right wizard/modal. This lets "New service quote" / "New prepaid job" open
// from the rail without every page mounting its own creation modal — and it
// mounts OUTSIDE the routed page's transform wrapper, so the bare-`fixed`
// NewQuoteWizard isn't trapped above the phone tab bar.

import { create } from 'zustand';

export type CreateIntent =
  | 'quote:service'
  | 'quote:project'
  | 'job:service'
  | 'job:project'         // a project-KIND service job (board work), not a Gantt project
  | 'job:prepaid'
  | 'job:gantt-project'   // the full Gantt project (NewWorkModal's Project tab)
  | 'invoice:blank'
  | 'invoice:from-quote'
  | 'invoice:from-job';

interface CreateModalState {
  intent: CreateIntent | null;
  open: (intent: CreateIntent) => void;
  close: () => void;
}

export const useCreateModalStore = create<CreateModalState>((set) => ({
  intent: null,
  open: (intent) => set({ intent }),
  close: () => set({ intent: null }),
}));
