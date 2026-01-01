import { X, Trophy, Star, BarChart3, Palette, Users, Zap, Award } from 'lucide-react';
import { getLevelProgress, getXpRequiredForLevel, getLevelFromXp } from '../lib/leveling';
import { useAuth } from '../contexts/AuthContext';

interface LevelDetailsModalProps {
  onClose: () => void;
}

interface LevelBonus {
  level: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const LEVEL_BONUSES: LevelBonus[] = [
  {
    level: 1,
    title: 'Accès complet',
    description: 'Accès à toutes les fonctionnalités de l\'app',
    icon: <Trophy className="w-5 h-5" />,
  },
  {
    level: 3,
    title: 'Feedback & motivation',
    description: 'Badge "Lecteur actif", animations spéciales, messages de progression',
    icon: <Star className="w-5 h-5" />,
  },
  {
    level: 5,
    title: 'Stats enrichies',
    description: 'Statistiques avancées, temps moyen par session, meilleure journée, mini graphiques',
    icon: <BarChart3 className="w-5 h-5" />,
  },
  {
    level: 7,
    title: 'Personnalisation',
    description: 'Emoji ou titre de lecteur, couleur de profil, badge visible',
    icon: <Palette className="w-5 h-5" />,
  },
  {
    level: 10,
    title: 'Social amélioré',
    description: 'Comparaison avec amis, mise en avant dans le feed, défis amicaux',
    icon: <Users className="w-5 h-5" />,
  },
  {
    level: 15,
    title: 'Power user',
    description: 'Objectifs personnalisés, rappels intelligents, historique enrichi avec filtres',
    icon: <Zap className="w-5 h-5" />,
  },
  {
    level: 20,
    title: 'Prestige (Elite Reader)',
    description: 'Badge "Elite Reader", classement Elite, export stats mensuelles, icône spéciale',
    icon: <Award className="w-5 h-5" />,
  },
];

export function LevelDetailsModal({ onClose }: LevelDetailsModalProps) {
  const { profile } = useAuth();
  const xpTotal = profile?.xp_total || 0;
  const progress = getLevelProgress(xpTotal);
  const currentLevel = progress.level;
  const nextLevelXp = getXpRequiredForLevel(currentLevel + 1);

  // Get unlocked and upcoming bonuses
  const unlockedBonuses = LEVEL_BONUSES.filter(b => currentLevel >= b.level);
  const upcomingBonuses = LEVEL_BONUSES.filter(b => currentLevel < b.level);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-600" />
            <h2 className="text-xl font-bold">Mon niveau</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Current Level Display */}
          <div className="mb-6">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-stone-900">Niveau {currentLevel}</span>
              <span className="text-lg text-stone-600">({xpTotal.toLocaleString()} XP)</span>
            </div>
            
            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-stone-600 mb-1">
                <span>{progress.currentXpInLevel.toLocaleString()} / {progress.requiredForNext.toLocaleString()} XP</span>
                <span>{Math.round(progress.percent)}%</span>
              </div>
              <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-stone-500 mt-1">
                {nextLevelXp - xpTotal > 0 
                  ? `${(nextLevelXp - xpTotal).toLocaleString()} XP jusqu'au niveau ${currentLevel + 1}`
                  : 'Niveau maximum atteint !'}
              </p>
            </div>
          </div>

          {/* Unlocked Bonuses */}
          {unlockedBonuses.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
                Bonus débloqués
              </h3>
              <div className="space-y-2">
                {unlockedBonuses.map((bonus) => (
                  <div
                    key={bonus.level}
                    className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg"
                  >
                    <div className="text-amber-600 mt-0.5">{bonus.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-stone-900">{bonus.title}</span>
                        <span className="text-xs text-stone-500">Niveau {bonus.level}</span>
                      </div>
                      <p className="text-sm text-stone-600">{bonus.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Bonuses */}
          {upcomingBonuses.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-3">
                Prochains bonus
              </h3>
              <div className="space-y-2">
                {upcomingBonuses.map((bonus) => {
                  const xpNeeded = getXpRequiredForLevel(bonus.level);
                  const xpRemaining = Math.max(0, xpNeeded - xpTotal);
                  
                  return (
                    <div
                      key={bonus.level}
                      className="flex items-start gap-3 p-3 bg-stone-50 border border-stone-200 rounded-lg opacity-75"
                    >
                      <div className="text-stone-400 mt-0.5">{bonus.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-stone-700">{bonus.title}</span>
                          <span className="text-xs text-stone-500">Niveau {bonus.level}</span>
                        </div>
                        <p className="text-sm text-stone-600 mb-1">{bonus.description}</p>
                        <p className="text-xs text-stone-500">
                          {xpRemaining > 0 
                            ? `${xpRemaining.toLocaleString()} XP restants`
                            : 'Débloqué !'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

