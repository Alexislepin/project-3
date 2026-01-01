import { X, BookOpen, Target, Zap, TrendingUp } from 'lucide-react';
import { getLevelProgress, formatXp } from '../lib/leveling';
import { useAuth } from '../contexts/AuthContext';

interface LevelDetailsModalProps {
  onClose: () => void;
}

export function LevelDetailsModal({ onClose }: LevelDetailsModalProps) {
  const { profile, profile: contextProfile } = useAuth();
  // Use freshest xp_total (local profile state updated by xp-updated event)
  const xpTotal = (profile?.xp_total ?? contextProfile?.xp_total) || 0;
  const progress = getLevelProgress(xpTotal);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Mon niveau</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Next Milestones Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-stone-700 mb-3">Prochains paliers</h3>
            <div className="space-y-2">
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-700">Prochain niveau</span>
                  <span className="text-sm font-semibold text-stone-900">
                    Niv. {progress.level + 1} dans {formatXp(progress.remaining)} XP
                  </span>
                </div>
              </div>
              {nextStreakMilestone && (
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-700">Prochain palier streak</span>
                    <span className="text-sm font-semibold text-stone-900">
                      {nextStreakMilestone.days} jours (+{nextStreakMilestone.xp} XP)
                      {currentStreak !== null && currentStreak > 0 && (
                        <span className="text-xs text-stone-500 ml-2">
                          ({currentStreak} jour{currentStreak > 1 ? 's' : ''} actuel{currentStreak > 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
              {!nextStreakMilestone && currentStreak !== null && currentStreak >= 30 && (
                <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-700">Streak</span>
                    <span className="text-sm font-semibold text-stone-900">
                      {currentStreak} jours • Tous les paliers atteints ! 🎉
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Current Level Section */}
          <div className="mb-6">
            <div className="bg-stone-50 rounded-2xl p-6 border border-stone-200">
              <div className="text-center mb-4">
                <div className="text-4xl font-bold text-stone-900 mb-1">Niveau {progress.level}</div>
                <div className="text-sm text-stone-600">{formatXp(xpTotal)} XP total</div>
              </div>
              
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-stone-600 mb-2">
                  <span>{formatXp(progress.intoLevel)} XP</span>
                  <span>{formatXp(progress.needed)} XP</span>
                </div>
                <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                <div className="text-center text-xs text-stone-500 mt-2">
                  {formatXp(progress.remaining)} XP jusqu'au niveau {progress.level + 1}
                </div>
              </div>
            </div>
          </div>

          {/* XP Sources Section */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-stone-900 mb-4">Gagner de l'XP</h3>
            
            <div className="space-y-4">
              {/* Reading XP */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-stone-900 mb-1">Lecture</h4>
                    <p className="text-sm text-stone-700 mb-2">
                      Gagnez de l'XP en lisant ! Minimum 5 minutes par session.
                    </p>
                    <ul className="text-xs text-stone-600 space-y-1 ml-4 list-disc">
                      <li>XP = 10 × log₁₀(1 + minutes)</li>
                      <li>Bonus : +1 XP par tranche de 10 pages (max +5 XP)</li>
                      <li>Maximum : 40 XP par jour</li>
                    </ul>
                    <div className="mt-2 text-xs text-stone-500">
                      Exemples : 10 min → ~10 XP • 30 min → ~15 XP • 60 min → ~18 XP
                    </div>
                  </div>
                </div>
              </div>

              {/* Streak XP */}
              <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-stone-900 mb-1">Régularité (Streak)</h4>
                    <p className="text-sm text-stone-700 mb-2">
                      Bonus unique à chaque palier de jours consécutifs.
                    </p>
                    <ul className="text-xs text-stone-600 space-y-1 ml-4 list-disc">
                      <li>2 jours consécutifs → +5 XP</li>
                      <li>5 jours → +15 XP</li>
                      <li>10 jours → +30 XP</li>
                      <li>30 jours → +100 XP</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Goals XP */}
              <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-stone-900 mb-1">Objectifs</h4>
                    <p className="text-sm text-stone-700 mb-2">
                      Atteignez vos objectifs pour gagner de l'XP.
                    </p>
                    <ul className="text-xs text-stone-600 space-y-1 ml-4 list-disc">
                      <li>Objectif journalier atteint → +10 XP</li>
                      <li>Objectif hebdomadaire atteint → +30 XP</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Challenges XP */}
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-stone-900 mb-1">Défis (Recap)</h4>
                    <p className="text-sm text-stone-700 mb-2">
                      Répondez aux questions après vos sessions de lecture.
                    </p>
                    <ul className="text-xs text-stone-600 space-y-1 ml-4 list-disc">
                      <li>Mauvaise réponse → 0 XP</li>
                      <li>Presque → 5 XP</li>
                      <li>Bonne réponse → 10 XP</li>
                      <li>Maximum : 5 défis comptabilisés par jour</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Level Benefits Section */}
          <div>
            <h3 className="text-lg font-bold text-stone-900 mb-4">Avantages par niveau</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="text-sm font-semibold text-stone-700 w-12 shrink-0">Niv. 1</div>
                <div className="text-sm text-stone-600">Accès complet à l'app • XP et niveaux visibles</div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="text-sm font-semibold text-stone-700 w-12 shrink-0">Niv. 3</div>
                <div className="text-sm text-stone-600">Badge "Lecteur actif" • Animations spéciales</div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="text-sm font-semibold text-stone-700 w-12 shrink-0">Niv. 5</div>
                <div className="text-sm text-stone-600">Statistiques avancées • Mini graphiques</div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="text-sm font-semibold text-stone-700 w-12 shrink-0">Niv. 7</div>
                <div className="text-sm text-stone-600">Personnalisation • Emoji de profil • Couleur</div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="text-sm font-semibold text-stone-700 w-12 shrink-0">Niv. 10</div>
                <div className="text-sm text-stone-600">Comparaison avec amis • Défis amicaux</div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg">
                <div className="text-sm font-semibold text-stone-700 w-12 shrink-0">Niv. 20</div>
                <div className="text-sm text-stone-600">Badge "Elite Reader" • Export stats • Icône spéciale</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

