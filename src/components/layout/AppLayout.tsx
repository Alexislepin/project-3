import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface AppLayoutProps {
  children: ReactNode;
  currentView: 'home' | 'search' | 'library' | 'profile' | 'insights';
  onNavigate: (view: 'home' | 'search' | 'library' | 'profile' | 'insights') => void;
  onStartSession: () => void;
}

export function AppLayout({ children, currentView, onNavigate, onStartSession }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background-light pb-20">
      {children}

      <BottomNav currentView={currentView} onNavigate={onNavigate} onStartSession={onStartSession} />
    </div>
  );
}
