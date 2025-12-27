import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

type View = 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social';

interface AppLayoutProps {
  children: ReactNode;
  currentView: View;
  onNavigate: (view: View) => void;
  onStartSession: () => void;
}

export function AppLayout({ children, currentView, onNavigate, onStartSession }: AppLayoutProps) {
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
      />
    </div>
  );
}
