import { useEffect, ReactNode } from 'react';
import { useScrollLock } from '../hooks/useScrollLock';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';

interface ModalSheetProps {
  onClose: () => void;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  /** Max width of the sheet (default: min(520px, 92vw)) */
  maxWidth?: string;
  /** Additional padding for footer (default: 16px + safe-area) */
  footerPadding?: string;
}

/**
 * Composant ModalSheet standardisé pour toutes les modales de l'app.
 * 
 * Caractéristiques:
 * - Overlay fixe avec fond grisé
 * - Sheet centrée avec marges safe area
 * - Max-height calculé pour éviter tabbar/FAB
 * - Scroll interne (header/footer sticky)
 * - Lock body scroll + data-modal-open flag
 * - Zones cliquables optimisées iOS
 */
export function ModalSheet({
  onClose,
  children,
  header,
  footer,
  maxWidth = 'min(520px, 92vw)',
  footerPadding,
}: ModalSheetProps) {
  // Lock body scroll when modal is open
  useScrollLock(true);

  // Set data-modal-open flag for BottomNav
  useEffect(() => {
    document.body.dataset.modalOpen = '1';
    return () => {
      document.body.dataset.modalOpen = '0';
    };
  }, []);

  // Calculate max-height: 100vh - top safe area - bottom safe area - tabbar - extra margin
  // Extra margin to keep the sheet visually detached from tabbar/FAB on iPhone
  const EXTRA_MARGIN = 90;
  const maxHeight = `calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - ${TABBAR_HEIGHT}px - ${EXTRA_MARGIN}px)`;

  // Default footer padding: 16px + safe-area-inset-bottom
  const defaultFooterPadding = footerPadding || 'calc(env(safe-area-inset-bottom) + 32px)';

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
      data-modal-overlay
      onClick={onClose}
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
        className="bg-background-light rounded-3xl w-full flex flex-col overflow-hidden shadow-2xl"
        style={{
          maxWidth,
          maxHeight,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        {header && (
          <div className="flex-shrink-0 bg-background-light border-b border-gray-200">
            {header}
          </div>
        )}

        {/* Scrollable Body */}
        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: footer ? undefined : defaultFooterPadding,
          }}
        >
          {children}
        </div>

        {/* Sticky Footer */}
        {footer && (
          <div
            className="sticky bottom-0 bg-background-light border-t border-gray-200 flex-shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10"
            style={{
              paddingBottom: defaultFooterPadding,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
