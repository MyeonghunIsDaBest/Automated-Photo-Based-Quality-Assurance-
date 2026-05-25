// frontend/src/pages/gantt/tabs/assistant/ComposerBar.tsx
//
// Composer for the Sparky chat. Textarea + send button. Mic button is
// added in task 12. Keeps its own draft value so parents don't re-render
// on every keystroke.

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';

interface ComposerBarProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  /** Pre-fill the textarea (e.g. when opened from "Get help from Sparky"). */
  seedText?: string;
  /** Called once when the seed has been consumed into local state. */
  onSeedConsumed?: () => void;
}

export function ComposerBar({ onSend, disabled, seedText, onSeedConsumed }: ComposerBarProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (seedText && seedText.trim()) {
      setText(seedText);
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedText]);

  const handleSend = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="sticky bottom-0 mt-3 border-t border-slate-200 bg-white py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          disabled={disabled}
          placeholder="Type, or paste rough notes — Sparky will clean it up."
          className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
