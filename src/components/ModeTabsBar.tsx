type FeedMode = 'social' | 'reading';

interface ModeTabsBarProps {
  mode: FeedMode;
  onModeChange: (mode: FeedMode) => void;
  className?: string;
}

export function ModeTabsBar({ mode, onModeChange, className = '' }: ModeTabsBarProps) {
  return (
    <div className={`bg-white border-b border-gray-100 shrink-0 ${className}`}>
      <div className="px-4 py-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => onModeChange('social')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              mode === 'social'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Social
          </button>
          <button
            onClick={() => onModeChange('reading')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              mode === 'reading'
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

