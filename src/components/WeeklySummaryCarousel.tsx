import { Activity, Clock, BookOpen, Trophy } from 'lucide-react';
import React from 'react';

interface WeeklySummary {
  sessionsCount: number;
  totalMinutes: number;
  totalPages: number;
}

interface Ranking {
  rank: number;
  total: number;
}

interface WeeklySummaryCarouselProps {
  summary: WeeklySummary | null;
  loading?: boolean;
  ranking?: Ranking | null;
  userAvatar?: string | null;
  onOpenActivities?: () => void;
  onOpenTime?: () => void;
  onOpenPages?: () => void;
  onOpenLeaderboard?: () => void;
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle: string;
  bgColor: string;
  accentColor?: string;
  avatar?: string | null;
  iconColor?: string;
  onClick?: () => void;
  bgStyle?: React.CSSProperties;
}

// Helper for pluralization
function pluralize(singular: string, count: number): string {
  return count <= 1 ? singular : `${singular}s`;
}

const SummaryCard = ({
  icon,
  label,
  value,
  subtitle,
  bgColor,
  avatar,
  onClick,
  bgStyle,
  isFirstPlace = false,
}: SummaryCardProps & { iconColor?: string; isFirstPlace?: boolean }) => {
  // Bubble shape: border-radius must be > half the height (66px / 2 = 33px)
  // Using 36px for true pill/bubble effect
  // Width increased for pill shape (wider than tall)
  // Padding uniforme pour espace naturel depuis les bords
  const baseClasses = `min-h-[66px] min-w-[160px] rounded-[36px] ${bgColor} py-4 px-4 flex flex-col transition-all duration-200 relative overflow-hidden ${
    onClick
      ? 'cursor-pointer active:scale-[0.98] active:opacity-90'
      : ''
  }`;

  // Add glow animation for first place
  const glowStyle = isFirstPlace
    ? {
        animation: 'glow 2s ease-in-out infinite',
      }
    : {};

  const content = (
    <>
      {/* Layout fluide: icône et label moins dans les angles */}
      <div className="flex-1 flex flex-col justify-between min-h-0">
        {/* SECTION HAUTE: Icône + Label avec espace depuis les bords */}
        <div className="flex items-start gap-2.5 mb-3">
          {/* Icône avec espace depuis le bord gauche */}
          <div className="flex-shrink-0">
            {icon}
          </div>
          
          {/* Label avec espace depuis l'icône */}
          <div
            className={`text-[9px] font-normal text-muted-2 leading-tight uppercase tracking-wider ${
              label.includes('POSITION') ? 'tracking-[0.05em]' : ''
            }`}
          >
            {label}
          </div>
        </div>

        {/* SECTION BASSE: Valeur principale + Unité avec espace depuis le bord */}
        <div className="flex flex-col items-start">
          <div className="text-[28px] font-semibold leading-none text-text-main-light tracking-tight">
            {value}
          </div>
          <div className="text-[11px] font-normal text-muted leading-tight mt-1">
            {subtitle}
          </div>
        </div>

        {/* Avatar pour classement (si présent, avec espace depuis les bords) */}
        {avatar && (
          <div className="absolute top-4 right-4 w-6 h-6 rounded-full overflow-hidden border border-stone-200/60 flex-shrink-0">
            <img
              src={avatar}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={baseClasses}
        type="button"
        style={{ ...glowStyle, ...bgStyle }}
        onTouchStart={() => {
          // Optional haptic feedback on iOS
          if (typeof window !== 'undefined' && 'Haptics' in window) {
            try {
              // @ts-ignore
              window.Haptics?.impact({ style: 'light' });
            } catch (e) {
              // Ignore
            }
          }
        }}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClasses} style={{ ...glowStyle, ...bgStyle }}>{content}</div>;
};

export function WeeklySummaryCarousel({
  summary,
  loading = false,
  ranking,
  userAvatar,
  onOpenActivities,
  onOpenTime,
  onOpenPages,
  onOpenLeaderboard,
}: WeeklySummaryCarouselProps) {
  if (loading || !summary) {
    return (
      <div className="px-4 mb-4">
        <h2
          className="text-sm font-semibold text-black mb-3"
          style={{ color: 'rgb(var(--color-text))' }}
        >
          Votre résumé hebdomadaire
        </h2>
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 min-w-[160px] min-h-[66px] bg-stone-100 rounded-[36px] animate-pulse snap-start"
            />
          ))}
        </div>
      </div>
    );
  }

  // Calculate ranking display
  const isFirstPlace = ranking?.rank === 1;
  const rankingValue = ranking ? `#${ranking.rank}` : '—';
  const rankingLabel = 'Position hebdomadaire';
  const rankingSubtitle = ranking
    ? ranking.total > 0
      ? `sur ${ranking.total} ${pluralize('lecteur', ranking.total)}`
      : 'Classement bientôt disponible'
    : 'Classement bientôt disponible';

  // Determine if we show 3 or 4 cards
  const showRanking = ranking !== undefined;

  return (
    <div className="px-4 mb-4">
      <h2
        className="text-sm font-semibold text-black mb-2.5"
        style={{ color: 'rgb(var(--color-text))' }}
      >
        Votre résumé hebdomadaire
      </h2>
      <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4">
        <SummaryCard
          icon={
            <Activity
              className="w-3.5 h-3.5"
              style={{ color: 'rgba(0, 64, 255, 1)' }}
            />
          }
          label="Activités"
          value={summary.sessionsCount}
          subtitle="sessions"
          bgColor="bg-blue-50"
          iconColor="bg-blue-100"
          bgStyle={{
            background:
              'linear-gradient(90deg, rgba(51, 93, 219, 0.1) 0%, rgba(111, 188, 235, 0.2) 100%)',
            backgroundColor: 'rgba(1, 64, 255, 0.1)',
            backgroundImage: 'none',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(1, 64, 255, 1)',
            borderImage: 'none',
          }}
          onClick={onOpenActivities}
        />
        <SummaryCard
          icon={
            <Clock
              className="w-3.5 h-3.5"
              style={{ color: 'rgba(109, 9, 129, 1)' }}
            />
          }
          label="Temps"
          value={summary.totalMinutes}
          subtitle="minutes"
          bgColor="bg-violet-50"
          iconColor="bg-violet-100"
          bgStyle={{
            background: 'none',
            backgroundColor: 'rgba(187, 7, 223, 0.1)',
            backgroundImage: 'none',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(173, 15, 204, 1)',
            borderImage: 'none',
          }}
          onClick={onOpenTime}
        />
        <SummaryCard
          icon={
            <BookOpen
              className="w-3.5 h-3.5"
              style={{ color: 'rgba(6, 142, 8, 1)' }}
            />
          }
          label="Pages"
          value={summary.totalPages}
          subtitle="pages lues"
          bgColor="bg-emerald-50"
          iconColor="bg-emerald-100"
          bgStyle={{
            background: 'none',
            backgroundColor: 'rgba(11, 239, 15, 0.1)',
            backgroundImage: 'none',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(15, 142, 17, 1)',
            borderImage: 'none',
          }}
          onClick={onOpenPages}
        />
        {showRanking && (
          <SummaryCard
            icon={<Trophy className="w-3.5 h-3.5 text-amber-600" />}
            label={rankingLabel}
            value={rankingValue}
            subtitle={rankingSubtitle}
            bgColor="bg-amber-50"
            iconColor="bg-amber-100"
          bgStyle={{
            background: 'none',
            backgroundColor: 'rgba(255, 132, 0, 0.1)',
            backgroundImage: 'none',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(217, 119, 15, 1)',
            borderImage: 'none',
          }}
            avatar={userAvatar}
            isFirstPlace={isFirstPlace}
            onClick={onOpenLeaderboard}
          />
        )}
        {/* Spacer pour ne pas couper le dernier */}
        <div className="w-4 shrink-0" />
      </div>
    </div>
  );
}