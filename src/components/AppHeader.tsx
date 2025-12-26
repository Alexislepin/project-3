import React from 'react';
import { ArrowLeft, X } from 'lucide-react';

interface AppHeaderProps {
  children?: React.ReactNode;
  className?: string;
  showBack?: boolean;
  onBack?: () => void;
  showClose?: boolean;
  onClose?: () => void;
  title?: string;
  rightActions?: React.ReactNode;
}

/**
 * Composant header standardisé pour toutes les pages
 * - Position sticky top-0 avec safe-area-inset-top
 * - Background opaque (blanc) + backdrop-blur
 * - Z-index élevé pour rester au-dessus du contenu
 * - Border-bottom pour séparation visuelle
 * - Support back button et close button
 */
export function AppHeader({ 
  children, 
  className = '', 
  showBack = false,
  onBack,
  showClose = false,
  onClose,
  title,
  rightActions
}: AppHeaderProps) {
  return (
    <div
      className={`sticky top-0 z-50 bg-theme-card backdrop-blur-sm border-b border-theme ${className}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="px-4 py-3">
        {(showBack || showClose || title || rightActions) ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {showBack && onBack && (
                <button
                  onClick={onBack}
                  className="p-2 -ml-2 hover:bg-black/5 rounded-full transition-colors flex-shrink-0"
                  aria-label="Retour"
                >
                  <ArrowLeft className="w-5 h-5 text-text-main-light" />
                </button>
              )}
              {showClose && onClose && (
                <button
                  onClick={onClose}
                  className="p-2 -ml-2 hover:bg-black/5 rounded-full transition-colors flex-shrink-0"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5 text-text-main-light" />
                </button>
              )}
              {title && (
                <h1 className="text-lg font-bold tracking-tight truncate">{title}</h1>
              )}
            </div>
            {rightActions && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {rightActions}
              </div>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

