import { ReactNode, useEffect } from 'react';
import { BottomNav } from './BottomNav';

type View = 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social';

interface AppLayoutProps {
  children: ReactNode;
  currentView: View;
  onNavigate: (view: View) => void;
  onStartSession: () => void;
  onOpenScanner?: () => void;
}

export function AppLayout({ children, currentView, onNavigate, onStartSession, onOpenScanner }: AppLayoutProps) {
  // Diagnostic: logs mount/unmount
  useEffect(() => {
    console.log('[MOUNT]', 'AppLayout');
    return () => console.log('[UNMOUNT]', 'AppLayout');
  }, []);
  return (
    <div 
      className="h-screen bg-background-light overflow-hidden"
      style={{
        overscrollBehavior: 'none', // Prevent bounce/overscroll on this container
      }}
    >
      {/* Children (pages) - each page manages its own scroll container with proper margins */}
      {children}

      {/* Bottom nav - fixed position, outside scroll flow */}
      <BottomNav
        currentView={currentView}
        onNavigate={onNavigate}
        onStartSession={onStartSession}
        onOpenScanner={onOpenScanner}
      />
    </div>
  );
}
