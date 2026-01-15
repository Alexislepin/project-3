import { ReactNode, useEffect } from 'react';
import { BottomNav } from './BottomNav';
import { ActiveSessionBanner } from '../ActiveSessionBanner';

type View = 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social';

interface AppLayoutProps {
  children: ReactNode;
  currentView: View;
  onNavigate: (view: View) => void;
  onStartSession: () => void;
  onOpenScanner?: () => void;
  hideActiveSessionBanner?: boolean;
}

export function AppLayout({
  children,
  currentView,
  onNavigate,
  onStartSession,
  onOpenScanner,
  hideActiveSessionBanner,
}: AppLayoutProps) {
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
      {/* Children (pages) - each page manages son scroll */}
      {children}

      {/* Bannière session en cours */}
      <ActiveSessionBanner onResume={onStartSession} hidden={hideActiveSessionBanner} />

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
