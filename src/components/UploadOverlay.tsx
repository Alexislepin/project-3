import { Loader2 } from 'lucide-react';

interface UploadOverlayProps {
  open: boolean;
  label?: string;
}

/**
 * Full-screen overlay that blocks UI during upload
 * Prevents navigation, clicks, and shows upload progress
 */
export function UploadOverlay({ open, label = 'Importation de l\'image…' }: UploadOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-all"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      onClick={(e) => {
        // Block all clicks during upload
        e.preventDefault();
        e.stopPropagation();
      }}
      onTouchMove={(e) => {
        // Prevent scroll during upload
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="bg-white rounded-2xl p-6 shadow-xl max-w-xs w-full mx-4 flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-stone-900 text-center">
          {label}
        </p>
      </div>
    </div>
  );
}

