type SocialTab = 'books' | 'activities';

interface SocialTabsProps {
  tab: SocialTab;
  onTabChange: (tab: SocialTab) => void;
  className?: string;
}

export function SocialTabs({ tab, onTabChange, className = '' }: SocialTabsProps) {
  return (
    <div className={`bg-white/95 backdrop-blur border-b border-gray-100 shrink-0 ${className}`}>
      <div className="px-4 py-1.5">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => onTabChange('books')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              tab === 'books'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Livres
          </button>
          <button
            onClick={() => onTabChange('activities')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              tab === 'activities'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
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

