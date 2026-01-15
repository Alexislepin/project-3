import { useEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: ReactNode;
  onBackdropClick?: () => void;
  onContentClick?: (e: React.MouseEvent | React.TouchEvent) => void;
}

export function ModalPortal({ children, onBackdropClick, onContentClick }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Lock body scroll and set modal open flag
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.modalOpen = '1';
    
    if (import.meta.env.DEV) {
      console.log('[ModalPortal] mounted');
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = originalOverflow;
      document.body.dataset.modalOpen = '';
      
      if (import.meta.env.DEV) {
        console.log('[ModalPortal] unmounted');
      }
    };
  }, []);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (import.meta.env.DEV) {
      console.log('[ModalPortal] backdrop mousedown', { target: e.target });
    }
    e.stopPropagation();
    if (e.target === e.currentTarget && onBackdropClick) {
      onBackdropClick();
    }
  };

  const handleBackdropTouchStart = (e: React.TouchEvent) => {
    if (import.meta.env.DEV) {
      console.log('[ModalPortal] backdrop touchstart', { target: e.target });
    }
    e.stopPropagation();
    if (e.target === e.currentTarget && onBackdropClick) {
      onBackdropClick();
    }
  };

  const handleContentMouseDown = (e: React.MouseEvent) => {
    if (import.meta.env.DEV) {
      console.log('[ModalPortal] content mousedown', { target: e.target });
    }
    e.stopPropagation();
    if (onContentClick) {
      onContentClick(e);
    }
  };

  const handleContentTouchStart = (e: React.TouchEvent) => {
    if (import.meta.env.DEV) {
      console.log('[ModalPortal] content touchstart', { target: e.target });
    }
    e.stopPropagation();
    if (onContentClick) {
      onContentClick(e);
    }
  };

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onMouseDown={handleBackdropMouseDown}
        onTouchStart={handleBackdropTouchStart}
      />
      {/* Modal content container */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
        <div
          className="pointer-events-auto w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onMouseDown={handleContentMouseDown}
          onTouchStart={handleContentTouchStart}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

