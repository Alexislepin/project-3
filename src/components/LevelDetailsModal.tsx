import { X, BookOpen, Target, Zap, TrendingUp } from 'lucide-react';
import { getLevelProgress, formatXp } from '../lib/leveling';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { computeStreakFromActivities } from '../lib/readingStreak';

interface LevelDetailsModalProps {
  onClose: () => void;
}

// Streak milestones (must match what's displayed in "Régularité (Streak)" section)
const STREAK_MILESTONES = [
  { days: 2, xp: 5 },
  { days: 5, xp: 15 },
  { days: 10, xp: 30 },
  { days: 30, xp: 100 },
];

export function LevelDetailsModal({ onClose }: LevelDetailsModalProps) {
  const { profile, profile: contextProfile, user } = useAuth();
  const { resolved: theme } = useTheme();
  // Use freshest xp_total (local profile state updated by xp-updated event)
  const xpTotal = (profile?.xp_total ?? contextProfile?.xp_total) || 0;
  const progress = getLevelProgress(xpTotal);
  const isDark = theme === 'dark';
  
  // Streak state
  const [currentStreak, setCurrentStreak] = useState<number | null>(null);

  // Calculate next streak milestone
  const getNextStreakMilestone = (streak: number | null) => {
    if (streak === null) return null;
    // Find first milestone where milestone.days > currentStreak
    const next = STREAK_MILESTONES.find(m => m.days > streak);
    return next || null; // null if all milestones reached
  };

  const nextStreakMilestone = getNextStreakMilestone(currentStreak);

  // Load streak from activities
  useEffect(() => {
    if (!user) return;

    const loadStreak = async () => {
      try {
        const { data: activities } = await supabase
          .from('activities')
          .select('created_at, pages_read, duration_minutes, type')
          .eq('user_id', user.id)
          .eq('type', 'reading')
          .order('created_at', { ascending: false })
          .limit(100);

        if (activities) {
          const streak = computeStreakFromActivities(activities);
          setCurrentStreak(streak);
        } else {
          setCurrentStreak(null);
        }
      } catch (error) {
        console.error('[LevelDetailsModal] Error loading streak:', error);
        setCurrentStreak(null);
      }
    };

    loadStreak();
  }, [user]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-[100]" onClick={onClose}>
      <div
        className={`${isDark ? 'bg-[rgba(22,22,24,1)]' : 'bg-white'} rounded-t-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex-shrink-0 px-6 py-4 flex items-center justify-between rounded-t-3xl ${
            isDark ? 'bg-[rgba(22,22,24,1)] border-b border-stone-700 text-[var(--tw-ring-offset-color)]' : 'bg-white border-b border-stone-200'
          }`}
        >
          <h2 className={`text-xl font-bold ${isDark ? 'text-[var(--tw-ring-offset-color)]' : ''}`}>Mon niveau</h2>
          <button
            onClick={onClose}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              isDark ? 'hover:bg-white/10 text-[var(--tw-ring-offset-color)]' : 'hover:bg-stone-100'
            }`}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-[116px]">
          {/* Next Milestones Section */}
          <div className="mb-6">
            <h3
              className={`text-sm font-semibold ${
                isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-700'
              } mb-3`}
            >
              Prochains paliers
            </h3>
            <div className="space-y-2">
              <div className="bg-gradient-to-br from-blue-100 via-blue-200 to-blue-300 rounded-lg p-3 border border-blue-300 shadow-none">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm ${isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-700'}`}
                  >
                    Prochain niveau
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-900'
                    }`}
                  >
                    Niv. {progress.level + 1} dans {formatXp(progress.remaining)} XP
                  </span>
                </div>
              </div>
              {nextStreakMilestone && (
                <div
                  className="rounded-lg p-3 bg-[rgba(231,255,11,1)] shadow-none border-0"
                  style={{ background: 'unset', backgroundColor: 'rgba(231, 255, 11, 1)' }}
                >
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
                <div
                  className="rounded-lg p-3 bg-[rgba(231,255,11,1)] shadow-none border-0"
                  style={{ background: 'unset', backgroundColor: 'rgba(231, 255, 11, 1)' }}
                >
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
            <div
              className={`rounded-2xl p-6 ${
                isDark ? 'bg-[rgba(22,22,24,1)]' : 'bg-stone-50 border border-stone-200'
              }`}
            >
              <div className="text-center mb-4">
                <div
                  className={`text-4xl font-bold mb-1 ${
                    isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-900'
                  }`}
                >
                  Niveau {progress.level}
                </div>
                <div className={`text-sm ${isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-600'}`}>
                  {formatXp(xpTotal)} XP total
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="mb-4">
                <div
                  className={`flex items-center justify-between text-xs mb-2 ${
                    isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-600'
                  }`}
                >
                  <span>{formatXp(progress.intoLevel)} XP</span>
                  <span>{formatXp(progress.needed)} XP</span>
                </div>
                <div className="h-3 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
                <div
                  className={`text-center text-xs mt-2 mb-3 ${
                    isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-500'
                  }`}
                >
                  {formatXp(progress.remaining)} XP jusqu'au niveau {progress.level + 1}
                </div>
              </div>
              
            </div>
          </div>

          {/* XP Sources Section */}
          <div id="xp-sources-section" className="mb-6">
            <h3
              className={`text-lg font-bold ${
                isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-900'
              } mb-4`}
            >
              Gagner de l'XP
            </h3>
            
            <div className="space-y-4">
              {/* Reading XP */}
              <div
                className="bg-gradient-to-br from-blue-100 via-blue-200 to-blue-300 rounded-xl p-4 border-0 shadow-none"
                style={{
                  backgroundColor: 'rgba(0, 85, 255, 0.1)',
                  border: '0 none rgba(0, 0, 0, 0)',
                  borderImage: 'none',
                  boxShadow: 'none',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <BookOpen
                      className="w-5 h-5 text-blue-800"
                      style={isDark ? { color: 'rgba(0, 0, 255, 1)' } : undefined}
                    />
                  </div>
                  <div className="flex-1">
                    <h4
                      className={`font-semibold mb-1 ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-900'
                      }`}
                    >
                      Lecture
                    </h4>
                    <p
                      className={`text-sm mb-2 ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-700'
                      }`}
                    >
                      Lis au moins 5 minutes : chaque session compte.
                    </p>
                    <ul
                      className={`text-xs space-y-1 ml-4 list-disc ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-600'
                      }`}
                    >
                      <li>XP session ≈ 10 × log₁₀(1 + minutes)</li>
                      <li>Bonus pages : +1 XP / 10 pages (max +5 XP)</li>
                      <li>Plafond : 40 XP / jour</li>
                    </ul>
                    <div
                      className={`mt-2 text-xs ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-500'
                      }`}
                    >
                      Exemples : 10 min ≈ 10 XP • 30 min ≈ 15 XP • 60 min ≈ 18 XP
                    </div>
                  </div>
                </div>
              </div>

              {/* Streak XP */}
              <div
                className="rounded-xl p-4 shadow-[0_10px_30px_rgba(249,115,22,0.18)]"
                style={{
                  background: 'unset',
                  backgroundColor: 'rgba(231, 255, 11, 1)',
                  backgroundImage: 'none',
                  borderColor: 'rgba(0, 0, 0, 0)',
                  borderImage: 'none',
                  borderWidth: 0,
                  borderStyle: 'none',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <TrendingUp className="w-5 h-5" style={{ color: 'rgba(0, 0, 0, 1)' }} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1 text-[rgb(22,22,24)]">
                      Régularité (Streak)
                    </h4>
                    <p className="text-sm mb-2 text-[rgb(22,22,24)]">
                      Bonus unique à chaque palier de jours consécutifs.
                    </p>
                    <ul className="text-xs space-y-1 ml-4 list-disc text-[rgb(22,22,24)]">
                      <li>2 jours consécutifs → +5 XP</li>
                      <li>5 jours → +15 XP</li>
                      <li>10 jours → +30 XP</li>
                      <li>30 jours → +100 XP</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Goals XP */}
              <div
                className="bg-gradient-to-br from-emerald-100 via-emerald-200 to-emerald-300 rounded-xl p-4 shadow-none"
                style={{
                  backgroundColor: 'rgba(30, 255, 0, 0.1)',
                  borderWidth: 0,
                  borderColor: 'rgba(0, 0, 0, 0)',
                  borderStyle: 'none',
                  borderImage: 'none',
                  boxShadow: 'none',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <Target className="w-5 h-5 text-emerald-800" style={{ color: 'rgba(59, 193, 1, 1)' }} />
                  </div>
                  <div className="flex-1">
                    <h4
                      className={`font-semibold mb-1 ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-900'
                      }`}
                    >
                      Objectifs
                    </h4>
                    <p
                      className={`text-sm mb-2 ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-700'
                      }`}
                    >
                      Atteignez vos objectifs pour gagner de l'XP.
                    </p>
                    <ul
                      className={`text-xs space-y-1 ml-4 list-disc ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-600'
                      }`}
                    >
                      <li>Objectif journalier atteint → +10 XP</li>
                      <li>Objectif hebdomadaire atteint → +30 XP</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Challenges XP */}
              <div
                className="bg-gradient-to-br from-purple-100 via-purple-200 to-purple-300 rounded-xl p-4"
                style={{
                  backgroundColor: 'rgba(153, 0, 255, 0.1)',
                  borderWidth: 0,
                  borderColor: 'rgba(0, 0, 0, 0)',
                  borderStyle: 'none',
                  borderImage: 'none',
                  boxShadow: 'none',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500/15 flex items-center justify-center flex-shrink-0 shadow-inner">
                    <Zap className="w-5 h-5 text-purple-800" style={{ color: 'rgba(162, 0, 250, 1)' }} />
                  </div>
                  <div className="flex-1">
                    <h4
                      className={`font-semibold mb-1 ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-900'
                      }`}
                    >
                      Défis (Recap)
                    </h4>
                    <p
                      className={`text-sm mb-2 ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-700'
                      }`}
                    >
                      Répondez aux questions après vos sessions de lecture.
                    </p>
                    <ul
                      className={`text-xs space-y-1 ml-4 list-disc ${
                        isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-600'
                      }`}
                    >
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
            <h3
              className={`text-lg font-bold ${
                isDark ? 'text-[var(--tw-ring-offset-color)]' : 'text-stone-900'
              } mb-4`}
            >
              Avantages par niveau
            </h3>
            <div className="space-y-3">
              <div
                className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? '' : 'bg-stone-50'}`}
                style={
                  isDark
                    ? {
                        background: 'unset',
                        backgroundColor: 'rgba(23, 23, 24, 1)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(231, 255, 11, 1)',
                      }
                    : undefined
                }
              >
                <div
                  className={`text-sm font-semibold ${
                    isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-700'
                  } w-12 shrink-0`}
                >
                  Niv. 1
                </div>
                <div className={`text-sm ${isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-600'}`}>
                  Accès complet à l'app • XP et niveaux visibles
                </div>
              </div>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? '' : 'bg-stone-50'}`}
                style={
                  isDark
                    ? {
                        background: 'unset',
                        backgroundColor: 'rgba(23, 23, 24, 1)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(231, 255, 11, 1)',
                      }
                    : undefined
                }
              >
                <div
                  className={`text-sm font-semibold ${
                    isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-700'
                  } w-12 shrink-0`}
                >
                  Niv. 3
                </div>
                <div className={`text-sm ${isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-600'}`}>
                  Badge "Lecteur actif" • Animations spéciales
                </div>
              </div>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? '' : 'bg-stone-50'}`}
                style={
                  isDark
                    ? {
                        background: 'unset',
                        backgroundColor: 'rgba(23, 23, 24, 1)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(231, 255, 11, 1)',
                      }
                    : undefined
                }
              >
                <div
                  className={`text-sm font-semibold ${
                    isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-700'
                  } w-12 shrink-0`}
                >
                  Niv. 5
                </div>
                <div className={`text-sm ${isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-600'}`}>
                  Statistiques avancées • Mini graphiques
                </div>
              </div>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? '' : 'bg-stone-50'}`}
                style={
                  isDark
                    ? {
                        background: 'unset',
                        backgroundColor: 'rgba(23, 23, 24, 1)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(231, 255, 11, 1)',
                      }
                    : undefined
                }
              >
                <div
                  className={`text-sm font-semibold ${
                    isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-700'
                  } w-12 shrink-0`}
                >
                  Niv. 7
                </div>
                <div className={`text-sm ${isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-600'}`}>
                  Personnalisation • Emoji de profil • Couleur
                </div>
              </div>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? '' : 'bg-stone-50'}`}
                style={
                  isDark
                    ? {
                        background: 'unset',
                        backgroundColor: 'rgba(23, 23, 24, 1)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(231, 255, 11, 1)',
                      }
                    : undefined
                }
              >
                <div
                  className={`text-sm font-semibold ${
                    isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-700'
                  } w-12 shrink-0`}
                >
                  Niv. 10
                </div>
                <div className={`text-sm ${isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-600'}`}>
                  Comparaison avec amis • Défis amicaux
                </div>
              </div>
              <div
                className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? '' : 'bg-stone-50'}`}
                style={
                  isDark
                    ? {
                        background: 'unset',
                        backgroundColor: 'rgba(23, 23, 24, 1)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(231, 255, 11, 1)',
                      }
                    : undefined
                }
              >
                <div
                  className={`text-sm font-semibold ${
                    isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-700'
                  } w-12 shrink-0`}
                >
                  Niv. 20
                </div>
                <div className={`text-sm ${isDark ? 'text-[rgba(231,255,11,1)]' : 'text-stone-600'}`}>
                  Badge "Elite Reader" • Export stats • Icône spéciale
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}