import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { TABBAR_HEIGHT } from '../../lib/layoutConstants';

interface CenteredModalShellProps {
  title?: string;
  onClose: () => void;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  overlayClassName?: string;
  maxWidth?: string;
}

/**
 * CenteredModalShell - Composant réutilisable pour toutes les modales centrées
 * 
 * Gère automatiquement :
 * - Overlay avec safe-area insets
 * - Container de taille fixe (ne grandit jamais)
 * - Layout interne : header (optionnel), body scrollable, footer (optionnel)
 * - Respect de la bottom tab bar (marge de sécurité)
 * - Scroll uniquement dans le body
 */
export function CenteredModalShell({
  title,
  onClose,
  headerRight,
  footer,
  children,
  className = '',
  bodyClassName = '',
  overlayClassName = '',
  maxWidth = 'min(92vw, 520px)',
}: CenteredModalShellProps) {
  // Hauteur totale de la bottom tab bar : hauteur du contenu + safe-area
  // Le bouton central dépasse un peu, donc on ajoute une marge de sécurité
  const tabbarSafeHeight = TABBAR_HEIGHT + 8; // 64px + 8px de marge

  return (
    <div
      className={`fixed inset-0 bg-black/50 z-[200] flex items-center justify-center ${overlayClassName}`}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
        paddingBottom: `calc(env(safe-area-inset-bottom) + 16px + ${tabbarSafeHeight}px)`,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onTouchMove={(e) => {
        // Prevent scroll on overlay
        const target = e.target as HTMLElement;
        if (!target.closest('[data-modal-content]')) {
          e.preventDefault();
        }
      }}
    >
      <div
        data-modal-content
        className={`bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden flex flex-col ${className}`}
        style={{
          width: maxWidth,
          maxHeight: `calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px - 16px - ${tabbarSafeHeight}px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (optionnel) */}
        {(title || headerRight) && (
          <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 pt-4 pb-3 flex items-center justify-between rounded-t-3xl">
            {title && (
              <h2 className="text-xl font-bold text-text-main-light">{title}</h2>
            )}
            <div className="flex items-center gap-2">
              {headerRight}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Fermer"
              >
                <X className="w-5 h-5 text-text-sub-light" />
              </button>
            </div>
          </div>
        )}

        {/* Body (scrollable) */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: footer ? 'calc(env(safe-area-inset-bottom) + 12px)' : 'calc(env(safe-area-inset-bottom) + 12px)',
          }}
        >
          {children}
        </div>

        {/* Footer (optionnel) */}
        {footer && (
          <div className="flex-shrink-0 bg-white border-t border-gray-200 rounded-b-3xl shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10">
            <div
              className="px-6 py-3"
              style={{
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
              }}
            >
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

