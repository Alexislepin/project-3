import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Target, Calendar, Flame, Plus, X } from 'lucide-react';
import { checkDailyGoals, checkWeeklyGoals, type DailyGoalStatus } from '../utils/goalNotifications';
import { AppHeader } from '../components/AppHeader';

export function Insights() {
  const [goals, setGoals] = useState<any[]>([]);
  const [weeklyStats, setWeeklyStats] = useState({ pages: 0, activities: 0, hours: 0 });
  const [todayStats, setTodayStats] = useState({ pages: 0, minutes: 0 });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [calendarData, setCalendarData] = useState<{ [key: string]: boolean }>({});
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalType, setNewGoalType] = useState<string>('daily_15min');
  const [newGoalValue, setNewGoalValue] = useState<string>('15');
  const { user } = useAuth();

  useEffect(() => {
    loadGoals();
    loadWeeklyStats();
    loadTodayStats();
    loadProfile();
    loadCalendarData();
  }, [user]);

  const loadGoals = async () => {
    if (!user) return;

    // Load goals from user_goals table
    const { data: dbGoals, error } = await supabase
      .from('user_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[loadGoals] Error:', error);
      return;
    }

    // Calculate current values for each goal
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.toISOString();

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek.toISOString();

    // Get today's and week's activities
    const { data: todayActivities } = await supabase
      .from('activities')
      .select('pages_read, duration_minutes, type')
      .eq('user_id', user.id)
      .gte('created_at', todayStart);

    const { data: weekActivities } = await supabase
      .from('activities')
      .select('pages_read, duration_minutes, type')
      .eq('user_id', user.id)
      .gte('created_at', weekStart);

    const todayPages = todayActivities?.reduce((sum, a) => sum + (a.pages_read || 0), 0) || 0;
    const todayMinutes = todayActivities?.reduce((sum, a) => sum + (a.duration_minutes || 0), 0) || 0;
    const weekPages = weekActivities?.reduce((sum, a) => sum + (a.pages_read || 0), 0) || 0;
    const weekWorkouts = weekActivities?.filter(a => a.type === 'workout').length || 0;
    const weekBooks = weekActivities?.filter(a => a.type === 'reading' && a.pages_read > 0).length || 0;

    const goalsWithProgress = (dbGoals || []).map((goal) => {
      let current_value = 0;
      if (goal.period === 'daily') {
        if (goal.type === 'daily_pages') {
          current_value = todayPages;
        } else if (goal.type === 'daily_time' || goal.type === 'daily_15min' || goal.type === 'daily_30min' || goal.type === 'daily_60min') {
          current_value = todayMinutes;
        }
      } else if (goal.period === 'weekly') {
        if (goal.type === 'weekly_pages') {
          current_value = weekPages;
        } else if (goal.type === 'weekly_workouts') {
          current_value = weekWorkouts;
        } else if (goal.type === 'weekly_books') {
          current_value = weekBooks;
        }
      }
      return {
        ...goal,
        current_value,
      };
    });

    setGoals(goalsWithProgress);
  };

  const loadWeeklyStats = async () => {
    if (!user) return;

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const { data: activities } = await supabase
      .from('activities')
      .select('pages_read, duration_minutes')
      .eq('user_id', user.id)
      .gte('created_at', startOfWeek.toISOString());

    if (activities) {
      const totalPages = activities.reduce((sum, a) => sum + (a.pages_read || 0), 0);
      const totalMinutes = activities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);

      setWeeklyStats({
        pages: totalPages,
        activities: activities.length,
        hours: Math.floor(totalMinutes / 60),
      });
    }

    setLoading(false);
  };

  const loadTodayStats = async () => {
    if (!user) return;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.toISOString();

    const { data: activities } = await supabase
      .from('activities')
      .select('pages_read, duration_minutes')
      .eq('user_id', user.id)
      .gte('created_at', todayStart);

    if (activities) {
      const totalPages = activities.reduce((sum, a) => sum + (a.pages_read || 0), 0);
      const totalMinutes = activities.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
      setTodayStats({ pages: totalPages, minutes: totalMinutes });
    }
  };

  const loadProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('current_streak, longest_streak')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setProfile(data);
    }
  };

  const loadCalendarData = async () => {
    if (!user) return;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: activities } = await supabase
      .from('activities')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', startOfMonth.toISOString());

    const activityMap: { [key: string]: boolean } = {};
    activities?.forEach((activity) => {
      const date = new Date(activity.created_at);
      const dateKey = date.toISOString().split('T')[0];
      activityMap[dateKey] = true;
    });

    setCalendarData(activityMap);
  };

  const handleAddGoal = async () => {
    if (!user) return;

    const goalType = newGoalType;
    const targetValue = parseInt(newGoalValue) || 15;
    let period: 'daily' | 'weekly' = 'daily';
    let finalType = goalType;

    // Determine period and adjust type if needed
    if (goalType.startsWith('daily_')) {
      period = 'daily';
      if (goalType === 'daily_15min') {
        finalType = 'daily_15min';
      } else if (goalType === 'daily_30min') {
        finalType = 'daily_30min';
      } else if (goalType === 'daily_60min') {
        finalType = 'daily_60min';
      } else if (goalType === 'daily_time') {
        finalType = 'daily_time';
      } else if (goalType === 'daily_pages') {
        finalType = 'daily_pages';
      }
    } else if (goalType.startsWith('weekly_')) {
      period = 'weekly';
      finalType = goalType;
    }

    const { error } = await supabase
      .from('user_goals')
      .insert({
        user_id: user.id,
        type: finalType,
        target_value: targetValue,
        period: period,
        active: true,
      });

    if (error) {
      console.error('[handleAddGoal] Error:', error);
      return;
    }

    setShowAddGoal(false);
    setNewGoalType('daily_15min');
    setNewGoalValue('15');
    loadGoals();
  };

  const handleToggleGoal = async (goalId: string, currentActive: boolean) => {
    if (!user) return;

    const { error } = await supabase
      .from('user_goals')
      .update({ active: !currentActive })
      .eq('id', goalId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[handleToggleGoal] Error:', error);
      return;
    }

    loadGoals();
  };

  const getGoalLabel = (type: string) => {
    const labels: Record<string, string> = {
      daily_pages: 'Pages quotidiennes',
      weekly_workouts: 'Entraînements hebdomadaires',
      daily_time: 'Temps quotidien',
      weekly_books: 'Livres hebdomadaires',
      weekly_pages: 'Pages hebdomadaires',
      daily_15min: 'Lire 15 minutes par jour',
      daily_60min: 'Lire 60 minutes par jour',
      daily_30min: 'Lire 30 minutes par jour',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getGoalUnit = (type: string) => {
    if (type.includes('min')) return 'min';
    if (type.includes('pages')) return 'pages';
    if (type.includes('books')) return 'books';
    return '';
  };

  const generateCalendarDays = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  };

  const isActivityDay = (day: number | null) => {
    if (!day) return false;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return calendarData[dateStr] || false;
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const now = new Date();
    return day === now.getDate();
  };

  const isFutureDay = (day: number | null) => {
    if (!day) return false;
    const now = new Date();
    return day > now.getDate();
  };

  const monthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto">
        <AppHeader title="Votre élan" />
        
        <div className="px-4 py-6" style={{ paddingBottom: 'calc(16px + var(--sab))' }}>

        <div className="relative overflow-hidden rounded-2xl bg-card-light border border-gray-200 shadow-sm p-6 mb-8">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"></div>
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl"></div>
              <Flame className="relative z-10 w-16 h-16 text-primary drop-shadow-sm fill-primary" />
            </div>
            <div className="space-y-1">
              <h1 className="text-5xl font-bold tracking-tighter text-text-main-light">
                {profile?.current_streak || 0}
              </h1>
              <p className="text-sm font-bold uppercase tracking-wider text-text-sub-light">
                Jours de série
              </p>
              {profile?.longest_streak > 0 && (
                <p className="text-xs text-text-sub-light mt-1">
                  Record: {profile.longest_streak} jours
                </p>
              )}
            </div>
            <div className="mt-2 rounded-full bg-primary/20 px-4 py-1.5">
              <p className="text-xs font-semibold text-text-main-light">
                {profile?.current_streak > 0 ? 'Continuez comme ça !' : 'Commencez votre série aujourd\'hui'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[22px] font-bold tracking-tight text-text-main-light">Objectifs quotidiens</h2>
            <button
              onClick={() => setShowAddGoal(true)}
              className="p-2 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-4 h-4 text-text-main-light" />
            </button>
          </div>
          {showAddGoal && (
            <div className="rounded-2xl bg-card-light border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-text-main-light">Nouvel objectif</h3>
                <button
                  onClick={() => setShowAddGoal(false)}
                  className="p-1 hover:bg-gray-100 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text-sub-light mb-1">Type</label>
                  <select
                    value={newGoalType}
                    onChange={(e) => setNewGoalType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white"
                  >
                    <option value="daily_15min">Lire 15 minutes par jour</option>
                    <option value="daily_30min">Lire 30 minutes par jour</option>
                    <option value="daily_60min">Lire 60 minutes par jour</option>
                    <option value="daily_time">Temps quotidien (personnalisé)</option>
                    <option value="daily_pages">Pages quotidiennes</option>
                    <option value="weekly_pages">Pages hebdomadaires</option>
                    <option value="weekly_workouts">Entraînements hebdomadaires</option>
                    <option value="weekly_books">Livres hebdomadaires</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-sub-light mb-1">Valeur cible</label>
                  <input
                    type="number"
                    value={newGoalValue}
                    onChange={(e) => setNewGoalValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white"
                    min="1"
                  />
                </div>
                <button
                  onClick={handleAddGoal}
                  className="w-full py-2 bg-primary text-black font-bold rounded-lg hover:brightness-95 transition-colors"
                >
                  Ajouter
                </button>
              </div>
            </div>
          )}
          {goals.filter(g => g.period === 'daily').length > 0 && (
            <>
              {goals.filter(g => g.period === 'daily').map((goal) => {
                const progress = Math.min((goal.current_value / goal.target_value) * 100, 100);
                const unit = getGoalUnit(goal.type);
                const remaining = Math.max(0, goal.target_value - goal.current_value);

                return (
                  <div key={goal.id} className="rounded-2xl bg-card-light border border-gray-200 p-5 shadow-sm">
                    <div className="mb-3 flex items-end justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-text-sub-light" />
                        <span className="font-medium">{getGoalLabel(goal.type)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-text-sub-light">
                          {goal.current_value} / {goal.target_value} {unit}
                        </span>
                        <button
                          onClick={() => handleToggleGoal(goal.id, goal.active)}
                          className="p-1 hover:bg-gray-100 rounded-full"
                          title={goal.active ? 'Désactiver' : 'Activer'}
                        >
                          <X className="w-3 h-3 text-text-sub-light" />
                        </button>
                      </div>
                    </div>
                    <div className="relative h-4 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-right text-xs text-text-sub-light">
                      {progress >= 100 ? 'Objectif atteint !' : `Encore ${remaining} ${unit}`}
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {goals.filter(g => g.period === 'weekly').length > 0 && (
          <div className="flex flex-col gap-4 mb-8">
            <h2 className="text-[22px] font-bold tracking-tight text-text-main-light px-1">Objectifs hebdomadaires</h2>
            {goals.filter(g => g.period === 'weekly').map((goal) => {
              const progress = Math.min((goal.current_value / goal.target_value) * 100, 100);
              const unit = getGoalUnit(goal.type);
              const remaining = Math.max(0, goal.target_value - goal.current_value);

              return (
                <div key={goal.id} className="rounded-2xl bg-card-light border border-gray-200 p-5 shadow-sm">
                  <div className="mb-3 flex items-end justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-text-sub-light" />
                      <span className="font-medium">{getGoalLabel(goal.type)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-sub-light">
                        {goal.current_value} / {goal.target_value} {unit}
                      </span>
                      <button
                        onClick={() => handleToggleGoal(goal.id, goal.active)}
                        className="p-1 hover:bg-gray-100 rounded-full"
                        title={goal.active ? 'Désactiver' : 'Activer'}
                      >
                        <X className="w-3 h-3 text-text-sub-light" />
                      </button>
                    </div>
                  </div>
                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-right text-xs text-text-sub-light">
                    {progress >= 100 ? 'Objectif atteint !' : `Encore ${remaining} ${unit}`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[22px] font-bold tracking-tight text-text-main-light">Régularité</h2>
            <span className="text-sm font-medium text-text-sub-light">{monthName}</span>
          </div>
          <div className="rounded-2xl bg-card-light border border-gray-200 p-5 shadow-sm">
            <div className="mb-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-text-sub-light">
              <div>S</div>
              <div>M</div>
              <div>T</div>
              <div>W</div>
              <div>T</div>
              <div>F</div>
              <div>S</div>
            </div>
            <div className="grid grid-cols-7 gap-y-3 gap-x-1 justify-items-center">
              {generateCalendarDays().map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="w-8 h-8"></div>;
                }

                const isActive = isActivityDay(day);
                const today = isToday(day);
                const future = isFutureDay(day);

                return (
                  <div
                    key={day}
                    className={`flex w-8 h-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isActive
                        ? today
                          ? 'bg-primary text-black shadow-sm ring-2 ring-background-light ring-offset-2 ring-offset-primary'
                          : 'bg-primary text-black shadow-sm'
                        : future
                        ? 'bg-gray-100 text-text-sub-light opacity-40'
                        : 'bg-gray-100 text-text-sub-light'
                    }`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-card-light rounded-2xl p-6 text-center shadow-sm border border-gray-200 relative overflow-hidden mb-8">
          <div className="absolute left-4 top-4 text-4xl text-gray-100">
            <span className="transform scale-x-[-1] inline-block">&ldquo;</span>
          </div>
          <p className="relative z-10 text-lg font-medium italic leading-relaxed text-text-main-light">
            La discipline est le pont entre les objectifs et la réussite.
          </p>
          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-text-sub-light">
            — Jim Rohn
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Cette semaine
          </h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-stone-900 mb-1">{weeklyStats.activities}</div>
              <div className="text-sm text-stone-600">Activités</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-stone-900 mb-1">{weeklyStats.pages}</div>
              <div className="text-sm text-stone-600">Pages lues</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-stone-900 mb-1">{weeklyStats.hours}h</div>
              <div className="text-sm text-stone-600">Temps total</div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
