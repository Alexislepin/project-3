import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TrendingUp, Target, Calendar, Flame } from 'lucide-react';
import { checkDailyGoals, checkWeeklyGoals, type DailyGoalStatus } from '../utils/goalNotifications';
import { AppHeader } from '../components/AppHeader';

export function Insights() {
  const [goals, setGoals] = useState<any[]>([]);
  const [weeklyStats, setWeeklyStats] = useState({ pages: 0, activities: 0, hours: 0 });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [calendarData, setCalendarData] = useState<{ [key: string]: boolean }>({});
  const { user } = useAuth();

  useEffect(() => {
    loadGoals();
    loadWeeklyStats();
    loadProfile();
    loadCalendarData();
  }, [user]);

  const loadGoals = async () => {
    if (!user) return;

    const dailyGoals = await checkDailyGoals(user.id);
    const weeklyGoals = await checkWeeklyGoals(user.id);

    const allGoals = [...dailyGoals, ...weeklyGoals].map((g) => ({
      id: g.goalId,
      type: g.goalType,
      target_value: g.targetValue,
      current_value: g.currentValue,
      active: true,
      period: g.goalType.includes('daily') ? 'daily' : 'weekly',
    }));

    setGoals(allGoals);
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

  const loadProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('current_streak')
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
            </div>
            <div className="mt-2 rounded-full bg-primary/20 px-4 py-1.5">
              <p className="text-xs font-semibold text-text-main-light">
                {profile?.current_streak > 0 ? 'Continuez comme ça !' : 'Commencez votre série aujourd\'hui'}
              </p>
            </div>
          </div>
        </div>

        {goals.filter(g => g.period === 'daily').length > 0 && (
          <div className="flex flex-col gap-4 mb-8">
            <h2 className="text-[22px] font-bold tracking-tight text-text-main-light px-1">Objectifs quotidiens</h2>
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
                    <span className="text-sm font-bold text-text-sub-light">
                      {goal.current_value} / {goal.target_value} {unit}
                    </span>
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
                    <span className="text-sm font-bold text-text-sub-light">
                      {goal.current_value} / {goal.target_value} {unit}
                    </span>
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
