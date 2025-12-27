type ContentTab = 'social' | 'reading';

interface ContentTabsProps {
  contentTab: ContentTab;
  onContentTabChange: (tab: ContentTab) => void;
  className?: string;
}

export function ContentTabs({ contentTab, onContentTabChange, className = '' }: ContentTabsProps) {
  return (
    <div className={`bg-white/95 backdrop-blur border-b border-gray-100 shrink-0 ${className}`}>
      <div className="px-4 py-1.5">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => onContentTabChange('social')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              contentTab === 'social'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Social
          </button>
          <button
            onClick={() => onContentTabChange('reading')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              contentTab === 'reading'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Lectures
          </button>
        </div>
      </div>
    </div>
  );
}

