// frontend/src/pages/gantt/tabs/sitediary/SparkyAssistModal.tsx
//
// Inline Sparky assistant — opens over the New Entry drawer when the user
// taps "Ask Sparky" next to the Description field.
//
// Multi-turn chat: the modal renders a running conversation (user right,
// Sparky left) and streams Sparky's replies token-by-token. Every assistant
// turn that carries a draft drops a pill into the drafts tray; clicking a
// pill applies that draft to the entry description via `onUseDraft`.
//
// History persists across modal close/reopen within the same browser session
// (lifted to a module-level Map keyed by project|date); a full page reload
// resets it.
//
// Always real Claude — no mock fallback at the UI layer. If
// `VITE_ENABLE_REAL_AI` is off or Supabase isn't configured the modal shows a
// clear disabled banner instead of pretending to draft.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, RotateCcw, Sparkles, X } from 'lucide-react';
import { inputField } from '../../components/ledger';
import {
  isRealAiEnabled,
  streamAssistantTurn,
  type AssistantMessage,
} from '../../../../lib/api/siteDiaryAssistant';
import type { User } from '../../../../types';

interface SparkyAssistModalProps {
  open: boolean;
  projectId: string;
  targetDate: string;
  currentUser: User | null;
  onUseDraft: (draftText: string) => void;
  onClose: () => void;
}

// In-session conversation state for one (project, date) pairing. Held at module
// scope so closing + reopening the modal restores the chat; a page reload
// clears it (module re-evaluates).
interface SessionState {
  messages: AssistantMessage[];
  drafts: string[];
}
const SESSION_STORE = new Map<string, SessionState>();
const sessionKey = (projectId: string, targetDate: string) => `${projectId}|${targetDate}`;

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
  const key = sessionKey(projectId, targetDate);

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);   // a turn is in flight
  const [preRoll, setPreRoll] = useState(false);        // typing dots before first delta
  const [error, setError] = useState<string | null>(null);
  const disabled = !isRealAiEnabled();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevKeyRef = useRef<string | null>(null);

  // Restore (or initialize) session state whenever the session KEY changes —
  // not on every open. Reopening the same project/date keeps the chat.
  useEffect(() => {
    if (!open) return;
    if (prevKeyRef.current === key) return; // same session — leave state intact
    prevKeyRef.current = key;
    const saved = SESSION_STORE.get(key);
    setMessages(saved?.messages ?? []);
    setDrafts(saved?.drafts ?? []);
    setInput('');
    setError(null);
    setStreaming(false);
    setPreRoll(false);
  }, [open, key]);

  // Persist conversation + drafts back to the module store so close/reopen
  // restores them.
  useEffect(() => {
    SESSION_STORE.set(key, { messages, drafts });
  }, [key, messages, drafts]);

  // Focus the input shortly after the open animation settles.
  useEffect(() => {
    if (!open || disabled) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open, disabled]);

  // Keep the chat scrolled to the latest content as tokens stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, preRoll]);

  // Esc closes the modal when nothing's mid-flight.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !streaming) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, streaming, onClose]);

  // Run one assistant turn against the given full message history. Extracted so
  // both submit and the Retry pill can reuse it.
  const runTurn = (history: AssistantMessage[]) => {
    setError(null);
    setStreaming(true);
    setPreRoll(true);

    let assistantStarted = false;

    void streamAssistantTurn(
      { messages: history, targetDate, projectId },
      {
        onDelta: (t) => {
          setPreRoll(false);
          setMessages((prev) => {
            if (!assistantStarted) {
              assistantStarted = true;
              return [...prev, { role: 'assistant', content: t }];
            }
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { role: 'assistant', content: last.content + t };
            }
            return next;
          });
        },
        onDone: ({ draftText }) => {
          setPreRoll(false);
          setStreaming(false);
          // Finalize the visible assistant message: strip the draft block so
          // only the commentary shows in the bubble.
          setMessages((prev) => {
            if (!assistantStarted) return prev;
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              const visible = stripDraftBlock(last.content);
              next[next.length - 1] = {
                role: 'assistant',
                content: visible.length > 0 ? visible : last.content.trim(),
              };
            }
            return next;
          });
          // Stash the draft (prefer the parsed block; fall back to the raw
          // streamed text if no block came through).
          const draft = (draftText && draftText.trim().length > 0) ? draftText.trim() : null;
          if (draft) setDrafts((prev) => [...prev, draft]);
        },
        onError: (msg) => {
          setPreRoll(false);
          setStreaming(false);
          setError(msg === 'disabled'
            ? 'Sparky is disabled in this environment.'
            : (msg || 'Sparky could not respond. Try again in a moment.'));
        },
      },
    );
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming || disabled) return;
    const history: AssistantMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(history);
    setInput('');
    runTurn(history);
  };

  // Re-run the last turn: drop a trailing assistant message (if the previous
  // attempt half-streamed) and replay from the last user message.
  const handleRetry = () => {
    if (streaming) return;
    let history = messages.slice();
    while (history.length > 0 && history[history.length - 1].role === 'assistant') {
      history = history.slice(0, -1);
    }
    if (history.length === 0 || history[history.length - 1].role !== 'user') return;
    setMessages(history);
    runTurn(history);
  };

  const name = greetingName(currentUser);
  const hasChat = messages.length > 0;

  // Portal to <body>: the gantt page wrapper carries a CSS transform, which
  // would otherwise trap this fixed-position modal inside it.
  return createPortal(
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
            onClick={streaming ? undefined : onClose}
            className="fixed inset-0 z-[60] bg-[#1A1A1A]/40 backdrop-blur-[1px] print:hidden"
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
            className="fixed left-1/2 top-1/2 z-[61] flex max-h-[88vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl print:hidden"
          >
            {/* Header */}
            <header className="flex items-start justify-between px-6 pt-5 pb-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#6B6B6B] font-medium">
                  <span className="h-px w-5 bg-[#D8D2C4]" />
                  AI Assist
                </div>
                <h2
                  className="mt-1 text-[24px] font-medium leading-tight text-[#1A1A1A]"
                  style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                >
                  Sparky
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={streaming}
                aria-label="Close Sparky"
                className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {/* Body */}
            {disabled ? (
              <div className="px-6 pb-5">
                <div className="rounded-md border border-[#E8D8B5] bg-[#F9EFD9] px-3 py-2 text-xs text-[#9A6B12]">
                  Sparky is disabled in this environment. Set <code>VITE_ENABLE_REAL_AI=true</code>{' '}
                  and configure Supabase to enable the writing assistant.
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col border-t border-[#EFEBE0]">
                {/* Chat scroll area */}
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-3">
                  {!hasChat && !preRoll ? (
                    <div className="rounded-xl border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3">
                      <p
                        className="text-[18px] font-medium text-[#1A1A1A]"
                        style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                      >
                        G'day, {name}.
                      </p>
                      <p className="mt-1 text-sm text-[#6B6B6B]">
                        Ready when you are. Bullets, voice memo, or just paste what you've got.
                      </p>
                    </div>
                  ) : null}

                  {messages.map((m, i) => {
                    const isUser = m.role === 'user';
                    // The blinking cursor goes on the trailing assistant
                    // message while a turn is mid-stream.
                    const isLast = i === messages.length - 1;
                    const showCursor = streaming && !isUser && isLast;
                    return (
                      <div
                        key={i}
                        className={isUser ? 'flex justify-end' : 'flex justify-start'}
                      >
                        <div
                          className={
                            isUser
                              ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-[#2F8F5C] px-3.5 py-2 text-[14px] text-white whitespace-pre-wrap'
                              : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-[#E6E1D4] bg-[#FAF8F2] px-3.5 py-2 text-[14px] text-[#1A1A1A] whitespace-pre-wrap'
                          }
                        >
                          {m.content}
                          {showCursor ? <span className="ml-0.5 animate-pulse">▋</span> : null}
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing dots before the first delta lands */}
                  {preRoll ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-sm border border-[#E6E1D4] bg-[#FAF8F2] px-3.5 py-2.5">
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#A0A0A0] [animation-delay:-0.2s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#A0A0A0] [animation-delay:-0.1s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#A0A0A0]" />
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {error ? (
                    <div className="flex items-center gap-2">
                      <p className="rounded-md border border-[#F0C8C8] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
                        {error}
                      </p>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* Drafts tray — appears once Sparky has produced ≥1 draft */}
                {drafts.length > 0 ? (
                  <div className="border-t border-[#EFEBE0] px-6 py-2.5">
                    <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#C8841E]">
                      Drafts
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {drafts.map((d, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { onUseDraft(d); onClose(); }}
                          title={d}
                          className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-[#A8D0B8] bg-[#E5F2EA] px-3 py-1 text-[12px] font-medium text-[#246F47] hover:bg-[#A8D0B8]/30"
                        >
                          <span className="truncate">{d}</span>
                          <ArrowUpRight className="h-3 w-3 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Composer */}
                <div className="border-t border-[#EFEBE0] px-6 pt-3 pb-3">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    rows={hasChat ? 2 : 5}
                    placeholder={hasChat
                      ? 'Reply to Sparky, or ask for a tweak…'
                      : 'e.g. trenched east drainage L14\nflagged soft pocket near C-3\nremoved 6m3 spoil to north laydown'}
                    disabled={streaming}
                    className={inputField}
                  />
                </div>
              </div>
            )}

            {/* Footer */}
            {disabled ? (
              <footer className="flex justify-end gap-2 border-t border-[#EFEBE0] px-6 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#E6E1D4] bg-white text-xs font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"
                >
                  Close
                </button>
              </footer>
            ) : (
              <footer className="flex items-center justify-between gap-3 border-t border-[#EFEBE0] px-6 py-3">
                <span className="text-[11.5px] text-[#A0A0A0]">
                  ⌘/Ctrl + Enter to send
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={streaming}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#E6E1D4] bg-white text-xs font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2] disabled:opacity-60"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={streaming || input.trim().length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1A1A1A] text-white text-xs font-semibold hover:bg-black disabled:opacity-60"
                  >
                    <Sparkles className="h-3 w-3 text-[#FFE082]" />
                    {streaming ? 'Sparky is drafting…' : (hasChat ? 'Send' : 'Ask Sparky')}
                  </button>
                </div>
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
