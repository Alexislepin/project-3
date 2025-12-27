import { Home, BookOpen, User, Circle, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BottomNavProps {
  currentView: 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social';
  onNavigate: (view: 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social') => void;
  onStartSession: () => void;
}

export function BottomNav({ currentView, onNavigate, onStartSession }: BottomNavProps) {
  const { t } = useTranslation();
  const navItems = [
    { id: 'home' as const, icon: Home, label: t('nav.home') },
    { id: 'insights' as const, icon: TrendingUp, label: t('nav.stats') },
    { id: 'record' as const, icon: Circle, label: t('nav.session'), isCenter: true },
    { id: 'library' as const, icon: BookOpen, label: t('nav.library') },
    { id: 'profile' as const, icon: User, label: t('nav.profile') },
  ];

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-card-light border-t border-gray-200 z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)', // Safe-area uniquement, pas de padding supplémentaire
      }}
    >
      <div className="max-w-lg mx-auto flex justify-around items-center h-16 relative">
        {navItems.map((item) => {
          if (item.isCenter) {
            return (
              <div key={item.id} className="flex-1 flex justify-center">
                <button
                  onClick={onStartSession}
                  className="absolute -top-6 w-16 h-16 bg-primary rounded-full shadow-[0_4px_20px_rgba(249,245,6,0.4)] flex items-center justify-center hover:shadow-[0_6px_24px_rgba(249,245,6,0.5)] hover:scale-105 active:scale-95 transition-all border-4 border-background-light"
                  aria-label={t('session.title')}
                >
                  <Circle className="w-8 h-8 text-black fill-current" />
                </button>
              </div>
            );
          }

          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id !== 'record') {
                  onNavigate(item.id as 'home' | 'search' | 'library' | 'profile' | 'insights' | 'social');
                }
              }}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive ? 'text-primary' : 'text-text-sub-light'
              }`}
            >
              <Icon
                className="w-6 h-6 mb-0.5"
                strokeWidth={isActive ? 2.5 : 2}
                fill={isActive ? 'currentColor' : 'none'}
              />
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
