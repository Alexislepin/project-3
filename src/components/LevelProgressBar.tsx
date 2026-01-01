import { getLevelProgress, formatXp } from '../lib/leveling';

interface LevelProgressBarProps {
  xpTotal: number;
  variant?: 'full' | 'compact';
  className?: string;
  onClick?: () => void;
}

export function LevelProgressBar({ xpTotal, variant = 'full', className = '', onClick }: LevelProgressBarProps) {
  const progress = getLevelProgress(xpTotal);

  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-2.5 ${className} ${onClick ? 'cursor-pointer select-none' : ''}`}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!onClick) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <span className="text-xs font-semibold text-stone-800 whitespace-nowrap">
          Niveau {progress.level}
        </span>

        <div className="flex-1 h-0.5 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress.progress}%` }}
          />
        </div>

        <span className="text-xs font-medium text-stone-600 whitespace-nowrap">
          {formatXp(progress.intoLevel)} / {formatXp(progress.needed)} XP
        </span>

        {onClick && (
          <span className="ml-2 px-2.5 py-1 text-sm font-bold text-black bg-stone-100 rounded-full whitespace-nowrap border border-stone-200">
            +XP
          </span>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div className={`bg-white rounded-2xl border border-stone-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[#111]">Niveau {progress.level}</span>
          <span className="text-xs font-normal text-stone-500">({formatXp(progress.xpTotal)} XP total)</span>
        </div>
        {onClick && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="px-2.5 py-1 text-sm font-bold text-black bg-stone-100 rounded-full whitespace-nowrap border border-stone-200 cursor-pointer hover:bg-stone-200 transition-colors"
          >
            +XP
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex-1 h-1 bg-stone-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        <span className="text-xs font-medium text-stone-600 whitespace-nowrap">
          {formatXp(progress.intoLevel)} / {formatXp(progress.needed)} XP
        </span>
      </div>
      
      <div className="flex items-center justify-between">
        <p className="text-xs font-normal text-stone-500 leading-tight">
          {formatXp(progress.remaining)} XP jusqu'au niveau {progress.level + 1}
        </p>
        {onClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="text-xs text-stone-600 hover:text-stone-900 hover:underline font-medium"
            type="button"
          >
            Comment ça marche les niveaux ?
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact level badge (for user lists)
 */
export function LevelBadge({ xpTotal, className = '' }: { xpTotal: number; className?: string }) {
  const level = getLevelProgress(xpTotal).level;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-700 ${className}`}
    >
      Lvl {level}
    </span>
  );
}

