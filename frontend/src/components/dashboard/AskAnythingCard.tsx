import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { askProject, AskProjectUnavailable } from '../../lib/api/askProject';
import { FRAUNCES } from '../../pages/gantt/components/ledger';

// Dashboard "Ask anything" widget (Tier-3 #14). Was a decorative box with a
// fake mic button; now a real single-turn project Q&A that calls the
// `ask-project` Edge Function. Degrades gracefully: if the function isn't
// deployed yet (or it's a demo project), it shows a calm "not enabled" line
// instead of erroring — so the card is honest in every state.

const SUGGESTIONS = [
  'What’s behind schedule?',
  'What did the last scans flag?',
  'What’s left before we close framing?',
];

export default function AskAnythingCard({ projectId }: { projectId: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true);
    setAnswer(null);
    setNote(null);
    try {
      const res = await askProject(projectId, query);
      setAnswer(res.answer);
    } catch (e) {
      setNote(
        e instanceof AskProjectUnavailable
          ? e.message
          : 'Couldn’t reach the assistant just now — try again in a moment.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative flex flex-col overflow-hidden rounded-[16px] bg-[#1A1A1A] p-5 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-[150px] w-[150px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(47,143,92,0.35), transparent 70%)' }}
      />
      <div className="relative mb-3 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: '#A8D0B8' }}>
        <Sparkles className="h-3 w-3" />
        Ask anything
      </div>

      {/* Answer / prompt area */}
      <div className="relative min-h-[64px] flex-1">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-sm text-[#D8D2C4]"
            >
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#A8D0B8' }} />
              Reading the project…
            </motion.div>
          ) : answer ? (
            <motion.p
              key="answer"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="max-h-32 overflow-y-auto pr-1 text-[13.5px] leading-relaxed text-[#F0EDE4]"
            >
              {answer}
            </motion.p>
          ) : note ? (
            <motion.p
              key="note"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-[13px] leading-relaxed text-[#D8D2C4]"
            >
              {note}
            </motion.p>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-[17px] font-medium leading-snug" style={{ fontFamily: FRAUNCES }}>
                What changed on site today?
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setQuestion(s); void ask(s); }}
                    className="rounded-[10px] border border-white/10 bg-white/5 px-2.5 py-1.5 text-left text-[11.5px] text-[#EFEBE0] transition-colors hover:bg-white/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); void ask(question); }}
        className="relative mt-4"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this project…"
          className="h-9 w-full rounded-full border border-white/15 bg-white/[0.07] px-3.5 pr-9 text-xs text-white placeholder:text-[#A0A0A0] focus:border-[#A8D0B8] focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || question.trim().length < 2}
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#2F8F5C] text-white transition-colors hover:bg-[#246F47] disabled:opacity-40"
          aria-label="Ask"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>
    </section>
  );
}
