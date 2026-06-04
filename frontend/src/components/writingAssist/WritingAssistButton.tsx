// WritingAssistButton — the user-facing entry to the mock writing runtime.
//
// Three modes, mirrored from `MockAnalysisButton`'s shape so the two AI
// surfaces feel like siblings:
//   • idle   — Sparkles pill labelled "Assist"; click opens a popover with
//              three transform options (Improve / Expand with context / Tighten).
//   • running — disabled pill with a spinner + "Drafting…".
//   • result — EditorialModal opens with original / proposed / rationale +
//              "Use this draft" or "Discard" actions. Accept calls
//              `onAccept(draft)` so the caller can update its own textarea.
//
// The button intentionally doesn't own the textarea — it owns the *runtime*
// state. The parent controls the source of truth (typically a useState).
//
// Diff highlighting: a tiny word-level diff (added words sage-tinted, removed
// words slate strikethrough). No new dependency.

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Check, X, RotateCw, Pencil } from 'lucide-react';
import { EditorialModal, EditorialButton } from '../editorial';
import { Badge } from '../ui/badge';
import { useWritingAssist } from '../../lib/hooks/useWritingAssist';
import type { WritingContext, WritingTransform } from '../../lib/api/mockWritingAssist';
import { fadeIn, popover } from '../../lib/motion/variants';

interface WritingAssistButtonProps {
  /** Current textarea value — the assistant rewrites this. */
  value: string;
  /** Called with the proposed draft when the user clicks "Use this draft". */
  onAccept: (next: string) => void;
  /** Diary-style context (weather, crew, etc.) passed through to the runtime. */
  context: WritingContext;
  /** Disable the button (e.g. when the textarea is empty / too short). */
  disabled?: boolean;
}

const TRANSFORM_OPTIONS: Array<{ id: WritingTransform; label: string; description: string }> = [
  { id: 'improve',             label: 'Improve',             description: 'Fix punctuation + capitalisation + expand shorthand.' },
  { id: 'expand_with_context', label: 'Expand with context', description: 'Prepend a weather + crew summary line.' },
  { id: 'tighten',             label: 'Tighten',             description: 'Strip filler words; brisk semicolon-joined prose.' },
];

export default function WritingAssistButton({ value, onAccept, context, disabled = false }: WritingAssistButtonProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState('');
  const [accepting, setAccepting] = useState(false);
  const { state, draft, rationale, model, error, run, reset } = useWritingAssist();

  const triggerDisabled = disabled || state === 'running' || value.trim().length < 3;
  const modalOpen = state === 'success' || state === 'error';

  const onTransformClick = async (transform: WritingTransform) => {
    setPopoverOpen(false);
    await run(transform, value, context);
  };

  const onUseDraft = () => {
    if (accepting) return;
    // Sage swipe runs for 600ms before the accept fires + modal closes.
    // Stops the modal from blinking away the instant the button is pressed.
    setAccepting(true);
    setTimeout(() => {
      const finalText = editing ? editedDraft : draft;
      if (finalText) onAccept(finalText);
      setEditing(false);
      setEditedDraft('');
      setAccepting(false);
      reset();
    }, 600);
  };

  const onDiscard = () => {
    if (accepting) return;
    setEditing(false);
    setEditedDraft('');
    reset();
  };

  return (
    <>
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => setPopoverOpen((o) => !o)}
          disabled={triggerDisabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#3A3A3A] transition-colors hover:border-[#D8D2C4] hover:bg-[#FAF8F2] disabled:opacity-50 disabled:hover:bg-white"
          style={state === 'running' ? { borderColor: '#2F8F5C', color: '#246F47' } : undefined}
          aria-haspopup="menu"
          aria-expanded={popoverOpen}
        >
          <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center">
            <Sparkles className="h-3.5 w-3.5" />
            {state === 'running' && (
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute inset-0 h-3.5 w-3.5 animate-spin"
                style={{ animationDuration: '1.4s' }}
                aria-hidden
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="20 100"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
          {state === 'running' ? 'Drafting…' : 'Assist'}
        </button>

        <AnimatePresence>
          {popoverOpen && (
            <>
              <motion.div
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="fixed inset-0 z-40"
                onClick={() => setPopoverOpen(false)}
                aria-hidden
              />
              <motion.div
                variants={popover}
                initial="hidden"
                animate="visible"
                exit="exit"
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
              >
                {TRANSFORM_OPTIONS.map((opt, idx) => (
                  <motion.button
                    key={opt.id}
                    type="button"
                    role="menuitem"
                    onClick={() => onTransformClick(opt.id)}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: 0.05 + idx * 0.04 } }}
                    className="group/option relative flex w-full flex-col items-start gap-0.5 overflow-hidden border-b border-[#EFEBE0] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[#FAF8F2]"
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-[#E5F2EA]/0 via-[#E5F2EA]/60 to-[#E5F2EA]/0 transition-transform duration-[1200ms] group-hover/option:translate-x-full"
                    />
                    <span className="relative text-sm font-medium text-[#1A1A1A]">{opt.label}</span>
                    <span className="relative text-[11px] text-[#6B6B6B]">{opt.description}</span>
                  </motion.button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {modalOpen && (
        <EditorialModal
          open
          onClose={onDiscard}
          eyebrow="AI assist"
          title={state === 'success' ? 'Proposed rewrite' : "Couldn't draft"}
          size="lg"
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              {state === 'success' && rationale && (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <TypewriterRationale text={rationale} />
                  <Badge
                    variant="outline"
                    className={`shrink-0 ${
                      model
                        ? 'border-[#E6E1D4] bg-[#E5F2EA] text-[#246F47]'
                        : 'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]'
                    }`}
                  >
                    {model ? `Real · ${model}` : 'Mock'}
                  </Badge>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                <EditorialButton variant="ghost" onClick={onDiscard}>
                  <X className="h-3.5 w-3.5" />
                  Discard
                </EditorialButton>
                {state === 'success' && !editing && (
                  <EditorialButton
                    variant="ghost"
                    onClick={() => {
                      setEditing(true);
                      setEditedDraft(draft ?? '');
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </EditorialButton>
                )}
                {state === 'success' && (
                  <span className="relative inline-flex overflow-hidden rounded-full">
                    <EditorialButton variant="pill" onClick={onUseDraft}>
                      <Check className="h-3.5 w-3.5" />
                      Use this draft
                    </EditorialButton>
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-0 bg-[#2F8F5C] transition-transform duration-[600ms] ${accepting ? 'translate-x-0' : '-translate-x-full'}`}
                    />
                  </span>
                )}
                {state === 'error' && (
                  <EditorialButton variant="pill" onClick={onDiscard}>
                    <RotateCw className="h-3.5 w-3.5" />
                    Close
                  </EditorialButton>
                )}
              </div>
            </div>
          }
        >
          {state === 'error' && (
            <p className="rounded-[14px] border border-[#C44545]/30 bg-[#FBE5E5] px-3 py-2 text-sm text-[#C44545]">
              {error ?? 'The assistant failed mid-draft. Try again.'}
            </p>
          )}
          {state === 'success' && (
            <div className="space-y-4">
              <Section label="Original">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#6B6B6B]">{value}</p>
              </Section>
              <Section label="Proposed">
                {editing ? (
                  <textarea
                    value={editedDraft}
                    onChange={(e) => setEditedDraft(e.target.value)}
                    rows={Math.max(3, editedDraft.split('\n').length)}
                    className="w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm leading-relaxed text-[#1A1A1A] shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1A1A1A]">
                    <Diff before={value} after={draft ?? ''} />
                  </p>
                )}
              </Section>
            </div>
          )}
        </EditorialModal>
      )}
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">{label}</p>
      {children}
    </div>
  );
}

// Word-level diff. Compares whitespace-split tokens; words in `after` not
// present in `before` get sage background, words in `before` not present
// in `after` get rendered as strikethrough. Naive but sufficient for
// the demo's visual signal — proper LCS lives in a follow-up if it matters.
function Diff({ before, after }: { before: string; after: string }) {
  const beforeTokens = before.split(/(\s+)/);
  const afterTokens = after.split(/(\s+)/);
  const beforeSet = new Set(beforeTokens.map((t) => t.toLowerCase()));
  let newIdx = 0;
  return (
    <>
      {afterTokens.map((token, idx) => {
        if (/^\s+$/.test(token)) return <span key={idx}>{token}</span>;
        const isNew = !beforeSet.has(token.toLowerCase());
        if (isNew) {
          const delay = newIdx * 30;
          newIdx += 1;
          return (
            <span
              key={idx}
              className="animate-in rounded bg-[#E5F2EA] px-0.5 text-[#246F47]"
              style={{ animationDelay: `${delay}ms` }}
            >
              {token}
            </span>
          );
        }
        return <span key={idx}>{token}</span>;
      })}
    </>
  );
}

// Types out the rationale a character at a time so it reads as the AI
// "thinking" rather than landing as plain text. Honours
// prefers-reduced-motion by showing the full string immediately.
function TypewriterRationale({ text }: { text: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const id = setInterval(() => {
      setShown((s) => {
        if (s >= text.length) {
          clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, 25);
    return () => clearInterval(id);
  }, [text]);

  return (
    <p className="min-w-0 flex-1 truncate text-[11px] text-[#6B6B6B]">
      {text.slice(0, shown)}
      {shown < text.length && <span className="opacity-50">▍</span>}
    </p>
  );
}
