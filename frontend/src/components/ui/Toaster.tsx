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
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${bg} ${border}`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
        <p className={`text-sm font-medium ${text}`}>{message}</p>
        <button
          onClick={onClose}
          className={`rounded p-1 ${text} hover:bg-white/50`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
