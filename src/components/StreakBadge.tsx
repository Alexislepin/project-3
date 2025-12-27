import { Flame } from 'lucide-react';

interface StreakBadgeProps {
  streak: number;
  onClick: () => void;
}

export function StreakBadge({ streak, onClick }: StreakBadgeProps) {
  if (streak <= 0) return null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 bg-primary px-2 py-1 rounded-full hover:scale-105 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      title="Mon élan"
    >
      <Flame className="w-3.5 h-3.5 text-black animate-flame" />
      <span className="font-semibold text-xs text-black">{streak}</span>
    </button>
  );
}

