// frontend/src/pages/gantt/tabs/sitediary/SparkyAssistModal.tsx
//
// Inline Sparky assistant — opens over the New Entry drawer when the user
// taps "Ask Sparky" next to the Description field. Two phases:
//   1. Compose: greeting card + textarea + Submit
//   2. Reviewing: Original vs Proposed rewrite + Discard / Edit / Use this draft
//
// Always real Claude — no mock fallback. If `VITE_ENABLE_REAL_AI` is off or
// Supabase isn't configured the modal shows a clear disabled banner instead
// of pretending to draft.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Check, Pencil, Sparkles, X } from 'lucide-react';
import { sendAssistantTurn } from '../../../../lib/api/siteDiaryAssistant';
import type { User } from '../../../../types';

interface SparkyAssistModalProps {
  open: boolean;
  projectId: string;
  targetDate: string;
  currentUser: User | null;
  onUseDraft: (draftText: string) => void;
  onClose: () => void;
}

type Phase = 'compose' | 'sending' | 'reviewing' | 'disabled';

function greetingName(user: User | null): string {
  const full = user?.fullName?.trim();
  if (!full) return 'there';
  const parts = full.split(/\s+/).filter(Boolean);
  // Aussie convention: last name reads more naturally on a building site.
  // "myeonghun tester" → "tester". Single-word names fall back to themselves.
  return parts[parts.length - 1] ?? 'there';
}

function stripDraftBlock(reply: string): string {
  return reply.replace(/<<<DRAFT[\s\S]*?<<<END>>>/, '').trim();
}

export function SparkyAssistModal({
  open, projectId, targetDate, currentUser, onUseDraft, onClose,
}: SparkyAssistModalProps) {
  const [phase, setPhase] = useState<Phase>('compose');
  const [input, setInput] = useState('');
  const [original, setOriginal] = useState('');
  const [proposed, setProposed] = useState('');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state each time the modal opens fresh.
  useEffect(() => {
    if (!open) return;
    setPhase('compose');
    setInput('');
    setOriginal('');
    setProposed('');
    setExplanation('');
    setError(null);
    setEditing(false);
    // Focus the input after the open animation settles.
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open]);

  // Esc closes the modal when nothing's mid-flight.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'sending') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setOriginal(trimmed);
    setError(null);
    setPhase('sending');

    const result = await sendAssistantTurn({
      messages: [{ role: 'user', content: trimmed }],
      targetDate,
      projectId,
    });

    if (!result.ok) {
      if (result.reason === 'disabled') {
        setPhase('disabled');
      } else {
        setError(result.detail || 'Sparky could not respond. Try again in a moment.');
        setPhase('compose');
      }
      return;
    }

    const draft = (result.draftText && result.draftText.trim().length > 0)
      ? result.draftText.trim()
      : result.reply.trim();
    const commentary = stripDraftBlock(result.reply);

    setProposed(draft);
    setExplanation(commentary);
    setPhase('reviewing');
  };

  const handleUseDraft = () => {
    if (!proposed.trim()) return;
    onUseDraft(proposed.trim());
    onClose();
  };

  const name = greetingName(currentUser);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — sits above the drawer (z-50) */}
          <motion.div
            key="sparky-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={phase === 'sending' ? undefined : onClose}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]"
          />

          {/* Modal */}
          <motion.div
            key="sparky-modal"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="Sparky writing assistant"
            className="fixed left-1/2 top-1/2 z-[61] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl"
          >
            {/* Header */}
            <header className="flex items-start justify-between px-6 pt-5 pb-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500 font-medium">
                  <span className="h-px w-5 bg-slate-300" />
                  AI Assist
                </div>
                <h2
                  className="mt-1 text-[24px] font-medium leading-tight text-slate-900"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  {phase === 'reviewing' ? 'Proposed rewrite' : 'Sparky'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={phase === 'sending'}
                aria-label="Close Sparky"
                className="w-8 h-8 grid place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Body */}
            {phase === 'disabled' ? (
              <div className="px-6 pb-5">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Sparky is disabled in this environment. Set <code>VITE_ENABLE_REAL_AI=true</code>{' '}
                  and configure Supabase to enable the writing assistant.
                </div>
              </div>
            ) : phase === 'reviewing' ? (
              <div className="border-t border-slate-100">
                <section className="px-6 pt-4 pb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1">
                    Original
                  </div>
                  <p className="text-[15px] text-slate-600 whitespace-pre-wrap">
                    {original}
                  </p>
                </section>
                <section className="px-6 pt-3 pb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C8841E] mb-1">
                    Proposed
                  </div>
                  {editing ? (
                    <textarea
                      value={proposed}
                      onChange={(e) => setProposed(e.target.value)}
                      rows={6}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 focus:border-emerald-500 focus:outline-none"
                    />
                  ) : (
                    <p className="rounded-md bg-emerald-50/60 px-2 py-1 -mx-2 text-[15px] text-slate-900 whitespace-pre-wrap">
                      {proposed}
                    </p>
                  )}
                </section>
              </div>
            ) : (
              <div className="border-t border-slate-100 px-6 pt-4 pb-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-[#FAF8F2] px-4 py-3">
                  <p
                    className="text-[18px] font-medium text-slate-900"
                    style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  >
                    G'day, {name}.
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Ready when you are. Bullets, voice memo, or just paste what you've got.
                  </p>
                </div>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  rows={6}
                  placeholder={'e.g. trenched east drainage L14\nflagged soft pocket near C-3\nremoved 6m3 spoil to north laydown'}
                  disabled={phase === 'sending'}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
                />
                {error ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </p>
                ) : null}
              </div>
            )}

            {/* Footer */}
            {phase === 'disabled' ? (
              <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </footer>
            ) : phase === 'reviewing' ? (
              <footer className="flex items-center gap-3 border-t border-slate-100 px-6 py-3">
                <p className="flex-1 min-w-0 truncate text-[11.5px] text-slate-500">
                  {explanation || 'Sparky rewrote your notes into diary prose.'}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <X className="h-3 w-3" />
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3 w-3" />
                    {editing ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={handleUseDraft}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1A1A1A] text-white text-xs font-semibold hover:bg-black"
                  >
                    <Check className="h-3 w-3" />
                    Use this draft
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </footer>
            ) : (
              <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-3">
                <span className="text-[11.5px] text-slate-400">
                  ⌘/Ctrl + Enter to send
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={phase === 'sending'}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleSubmit(); }}
                    disabled={phase === 'sending' || input.trim().length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1A1A1A] text-white text-xs font-semibold hover:bg-black disabled:opacity-60"
                  >
                    <Sparkles className="h-3 w-3 text-[#FFE082]" />
                    {phase === 'sending' ? 'Sparky is drafting…' : 'Ask Sparky'}
                  </button>
                </div>
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
