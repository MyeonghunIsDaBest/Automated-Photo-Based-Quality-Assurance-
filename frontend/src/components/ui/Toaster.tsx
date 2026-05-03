import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useEffect } from 'react';

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

  const config = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      icon: CheckCircle2,
      iconColor: 'text-green-600',
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: AlertCircle,
      iconColor: 'text-red-600',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: Info,
      iconColor: 'text-blue-600',
    },
  };

  const { bg, border, text, icon: Icon, iconColor } = config[type];

  return (
    // Position uses calc(...) with env(safe-area-inset-*) so on notched
    // phones the toast clears the home-indicator instead of sitting under it.
    // On a 360px screen the toast width is capped to viewport - 2rem so it
    // never overflows.
    <div
      className="fixed z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        right: 'calc(1rem + env(safe-area-inset-right))',
        left: 'calc(1rem + env(safe-area-inset-left))',
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      <div className={`ml-auto flex max-w-md items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${bg} ${border}`}>
        <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
        <p className={`min-w-0 flex-1 text-sm font-medium ${text}`}>{message}</p>
        <button
          onClick={onClose}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded ${text} hover:bg-white/50 active:bg-white/60`}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
