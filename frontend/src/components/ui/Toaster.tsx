// ─────────────────────────────────────────────────────────────────────────────
// components/ui/Toaster.tsx — the app toast, warm-ledger toned (P9.A).
//
// Exports the shared ToastState type + useToast() hook so the ~30 local
// `type ToastState = …` copies collapse to one import:
//   const { toast, setToast, clear } = useToast();
//   …
//   {toast && <Toaster message={toast.message} type={toast.type} onClose={clear} />}
// ─────────────────────────────────────────────────────────────────────────────

import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;

/** Local toast state + a stable clear callback — the one pattern every surface uses. */
export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const clear = useCallback(() => setToast(null), []);
  return { toast, setToast, clear };
}

interface ToasterProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

export function Toaster({ message, type, onClose }: ToasterProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  // Warm-ledger tones (TONE sage / red / ink washes) instead of the old
  // green/red/blue-50 Tailwind palette.
  const config = {
    success: { bg: '#E5F2EA', border: '#C8E0D2', text: '#246F47', icon: CheckCircle2 },
    error:   { bg: '#FBE5E5', border: '#F0C8C8', text: '#C44545', icon: AlertCircle },
    info:    { bg: '#F0EDE4', border: '#E6E1D4', text: '#3A3A3A', icon: Info },
  } as const;

  const { bg, border, text, icon: Icon } = config[type];

  return (
    // Bottom offset includes --bottom-nav-h (set by Layout when the phone tab
    // bar mounts) + safe-area, so the toast always clears both.
    <div
      className="fixed z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{
        bottom: 'calc(1rem + env(safe-area-inset-bottom) + var(--bottom-nav-h, 0px))',
        right: 'calc(1rem + env(safe-area-inset-right))',
        left: 'calc(1rem + env(safe-area-inset-left))',
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      <div
        className="ml-auto flex max-w-md items-center gap-3 rounded-[11px] border px-4 py-3 shadow-[0_3px_12px_rgba(20,20,20,0.08)]"
        style={{ backgroundColor: bg, borderColor: border }}
      >
        <Icon className="h-5 w-5 flex-shrink-0" style={{ color: text }} />
        <p className="min-w-0 flex-1 text-sm font-medium" style={{ color: text }}>{message}</p>
        <button
          onClick={onClose}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full hover:bg-white/60 active:bg-white/70"
          style={{ color: text }}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
