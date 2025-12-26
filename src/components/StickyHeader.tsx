import React from 'react';

interface StickyHeaderProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Composant header sticky standardisé pour toutes les pages
 * - Position sticky top-0 avec safe-area-inset-top
 * - Background opaque + backdrop-blur
 * - Z-index élevé pour rester au-dessus du contenu
 * - Border-bottom pour séparation visuelle
 */
export function StickyHeader({ children, className = '' }: StickyHeaderProps) {
  return (
    <div
      className={`sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 ${className}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="px-4 py-3">
        {children}
      </div>
    </div>
  );
}

