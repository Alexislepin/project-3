import { Flame } from 'lucide-react';

export function StreakBadge({
  streak,
  onClick,
}: {
  streak: number;
  onClick?: () => void;
}) {
  const value = Number.isFinite(streak) ? streak : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/80 border border-gray-200 shadow-sm hover:bg-white transition-colors"
      title="Votre série"
    >
      <Flame
        className={`w-4 h-4 ${value > 0 ? 'text-primary fill-primary' : 'text-stone-400'}`}
      />
      <span className={`text-xs font-bold ${value > 0 ? 'text-text-main-light' : 'text-stone-500'}`}>
        {value}
      </span>
    </button>
  );
}

