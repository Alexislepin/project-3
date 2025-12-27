type FeedFilter = 'all' | 'following' | 'me';

interface AudienceTabsProps {
  filter: FeedFilter;
  onFilterChange: (filter: FeedFilter) => void;
  className?: string;
}

export function AudienceTabs({ filter, onFilterChange, className = '' }: AudienceTabsProps) {
  return (
    <div className={`bg-white/95 backdrop-blur border-b border-gray-100 shrink-0 ${className}`}>
      <div className="px-4 py-1.5">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => onFilterChange('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              filter === 'all'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => onFilterChange('following')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              filter === 'following'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Abonnements
          </button>
          <button
            onClick={() => onFilterChange('me')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              filter === 'me'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Moi
          </button>
        </div>
      </div>
    </div>
  );
}

