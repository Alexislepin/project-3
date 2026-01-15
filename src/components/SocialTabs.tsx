type SocialTab = 'books' | 'activities';

import { useTheme } from '../contexts/ThemeContext';

interface SocialTabsProps {
  tab: SocialTab;
  onTabChange: (tab: SocialTab) => void;
  className?: string;
}

export function SocialTabs({ tab, onTabChange, className = '' }: SocialTabsProps) {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';

  const activeClass = isDark ? 'bg-[#ffffff] text-[#0f0f10]' : 'bg-stone-900 text-white';
  const inactiveClass = isDark
    ? 'bg-[rgba(255,255,255,0.18)] text-[#f5f5f7]'
    : 'bg-white text-stone-600';

  return (
    <div className={`bg-white/95 backdrop-blur border-b border-gray-100 shrink-0 ${className}`}>
      <div className="px-4 py-1.5">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => onTabChange('books')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 border-0 ${
              tab === 'books' ? activeClass : inactiveClass
            }`}
          >
            Livres
          </button>
          <button
            onClick={() => onTabChange('activities')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 border-0 ${
              tab === 'activities' ? activeClass : inactiveClass
            }`}
          >
            Activités
          </button>
        </div>
      </div>
    </div>
  );
}

export type { SocialTab };

