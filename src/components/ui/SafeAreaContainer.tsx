import { ReactNode } from 'react';

interface SafeAreaContainerProps {
  children: ReactNode;
  className?: string;
  /** Apply safe area padding to top */
  safeTop?: boolean;
  /** Apply safe area padding to bottom */
  safeBottom?: boolean;
  /** Minimum padding when safe-area-inset is 0 */
  minPaddingTop?: number;
  minPaddingBottom?: number;
}

/**
 * SafeAreaContainer - Wrapper component for iOS safe area support
 * 
 * Handles Dynamic Island, notch, and home indicator spacing automatically.
 * Uses CSS env() variables for safe-area-inset-top and safe-area-inset-bottom.
 */
export function SafeAreaContainer({
  children,
  className = '',
  safeTop = true,
  safeBottom = true,
  minPaddingTop = 12,
  minPaddingBottom = 16,
}: SafeAreaContainerProps) {
  const style: React.CSSProperties = {};

  if (safeTop) {
    style.paddingTop = `max(${minPaddingTop}px, env(safe-area-inset-top))`;
  }

  if (safeBottom) {
    style.paddingBottom = `max(${minPaddingBottom}px, env(safe-area-inset-bottom))`;
  }

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

