import { useEffect } from 'react';
import { CheckCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'info' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = {
    success: 'bg-green-50 border-green-200 text-green-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  }[type];

  const iconColor = {
    success: 'text-green-600',
    info: 'text-blue-600',
    error: 'text-red-600',
  }[type];

  const Icon = type === 'success' ? CheckCircle : Info;

  return (
    <div 
      className={`fixed right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColor} animate-in slide-in-from-top-5`}
      style={{
        top: 'calc(env(safe-area-inset-top) + 12px)',
        maxWidth: 'calc(100vw - 2rem - env(safe-area-inset-right) - env(safe-area-inset-left))',
      }}
    >
      <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={onClose}
        className={`flex-shrink-0 ${iconColor} hover:opacity-70 transition-opacity`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

