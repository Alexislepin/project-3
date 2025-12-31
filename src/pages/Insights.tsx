import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Target, Calendar, Flame, Plus, X, BookOpen, Clock, Trophy } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';

// Date helpers (local timezone)
function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday-start week
function startOfLocalWeek(date = new Date()) {
  const d = startOfLocalDay(date);
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diffToMonday = (day + 6) % 7; // Mon=0, Tue=1 ... Sun=6
  d.setDate(d.getDate() - diffToMonday);
  return d;
}


// Get last 7 days range
function getLast7DaysRange() {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 7);
  return { since, now };
}

// Build weekly bars data (Mon..Sun)
function buildWeeklyBarsData(activities: any[]): number[] {
  const weekData = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun

  for (const a of activities) {
    if (!a.created_at) continue;
    const d = new Date(a.created_at);
    const js = d.getDay(); // Sun=0..Sat=6
    const idx = (js + 6) % 7; // Mon=0..Sun=6
    weekData[idx] += Number(a.pages_read) || 0;
  }

  return weekData;
}

import { computeReadingStats, formatStatValue, formatDuration } from '../lib/readingStats';
import { LevelProgressBar } from '../components/LevelProgressBar';
import { LeaderboardModal } from '../components/LeaderboardModal';
import { UserProfileView } from '../components/UserProfileView';
import { ActivityFocus } from '../lib/activityFocus';
import { computeStreakFromActivities } from '../lib/readingStreak';
import { last7DaysRangeISO } from '../utils/dateUtils';
import { fetchWeeklyActivity, weeklyActivityToPagesArray } from '../lib/weeklyActivity';

export function Insights() {
  const [goals, setGoals] = useState<any[]>([]);
  const [weeklyStats, setWeeklyStats] = useState({ pages: 0, activities: 0, totalMinutes: 0 });
  const [todayStats, setTodayStats] = useState({ pages: 0, minutes: 0 });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [calendarData, setCalendarData] = useState<{ [key: string]: boolean }>({});
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoalType, setNewGoalType] = useState<string>('daily_15min');
  const [newGoalValue, setNewGoalValue] = useState<string>('15');
  
  // Stats 7 jours
  const [stats7d, setStats7d] = useState({
    totalMinutes: 0,
    totalPages: 0,
    speedPph: null as number | null,
    paceMinPerPage: null as number | null,
    hasSessions: false, // Track if there are any reading sessions in 7d
  });
  
  // PR (record)
  const [pr, setPr] = useState({
    speedPph: null as number | null,
    paceMinPerPage: null as number | null,
    hasAnySessions: false, // Track if user has ever had a reading session
  });
  
  // Weekly activity bars (Mon..Sun)
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [weeklyActivityTotalPages, setWeeklyActivityTotalPages] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [streakDays, setStreakDays] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activityFocus, setActivityFocus] = useState<ActivityFocus | null>(null);
  
  const { user, profile: contextProfile, refreshProfile } = useAuth();

  const openLeaderboard = () => setShowLeaderboard(true);
  const closeLeaderboard = () => setShowLeaderboard(false);

  // 1) Load data when user changes
  useEffect(() => {
    if (!user?.id) return;
    loadInsightsData();
    loadStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 2) Listener XP (separate effect, no profile dependency)
  useEffect(() => {
    const handleXpUpdated = async (event: any) => {
      // ✅ Source de vérité unique : refresh depuis DB uniquement
      // ❌ Ne pas modifier le state local directement
      if (user?.id) {
        await refreshProfile(user.id);
      }
    };

    window.addEventListener('xp-updated', handleXpUpdated as EventListener);
    return () => window.removeEventListener('xp-updated', handleXpUpdated as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, refreshProfile]);

  const loadStreak = async () => {
    if (!user) {
      setStreakDays(0);
      return;
    }

    try {
      // Load last 200 reading activities (wide range, we'll filter in local timezone)
      const { data: activities, error } = await supabase
        .from('activities')
        .select('created_at, pages_read, duration_minutes, type, photos')
        .eq('user_id', user.id)
        .eq('type', 'reading')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[loadStreak] Error:', error);
        setStreakDays(0);
        return;
      }

      // Compute streak from activities (local timezone)
      const streak = computeStreakFromActivities(activities || []);
      setStreakDays(streak);

      // Update profile's current_streak
      await supabase
        .from('user_profiles')
        .update({ current_streak: streak })
        .eq('id', user.id);

      // Synchronize local profile state
      setProfile((p: any) => p ? { ...p, current_streak: streak } : { current_streak: streak });
    } catch (error) {
      console.error('[loadStreak] Exception:', error);
      setStreakDays(0);
    }
  };

  const loadInsightsData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    console.log('[STATS] loadInsightsData user', user?.id);

    setLoading(true);

    try {
      // Calculate date boundaries in local timezone
      const today = startOfLocalDay();
      const weekStart = startOfLocalWeek();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      
      // Use the new helper function for last 7 days range (ISO)
      const { start: last7dStartISO, end: last7dEndISO } = last7DaysRangeISO();

      console.log('[STATS] loadInsightsData date ranges', { 
        weekStart: weekStart.toISOString(), 
        last7dStart: last7dStartISO,
        last7dEnd: last7dEndISO 
      });

      const todayKey = toLocalDateKey(today);

      // Fetch all data in parallel
      const [goalsResult, profileResult, weekActivitiesResult, monthActivitiesResult, allReadingActivitiesResult, last7dActivitiesResult, weeklyActivityResult] = await Promise.all([
        supabase
      .from('user_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_profiles')
          .select('longest_streak, xp_total, current_streak')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('activities')
          .select('created_at, pages_read, duration_minutes, type, reading_speed_pph, reading_pace_min_per_page, photos')
          .eq('user_id', user.id)
          .gte('created_at', weekStart.toISOString()),
        supabase
          .from('activities')
          .select('created_at, photos')
          .eq('user_id', user.id)
          .gte('created_at', monthStart.toISOString()),
        supabase
          .from('activities')
          .select('pages_read, duration_minutes, reading_speed_pph, reading_pace_min_per_page, created_at, photos')
          .eq('user_id', user.id)
          .eq('type', 'reading')
          .order('created_at', { ascending: false })
          .limit(100), // For PR calculation
        // Direct query for last 7 days with type 'reading'
        supabase
          .from('activities')
          .select('created_at, pages_read, duration_minutes, type, reading_speed_pph, reading_pace_min_per_page, photos')
          .eq('user_id', user.id)
          .eq('type', 'reading')
          .gte('created_at', last7dStartISO)
          .lte('created_at', last7dEndISO),
        // Fetch weekly activity using the helper function
        fetchWeeklyActivity(user.id),
      ]);

      if (goalsResult.error) {
        console.error('[loadInsightsData] Goals error:', goalsResult.error);
      }
      if (profileResult.error) {
        console.error('[loadInsightsData] Profile error:', profileResult.error);
      }
      if (weekActivitiesResult.error) {
        console.error('[loadInsightsData] Week activities error:', weekActivitiesResult.error);
        setLoading(false);
      return;
    }
      if (last7dActivitiesResult.error) {
        console.error('[loadInsightsData] Last 7d activities error:', last7dActivitiesResult.error);
      }

      const allWeekActivities = weekActivitiesResult.data || [];
      const allMonthActivities = monthActivitiesResult.data || [];
      const allReadingActivities = allReadingActivitiesResult.data || [];
      const last7dActivities = last7dActivitiesResult.data || [];
      const dbGoals = goalsResult.data || [];
      const profileData = profileResult.data;

      console.log('[STATS] loadInsightsData results', {
        weekActivitiesCount: allWeekActivities.length,
        last7dActivitiesCount: last7dActivities.length,
        weeklyActivityTotalPages: weeklyActivityResult.totalPages,
        weeklyActivityDays: weeklyActivityResult.days,
      });

      // Use the new weekly activity helper
      const weekBars = weeklyActivityToPagesArray(weeklyActivityResult.days);
      setWeeklyActivity(weekBars);
      setWeeklyActivityTotalPages(weeklyActivityResult.totalPages);

      // Derive todayStats from fetched activities
      const todayActivities = allWeekActivities.filter(a => {
        const activityDate = new Date(a.created_at);
        return toLocalDateKey(activityDate) === todayKey;
      });

      const todayPages = todayActivities.reduce((sum, a) => sum + (Number(a.pages_read) ?? 0), 0);
      const todayMinutes = todayActivities.reduce((sum, a) => sum + (Number(a.duration_minutes) ?? 0), 0);
      setTodayStats({ pages: todayPages, minutes: todayMinutes });

      // Derive weekStats from fetched activities
      const weekPages = allWeekActivities.reduce((sum, a) => sum + (Number(a.pages_read) ?? 0), 0);
      const weekMinutes = allWeekActivities.reduce((sum, a) => sum + (Number(a.duration_minutes) ?? 0), 0);
      setWeeklyStats({
        pages: weekPages,
        activities: allWeekActivities.length,
        totalMinutes: weekMinutes,
      });

      // Calculate 7d stats using the direct query result
      // Check if there are any reading sessions in 7d
      const last7dReadingSessions = last7dActivities.filter(a => 
        (Number(a.pages_read) > 0 || Number(a.duration_minutes) > 0)
      );
      const hasSessions7d = last7dReadingSessions.length > 0;

      const totalPages7d = last7dActivities.reduce((sum, a) => sum + (Number(a.pages_read) ?? 0), 0);
      const totalMinutes7d = last7dActivities.reduce((sum, a) => sum + (Number(a.duration_minutes) ?? 0), 0);

      console.log('[STATS] loadInsightsData 7d stats computed', {
        totalPages7d,
        totalMinutes7d,
        hasSessions7d,
        sessionsCount: last7dActivities.length
      });

      // Compute stats with strict validation
      const stats7dComputed = computeReadingStats(totalPages7d, totalMinutes7d);

      setStats7d({
        totalMinutes: totalMinutes7d,
        totalPages: totalPages7d,
        speedPph: stats7dComputed.speed.type === 'value' ? stats7dComputed.speed.value : null,
        paceMinPerPage: stats7dComputed.pace.type === 'value' ? stats7dComputed.pace.value : null,
        hasSessions: hasSessions7d,
      });

      // Calculate PR (best session from last 30 days or all-time) with strict validation
      let bestPPH: number | null = null;
      let bestPace: number | null = null;
      let bestSessionPages: number = 0;
      let bestSessionMinutes: number = 0;

      // Check if user has ever had a reading session
      const hasAnyReadingSessions = allReadingActivities.some(a => 
        (Number(a.pages_read) > 0 || Number(a.duration_minutes) > 0)
      );

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentActivities = allReadingActivities.filter(a => {
        if (!a.created_at) return false;
        return new Date(a.created_at) >= thirtyDaysAgo;
      });

      for (const a of recentActivities) {
        const pages = Number(a.pages_read) || 0;
        const mins = Number(a.duration_minutes) || 0;

        // Strict validation: record requires min 1 minute and min 5 pages
        if (mins < 1 || pages < 5) continue;

        // Validate stored values first
        if (a.reading_speed_pph != null) {
          const pph = Number(a.reading_speed_pph);
          if (pph > 0 && (bestPPH == null || pph > bestPPH)) {
            bestPPH = pph;
            bestSessionPages = pages;
            bestSessionMinutes = mins;
          }
        }
        if (a.reading_pace_min_per_page != null) {
          const pace = Number(a.reading_pace_min_per_page);
          if (pace > 0 && (bestPace == null || pace < bestPace)) {
            bestPace = pace;
            // Update best session if this is better
            if (bestSessionPages === 0 || bestSessionMinutes === 0) {
              bestSessionPages = pages;
              bestSessionMinutes = mins;
            }
          }
        }
        
        // Fallback: calculate from pages_read and duration_minutes
        // Only if stored values are not available or this session is better
        if (bestPPH == null || bestPace == null) {
          const calcPph = pages / (mins / 60);
          const calcPace = mins / pages;
          
          if (bestPPH == null || calcPph > bestPPH) {
            bestPPH = calcPph;
            bestSessionPages = pages;
            bestSessionMinutes = mins;
          }
          if (bestPace == null || calcPace < bestPace) {
            bestPace = calcPace;
            if (bestSessionPages === 0 || bestSessionMinutes === 0) {
              bestSessionPages = pages;
              bestSessionMinutes = mins;
            }
          }
        }
      }

      // Final validation: ensure the best session meets record criteria
      const prComputed = computeReadingStats(bestSessionPages, bestSessionMinutes);
      const hasValidRecord = prComputed.isValidForRecord && bestPPH != null && bestPace != null;

      setPr({
        speedPph: hasValidRecord && bestPPH != null ? Number(bestPPH.toFixed(1)) : null,
        paceMinPerPage: hasValidRecord && bestPace != null ? Number(bestPace.toFixed(1)) : null,
        hasAnySessions: hasAnyReadingSessions,
      });

      // Calculate goal progress from same activities
      const weekWorkouts = allWeekActivities.filter(a => a.type === 'workout').length;
      const weekBooks = allWeekActivities.filter(a => a.type === 'reading' && a.pages_read > 0).length;

      const goalsWithProgress = dbGoals.map((goal) => {
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

      // Set profile
      if (profileData) {
        setProfile(profileData);
      }

      // Build calendar data from month activities
    const activityMap: { [key: string]: boolean } = {};
      allMonthActivities.forEach((activity) => {
        const activityDate = new Date(activity.created_at);
        const dateKey = toLocalDateKey(activityDate);
      activityMap[dateKey] = true;
    });

    setCalendarData(activityMap);
    } catch (error) {
      console.error('[loadInsightsData] Unexpected error:', error);
    } finally {
      setLoading(false);
    }
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
    loadInsightsData();
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

    loadInsightsData();
  };

  const getGoalLabel = (goal: any) => {
    // For daily time goals (15min, 30min, 60min, daily_time), format as "Lire X minutes par jour"
    if (goal.type === 'daily_15min' || goal.type === 'daily_30min' || goal.type === 'daily_60min') {
      const minutes = goal.type === 'daily_15min' ? 15 : goal.type === 'daily_30min' ? 30 : 60;
      return `Lire ${minutes} minutes par jour`;
    }
    if (goal.type === 'daily_time') {
      return `Lire ${goal.target_value} minutes par jour`;
    }
    
    const labels: Record<string, string> = {
      daily_pages: 'Pages quotidiennes',
      weekly_workouts: 'Entraînements hebdomadaires',
      weekly_books: 'Livres hebdomadaires',
      weekly_pages: 'Pages hebdomadaires',
    };
    return labels[goal.type] || goal.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getGoalUnit = (type: string) => {
    // Ensure all time-based goals return 'min'
    if (type.includes('min') || type === 'daily_time') return 'min';
    if (type.includes('pages')) return 'pages';
    if (type.includes('books')) return 'livres';
    if (type.includes('workouts')) return 'sessions';
    return 'min'; // Default fallback to 'min' to avoid empty units
  };

  const generateCalendarDays = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get day of week for first day (0=Sun, 1=Mon, ...)
    const firstDayOfWeek = firstDay.getDay();
    // Convert to Monday-start (0=Mon, 1=Tue, ... 6=Sun)
    const startingDayOfWeek = (firstDayOfWeek + 6) % 7;
    
    const daysInMonth = lastDay.getDate();

    const days = [];
    // Add empty cells for days before the first day of the month (Monday-start)
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
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const dateKey = toLocalDateKey(date);
    return calendarData[dateKey] || false;
  };

  // Helper: check if a dateKey is today
  const isTodayKey = (key: string): boolean => {
    return key === toLocalDateKey(new Date());
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const dateKey = toLocalDateKey(date);
    return isTodayKey(dateKey);
  };

  const isFutureDay = (day: number | null) => {
    if (!day) return false;
    const now = new Date();
    const checkDate = new Date(now.getFullYear(), now.getMonth(), day);
    // compare à la journée (pas à l'heure)
    return startOfLocalDay(checkDate) > startOfLocalDay(now);
  };

  const monthName = new Date().toLocaleString('default', { month: 'long' });

  if (loading) {
    return (
      <div className="min-h-screen bg-background-light">
        <div className="max-w-2xl mx-auto">
          <AppHeader title="Votre élan" />
          <div className="px-4 py-6">
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background-light overflow-hidden">
      <div className="max-w-2xl mx-auto w-full h-full">
        {/* Fixed Header - now truly fixed via AppHeader component */}
        <AppHeader title="Votre élan" />

        {/* ✅ SCROLL ICI - Single scrollable container with proper padding */}
        <div
          className="h-full overflow-y-auto"
          style={{
            paddingBottom: `calc(${TABBAR_HEIGHT}px + env(safe-area-inset-bottom) + 32px)`,
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
            overscrollBehaviorX: 'none',
            touchAction: 'pan-y', // Allow vertical panning only
          }}
        >
          <div 
            className="px-4 py-6"
            style={{
              paddingBottom: `calc(32px + ${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
            }}
          >
            {/* Level Progress Bar */}
            {contextProfile?.xp_total !== undefined && (
              <div className="mb-6">
                <LevelProgressBar xpTotal={contextProfile.xp_total || 0} variant="compact" />
                {/* Leaderboard Button */}
                <button
                  onClick={openLeaderboard}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium"
                >
                  <Trophy className="w-4 h-4" />
                  Classement
                </button>
              </div>
            )}

        <div className="relative overflow-hidden rounded-2xl bg-card-light border border-gray-200 shadow-sm p-6 mb-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"></div>
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl"></div>
              <Flame className="relative z-10 w-16 h-16 text-primary drop-shadow-sm fill-primary" />
            </div>
            <div className="space-y-1">
              <h1 className="text-5xl font-bold tracking-tighter text-text-main-light">
                {streakDays}
              </h1>
              <p className="text-sm font-bold uppercase tracking-wider text-text-sub-light">
                Jours de série
              </p>
              {contextProfile?.longest_streak && contextProfile.longest_streak > 0 && (
                <p className="text-xs text-text-sub-light mt-1">
                  Record: {contextProfile.longest_streak} jours
                </p>
              )}
            </div>
            <div className="mt-2 rounded-full bg-primary/20 px-4 py-1.5">
              <p className="text-xs font-semibold text-text-main-light">
                {streakDays > 0 ? 'Continuez comme ça !' : 'Commencez votre série aujourd\'hui'}
              </p>
            </div>
          </div>
        </div>

        {/* Mini dashboard 7 jours */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-text-sub-light mb-1">
              <Clock className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">Temps (7 jours)</p>
            </div>
            {stats7d.hasSessions ? (
              <>
                <p className="text-3xl font-bold leading-none text-text-main-light">
                  {formatDuration(stats7d.totalMinutes)}
                </p>
                <p className="text-xs text-text-sub-light">Total</p>
              </>
            ) : (
              <p className="text-sm text-text-sub-light leading-relaxed">
                Aucune session sur cette période
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-text-sub-light mb-1">
              <BookOpen className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">Pages (7 jours)</p>
            </div>
            {stats7d.hasSessions ? (
              <>
                <p className="text-3xl font-bold leading-none text-text-main-light">
                  {stats7d.totalPages}
                </p>
                <p className="text-xs text-text-sub-light">Total</p>
              </>
            ) : (
              <p className="text-sm text-text-sub-light leading-relaxed">
                Aucune session sur cette période
              </p>
            )}
          </div>
        </div>

        {/* Vitesse 7 jours + PR */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-wide text-text-sub-light">Vitesse (7 jours)</p>
              <span className="text-[10px] font-bold bg-gray-100 px-2 py-1 rounded-lg text-gray-700">p/h</span>
            </div>
            {(() => {
              if (!stats7d.hasSessions) {
                return (
                  <p className="text-sm text-text-sub-light leading-relaxed">
                    Aucune session sur cette période
                  </p>
                );
              }
              
              const statsComputed = computeReadingStats(stats7d.totalPages, stats7d.totalMinutes);
              
              if (statsComputed.speed.type === 'value') {
                return (
                  <>
                    <p className="text-3xl font-bold leading-none text-text-main-light">
                      {statsComputed.speed.formattedValue}
                    </p>
                    {statsComputed.pace.type === 'value' && (
                      <p className="text-xs text-text-sub-light">
                        {statsComputed.pace.formattedValue} {statsComputed.pace.unit}
                      </p>
                    )}
                    {statsComputed.speed.context && (
                      <p className="text-[10px] text-text-sub-light/70 mt-1">
                        {statsComputed.speed.context}
                      </p>
                    )}
                  </>
                );
              }
              
              return (
                <p className="text-sm text-text-sub-light leading-relaxed">
                  {statsComputed.speed.message}
                </p>
              );
            })()}
          </div>

          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-wide text-text-sub-light">Record (PR)</p>
              <span className="text-[10px] font-bold bg-gray-100 px-2 py-1 rounded-lg text-gray-700">p/h</span>
            </div>
            {(() => {
              if (!pr.hasAnySessions) {
                return (
                  <p className="text-sm text-text-sub-light leading-relaxed">
                    Commence une session pour établir ton premier record
                  </p>
                );
              }
              
              if (pr.speedPph != null && pr.paceMinPerPage != null && pr.paceMinPerPage > 0) {
                return (
                  <>
                    <p className="text-3xl font-bold leading-none text-text-main-light">
                      {formatStatValue(pr.speedPph)}
                    </p>
                    <p className="text-xs text-text-sub-light">
                      Meilleur pace: {pr.paceMinPerPage.toFixed(1)} min/page
                    </p>
                  </>
                );
              }
              
              return (
                <p className="text-sm text-text-sub-light leading-relaxed">
                  Pas encore de record personnel
                </p>
              );
            })()}
          </div>
        </div>

        {/* Graphique activité 7 jours */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub-light">
              Activité sur 7 jours
            </h4>
            <span className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded-lg text-gray-700">
              {weeklyActivityTotalPages} pages
            </span>
          </div>

          <div className="bg-card-light px-4 py-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex items-end justify-between gap-2">
              {(() => {
                const maxPages = Math.max(...weeklyActivity, 10);
                const dayShort = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

                return weeklyActivity.map((pages, index) => {
                  const height = Math.round((pages / maxPages) * 100);

                  const isToday = (() => {
                    const today = new Date();
                    const todayIdx = (today.getDay() + 6) % 7;
                    return index === todayIdx;
                  })();

                  return (
                    <div key={index} className="flex flex-col items-center gap-2 flex-1">
                      <div className="w-full h-24 bg-gray-100 rounded-xl flex items-end overflow-hidden">
                        <div
                          className={`w-full transition-all duration-500 ${isToday ? 'bg-primary' : 'bg-primary/50'}`}
                          style={{
                            height: pages > 0 ? `${Math.max(height, 10)}%` : '6px',
                          }}
                          title={`${pages} pages`}
                        />
                      </div>

                      <div className="flex flex-col items-center leading-none">
                        <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-text-main-light' : 'text-gray-400'}`}>
                          {dayShort[index]}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium mt-1">
                          {pages || ''}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
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
                const label = getGoalLabel(goal);

                return (
                  <div key={goal.id} className="rounded-2xl bg-card-light border border-gray-200 p-5 shadow-sm">
                    <div className="mb-3 flex items-end justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-text-sub-light" />
                        <span className="font-medium">{label}</span>
                        <span className="text-[10px] font-semibold bg-primary/20 text-text-main-light px-2 py-0.5 rounded-full">
                          Aujourd'hui
                        </span>
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
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-right text-xs text-text-sub-light">
                      {progress >= 100 ? (
                        <span className="font-semibold text-primary">Objectif validé ✅</span>
                      ) : (
                        `Encore ${remaining} ${unit}`
                      )}
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
                      <span className="font-medium">{getGoalLabel(goal)}</span>
                      <span className="text-[10px] font-semibold bg-primary/20 text-text-main-light px-2 py-0.5 rounded-full">
                        Semaine
                      </span>
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
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-right text-xs text-text-sub-light">
                    {progress >= 100 ? (
                      <span className="font-semibold text-primary">Objectif validé ✅</span>
                    ) : (
                      `Encore ${remaining} ${unit}`
                    )}
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
              <div>L</div>
              <div>M</div>
              <div>M</div>
              <div>J</div>
              <div>V</div>
              <div>S</div>
              <div>D</div>
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
                        : today
                        ? 'bg-gray-100 text-text-sub-light ring-2 ring-gray-300'
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

        <div className="bg-card-light rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Cette semaine
          </h2>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-text-main-light mb-1">{weeklyStats.activities}</div>
              <div className="text-sm text-text-sub-light">Activités</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-text-main-light mb-1">{weeklyStats.pages}</div>
              <div className="text-sm text-text-sub-light">Pages lues</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-text-main-light mb-1">
                {weeklyStats.totalMinutes > 0 ? weeklyStats.totalMinutes : '—'}
              </div>
              <div className="text-sm text-text-sub-light">min</div>
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          onClose={closeLeaderboard}
          onUserClick={(userId) => {
            setSelectedUserId(userId);
            closeLeaderboard();
          }}
        />
      )}

      {/* User Profile View */}
      {selectedUserId && (
        <div className="fixed inset-0 bg-background-light z-[400] overflow-y-auto">
          <UserProfileView
            userId={selectedUserId}
            onClose={() => {
              setSelectedUserId(null);
              setActivityFocus(null);
            }}
            onUserClick={(id) => {
              setActivityFocus(null);
              setSelectedUserId(id);
            }}
            activityFocus={activityFocus}
            onFocusConsumed={() => setActivityFocus(null)}
          />
        </div>
      )}
    </div>
  );
}
