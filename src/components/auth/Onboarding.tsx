import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Check, Bell, BellOff, Settings } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { 
  checkNotificationPermission, 
  requestNotificationPermission, 
  openSettings as openNotificationSettings,
  type NotificationPermissionStatus 
} from '../../lib/notificationPermission';

// Objectifs temps par jour (minutes)
const TIME_GOALS = [
  { id: 10, label: '10 minutes', description: 'Petit pas quotidien' },
  { id: 20, label: '20 minutes', description: 'Routine équilibrée' },
  { id: 30, label: '30 minutes', description: 'Temps de qualité' },
  { id: 45, label: '45 minutes', description: 'Lecture approfondie' },
  { id: 60, label: '1 heure', description: 'Session complète' },
];

// Objectifs livres par mois
const BOOKS_PER_MONTH_GOALS = [
  { id: 1, label: '1 livre', description: 'Un livre par mois' },
  { id: 2, label: '2 livres', description: 'Deux livres par mois' },
  { id: 3, label: '3 livres', description: 'Trois livres par mois' },
  { id: 4, label: '4+ livres', description: 'Quatre livres ou plus' },
];

// Moments préférés
const READING_TIMES = [
  { id: 'morning', label: 'Matin', description: 'Au réveil ou en début de journée' },
  { id: 'afternoon', label: 'Midi', description: 'Pause déjeuner ou après-midi' },
  { id: 'evening', label: 'Soir', description: 'En fin de journée ou avant de dormir' },
  { id: 'variable', label: 'Variable', description: 'Selon mes disponibilités' },
];

// Genres principaux
const GENRES = [
  { id: 'fiction', label: 'Roman / Fiction', description: 'Romans, romans policiers, science-fiction...' },
  { id: 'non-fiction', label: 'Non-fiction', description: 'Biographies, essais, documentaires...' },
  { id: 'business', label: 'Business', description: 'Management, entrepreneuriat, finance...' },
  { id: 'self-dev', label: 'Développement personnel', description: 'Productivité, bien-être, psychologie...' },
  { id: 'other', label: 'Autre', description: 'Autres genres' },
];

// Niveau actuel
const READING_LEVELS = [
  { id: 'restarting', label: 'Je reprends', description: 'Je veux me remettre à la lecture' },
  { id: 'regular', label: 'Lecteur régulier', description: 'Je lis déjà régulièrement' },
  { id: 'avid', label: 'Gros lecteur', description: 'Je lis beaucoup et souvent' },
];

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Goals state
  const [timeGoal, setTimeGoal] = useState<number | null>(null);
  const [booksPerMonth, setBooksPerMonth] = useState<number | null>(null);
  const [readingTime, setReadingTime] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [readingLevel, setReadingLevel] = useState<string | null>(null);
  
  // Notifications state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus>('not-determined');
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false);
  const { user } = useAuth();

  // Check notification permission on mount
  useEffect(() => {
    checkNotificationPermission().then(setNotificationPermission);
  }, []);

  const handleRequestNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    
    if (permission === 'granted') {
      if (user) {
        await supabase
          .from('user_profiles')
          .update({
            notifications_enabled: true,
            goal_reminder_enabled: true,
            notification_time: '20:00:00',
          })
          .eq('id', user.id);
      }
      // Auto-continue to step 7 after granting
      setTimeout(() => setStep(7), 500);
    } else if (permission === 'denied') {
      setShowSettingsPrompt(true);
    }
  };

  const handleOpenSettings = async () => {
    await openNotificationSettings();
  };

  const handleSkipNotifications = () => {
    // Skip notifications: go directly to final step without requesting permission
    setStep(7);
  };

  const handleComplete = async () => {
    if (!user) return;

    setLoading(true);

    try {
      // Build interests array from genre and other preferences
      const interests: string[] = [];
      if (genre) {
        // Map genre IDs to readable names
        const genreMap: Record<string, string> = {
          'fiction': 'Fiction',
          'non-fiction': 'Non-fiction',
          'business': 'Business',
          'self-dev': 'Développement personnel',
          'other': 'Autre',
        };
        interests.push(genreMap[genre] || genre);
      }
      
      // Add reading level as interest tag
      if (readingLevel) {
        interests.push(`Niveau: ${readingLevel}`);
      }
      
      // Store monthly books goal as interest tag (since monthly_books doesn't exist in schema)
      if (booksPerMonth) {
        interests.push(`goal:${booksPerMonth}_books_month`);
      }

      // Determine notification settings
      const notificationsEnabled = notificationPermission === 'granted';
      const goalReminderEnabled = notificationsEnabled; // Enable if notifications are granted
      const notificationTime = readingTime === 'morning' ? '08:00:00' :
                               readingTime === 'afternoon' ? '13:00:00' :
                               readingTime === 'evening' ? '20:00:00' :
                               '20:00:00'; // Default to 20:00

      // Update user_profiles with interests and notification settings
      await supabase
        .from('user_profiles')
        .update({
          interests: interests.length > 0 ? interests : ['reading'],
          notifications_enabled: notificationsEnabled,
          goal_reminder_enabled: goalReminderEnabled,
          notification_time: notificationTime,
        })
        .eq('id', user.id);

      // Create daily_time goal if timeGoal is set
      if (timeGoal) {
        // Determine goal type based on value
        let goalType: string;
        if (timeGoal === 15) {
          goalType = 'daily_15min';
        } else if (timeGoal === 30) {
          goalType = 'daily_30min';
        } else if (timeGoal === 60) {
          goalType = 'daily_60min';
        } else {
          goalType = 'daily_time';
        }

        await supabase
          .from('user_goals')
          .insert({
            user_id: user.id,
            type: goalType,
            target_value: goalType === 'daily_time' ? timeGoal : (goalType === 'daily_15min' ? 15 : goalType === 'daily_30min' ? 30 : 60),
            period: 'daily',
            active: true,
          });
      }
    } catch (error) {
      console.error('Error saving onboarding data:', error);
    }

    setLoading(false);
    onComplete();
  };

  const canProceed = () => {
    switch (step) {
      case 1: return timeGoal !== null;
      case 2: return booksPerMonth !== null;
      case 3: return readingTime !== null;
      case 4: return genre !== null;
      case 5: return readingLevel !== null;
      default: return true;
    }
  };

  return (
    <div className="h-screen bg-stone-50 flex flex-col overflow-hidden">
      {/* Scrollable content container */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
        }}
      >
        <div className="flex items-center justify-center min-h-full p-4 safe-area-top">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <div className="mb-2">
                <BrandLogo size={40} color="#111" />
              </div>
              <p className="text-stone-600">Bienvenue dans votre parcours de lecture</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 relative">
          {/* Step 1: Objectif temps par jour */}
          {step === 1 && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">Combien de temps par jour ?</h2>
                <p className="text-stone-600">Choisissez votre objectif quotidien de lecture</p>
              </div>

              <div className="space-y-3 mb-8">
                {TIME_GOALS.map((goal) => (
                  <button
                    key={goal.id}
                    onClick={() => setTimeGoal(goal.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      timeGoal === goal.id
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium mb-1">{goal.label}</div>
                        <div className="text-sm text-stone-600">{goal.description}</div>
                      </div>
                      {timeGoal === goal.id && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!canProceed()}
                className="w-full bg-stone-900 text-white py-3 rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
              >
                Continuer
              </button>
            </>
          )}

          {/* Step 2: Objectif livres par mois */}
          {step === 2 && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">Combien de livres par mois ?</h2>
                <p className="text-stone-600">Définissez votre objectif mensuel</p>
              </div>

              <div className="space-y-3 mb-8">
                {BOOKS_PER_MONTH_GOALS.map((goal) => (
                  <button
                    key={goal.id}
                    onClick={() => setBooksPerMonth(goal.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      booksPerMonth === goal.id
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium mb-1">{goal.label}</div>
                        <div className="text-sm text-stone-600">{goal.description}</div>
                      </div>
                      {booksPerMonth === goal.id && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border-2 border-stone-300 text-stone-700 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canProceed()}
                  className="flex-1 bg-stone-900 text-white py-3 rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  Continuer
                </button>
              </div>
            </>
          )}

          {/* Step 3: Moment préféré */}
          {step === 3 && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">Quand préférez-vous lire ?</h2>
                <p className="text-stone-600">Choisissez votre moment de lecture favori</p>
              </div>

              <div className="space-y-3 mb-8">
                {READING_TIMES.map((time) => (
                  <button
                    key={time.id}
                    onClick={() => setReadingTime(time.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      readingTime === time.id
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium mb-1">{time.label}</div>
                        <div className="text-sm text-stone-600">{time.description}</div>
                      </div>
                      {readingTime === time.id && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 border-2 border-stone-300 text-stone-700 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={!canProceed()}
                  className="flex-1 bg-stone-900 text-white py-3 rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  Continuer
                </button>
              </div>
            </>
          )}

          {/* Step 4: Genre principal */}
          {step === 4 && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">Quel genre préférez-vous ?</h2>
                <p className="text-stone-600">Sélectionnez votre genre de lecture principal</p>
              </div>

              <div className="space-y-3 mb-8">
                {GENRES.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGenre(g.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      genre === g.id
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium mb-1">{g.label}</div>
                        <div className="text-sm text-stone-600">{g.description}</div>
                      </div>
                      {genre === g.id && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 border-2 border-stone-300 text-stone-700 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(5)}
                  disabled={!canProceed()}
                  className="flex-1 bg-stone-900 text-white py-3 rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  Continuer
                </button>
              </div>
            </>
          )}

          {/* Step 5: Niveau actuel */}
          {step === 5 && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold mb-2">Quel est votre niveau actuel ?</h2>
                <p className="text-stone-600">Aidez-nous à personnaliser votre expérience</p>
              </div>

              <div className="space-y-3 mb-8">
                {READING_LEVELS.map((level) => (
                  <button
                    key={level.id}
                    onClick={() => setReadingLevel(level.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      readingLevel === level.id
                        ? 'border-primary bg-primary/5'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium mb-1">{level.label}</div>
                        <div className="text-sm text-stone-600">{level.description}</div>
                      </div>
                      {readingLevel === level.id && (
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 border-2 border-stone-300 text-stone-700 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(6)}
                  disabled={!canProceed()}
                  className="flex-1 bg-stone-900 text-white py-3 rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  Continuer
                </button>
              </div>
            </>
          )}

          {/* Step 6: Notifications */}
          {step === 6 && (
            <>
              <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  {notificationPermission === 'granted' ? (
                    <Bell className="w-8 h-8 text-primary" />
                  ) : (
                    <BellOff className="w-8 h-8 text-stone-400" />
                  )}
                </div>
                <h2 className="text-2xl font-semibold mb-2">Restez motivé avec des rappels</h2>
                <p className="text-stone-600 mb-4">
                  Recevez des notifications quotidiennes pour vous rappeler de compléter vos objectifs de lecture
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
                  <p className="text-sm text-blue-800 mb-2 font-medium">
                    Les notifications vous aident à :
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1.5">
                    <li>• Maintenir votre série de lecture quotidienne</li>
                    <li>• Atteindre vos objectifs plus facilement</li>
                    <li>• Rester motivé chaque jour</li>
                  </ul>
                </div>
              </div>

              {showSettingsPrompt && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-sm text-amber-800 mb-3">
                    Les notifications ont été refusées. Pour les activer, ouvrez les Réglages de votre iPhone.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="w-full bg-amber-600 text-white py-2 rounded-lg font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 relative z-10"
                  >
                    <Settings className="w-4 h-4" />
                    Ouvrir Réglages
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-3 relative">
                {notificationPermission !== 'granted' && !showSettingsPrompt && (
                  <button
                    type="button"
                    onClick={handleRequestNotifications}
                    className="w-full bg-primary text-black py-3 rounded-lg font-medium hover:brightness-95 transition-all flex items-center justify-center gap-2 relative z-10"
                  >
                    <Bell className="w-5 h-5" />
                    Activer les notifications
                  </button>
                )}
                {notificationPermission === 'granted' && (
                  <div className="w-full bg-green-50 border border-green-200 text-green-800 py-3 rounded-lg font-medium text-center">
                    ✓ Notifications activées
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSkipNotifications}
                  className="w-full border-2 border-stone-300 text-stone-700 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors relative z-10"
                >
                  {notificationPermission === 'granted' ? 'Continuer' : 'Peut-être plus tard'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="text-sm text-stone-500 hover:text-stone-700 transition-colors mt-2 relative z-10"
                >
                  Retour
                </button>
              </div>
            </>
          )}

          {/* Step 7: Final */}
          {step === 7 && (
            <>
              <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Prêt à commencer !</h2>
                <p className="text-stone-600">
                  Votre profil est configuré. Vous pouvez maintenant commencer votre parcours de lecture.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(6)}
                  className="flex-1 border-2 border-stone-300 text-stone-700 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex-1 bg-stone-900 text-white py-3 rounded-lg font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Configuration...' : 'Commencer'}
                </button>
              </div>
            </>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
