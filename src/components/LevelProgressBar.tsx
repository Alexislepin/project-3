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
        <span className="text-xs font-semibold text-text-main whitespace-nowrap">
          Niveau {progress.level}
        </span>

        <div className="flex-1 h-0.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress.progress}%` }}
          />
        </div>

        <span className="text-xs font-medium text-text-sub whitespace-nowrap">
          {formatXp(progress.intoLevel)} / {formatXp(progress.needed)} XP
        </span>

        {onClick && (
          <span className="ml-1 px-2 py-0.5 text-xs font-semibold text-text-main whitespace-nowrap border border-border rounded-full bg-surface-2">
            +XP
          </span>
        )}
      </div>
    );
  }

  // Full variant
  const content = (
    <div className={`bg-surface rounded-2xl border border-border shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-text-main">Niveau {progress.level}</span>
          <span className="text-xs font-normal text-text-muted">({formatXp(progress.xpTotal)} XP total)</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        <span className="text-xs font-medium text-text-sub whitespace-nowrap">
          {formatXp(progress.intoLevel)} / {formatXp(progress.needed)} XP
        </span>
      </div>
      
      <p className="text-xs font-normal text-text-muted leading-tight">
        {formatXp(progress.remaining)} XP jusqu'au niveau {progress.level + 1}
      </p>
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left"
        type="button"
      >
        {content}
      </button>
    );
  }

  return content;
}

/**
 * Compact level badge (for user lists)
 */
export function LevelBadge({ xpTotal, className = '' }: { xpTotal: number; className?: string }) {
  const level = getLevelProgress(xpTotal).level;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-surface-2 text-text-main ${className}`}
    >
      Lvl {level}
    </span>
  );
}

