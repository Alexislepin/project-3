import { ReactNode } from 'react';

interface SafeAreaContainerProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Container that applies safe-area insets for iOS notch/Dynamic Island
 * Ensures content is never hidden behind the status bar or home indicator
 */
export function SafeAreaContainer({ children, className = '', style }: SafeAreaContainerProps) {
  return (
    <div
      className={`min-h-screen ${className}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

