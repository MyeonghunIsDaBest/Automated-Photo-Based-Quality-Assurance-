import { useEffect } from 'react';
import { X } from 'lucide-react';
import EyebrowLabel from './EyebrowLabel';
import { modalCard, modalOverlay, cn } from '../../lib/editorial';

interface EditorialModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  /** Sticky footer slot (e.g. action buttons). */
  footer?: React.ReactNode;
  /** Width on tablet+. Mobile is always full-width bottom-sheet. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  className?: string;
}

const SIZE_WIDTH: Record<NonNullable<EditorialModalProps['size']>, string> = {
  sm: 'sm:w-[min(420px,calc(100vw-2rem))]',
  md: 'sm:w-[min(560px,calc(100vw-2rem))]',
  lg: 'sm:w-[min(720px,calc(100vw-2rem))]',
  xl: 'sm:w-[min(960px,calc(100vw-2rem))]',
};

export default function EditorialModal({
  open,
  onClose,
  title,
  eyebrow,
  footer,
  size = 'md',
  children,
  className,
}: EditorialModalProps) {
  // Lock the page underneath while the modal is open. The .body-scroll-lock
  // class is declared in index.css. Keys off `open` so the cleanup always
  // runs even if the consumer unmounts the modal mid-open.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('body-scroll-lock');
    return () => {
      document.body.classList.remove('body-scroll-lock');
    };
  }, [open]);

  // Esc dismisses the modal — the standard accessibility behaviour. The
  // event has to bubble from <document> because the dialog isn't focused
  // by default (the consumer can override by tabbing into a child).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className={cn(modalOverlay, 'cursor-default')}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editorial-modal-title"
        className={cn(modalCard, SIZE_WIDTH[size], 'editorial-root', className)}
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            {eyebrow && <EyebrowLabel>{eyebrow}</EyebrowLabel>}
            <h2
              id="editorial-modal-title"
              className="display mt-1 text-lg font-medium text-slate-900 sm:text-xl"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="editorial-scrollbox flex-1 px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6">
          {children}
        </div>

        {footer && (
          <footer className="sticky bottom-0 z-10 border-t border-slate-100 bg-white px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </>
  );
}
