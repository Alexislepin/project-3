import { supabase } from '../lib/supabase';

/**
 * Updates user streak after an activity is created.
 * Streak increments if user hits at least one active DAILY goal for the day OR logs an activity.
 * 
 * @param userId - User ID
 * @returns Promise<void>
 */
export async function updateStreakAfterActivity(userId: string): Promise<void> {
  try {
    // Get today's start (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.toISOString();

    // Check if user has any activity today
    const { data: todayActivities } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', todayStart)
      .limit(1);

    // Check if user has met any active daily goal today
    const { data: activeDailyGoals } = await supabase
      .from('user_goals')
      .select('type, target_value')
      .eq('user_id', userId)
      .eq('active', true)
      .eq('period', 'daily');

    let goalMet = false;
    if (activeDailyGoals && activeDailyGoals.length > 0) {
      // Get today's totals
      const { data: todayStats } = await supabase
        .from('activities')
        .select('pages_read, duration_minutes')
        .eq('user_id', userId)
        .gte('created_at', todayStart);

      if (todayStats) {
        const totalPages = todayStats.reduce((sum, a) => sum + (a.pages_read || 0), 0);
        const totalMinutes = todayStats.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);

        // Check if any daily goal is met
        goalMet = activeDailyGoals.some((goal) => {
          if (goal.type === 'daily_pages') {
            return totalPages >= goal.target_value;
          }
          if (goal.type === 'daily_time' || goal.type === 'daily_15min' || goal.type === 'daily_30min' || goal.type === 'daily_60min') {
            const targetMinutes = goal.type === 'daily_time' 
              ? goal.target_value 
              : goal.type === 'daily_15min' ? 15 
              : goal.type === 'daily_30min' ? 30 
              : 60;
            return totalMinutes >= targetMinutes;
          }
          return false;
        });
      }
    }

    // Streak qualifies if there's an activity today OR a goal is met
    const qualifiesForStreak = (todayActivities && todayActivities.length > 0) || goalMet;

    if (!qualifiesForStreak) {
      // No activity today and no goal met - streak resets
      await supabase
        .from('user_profiles')
        .update({ current_streak: 0 })
        .eq('id', userId);
      return;
    }

    // Get current streak
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('current_streak, longest_streak')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return;

    const currentStreak = profile.current_streak || 0;
    const longestStreak = profile.longest_streak || 0;

    // Check if yesterday had activity or goal met
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    const yesterdayStart = yesterday.toISOString();
    yesterday.setUTCHours(23, 59, 59, 999);
    const yesterdayEnd = yesterday.toISOString();

    const { data: yesterdayActivities } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', yesterdayStart)
      .lte('created_at', yesterdayEnd)
      .limit(1);

    // Check yesterday's goals
    let yesterdayGoalMet = false;
    if (activeDailyGoals && activeDailyGoals.length > 0) {
      const { data: yesterdayStats } = await supabase
        .from('activities')
        .select('pages_read, duration_minutes')
        .eq('user_id', userId)
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd);

      if (yesterdayStats) {
        const totalPages = yesterdayStats.reduce((sum, a) => sum + (a.pages_read || 0), 0);
        const totalMinutes = yesterdayStats.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);

        yesterdayGoalMet = activeDailyGoals.some((goal) => {
          if (goal.type === 'daily_pages') {
            return totalPages >= goal.target_value;
          }
          if (goal.type === 'daily_time' || goal.type === 'daily_15min' || goal.type === 'daily_30min' || goal.type === 'daily_60min') {
            const targetMinutes = goal.type === 'daily_time' 
              ? goal.target_value 
              : goal.type === 'daily_15min' ? 15 
              : goal.type === 'daily_30min' ? 30 
              : 60;
            return totalMinutes >= targetMinutes;
          }
          return false;
        });
      }
    }

    const yesterdayQualified = (yesterdayActivities && yesterdayActivities.length > 0) || yesterdayGoalMet;

    // Calculate new streak
    let newStreak = currentStreak;
    if (yesterdayQualified) {
      // Continue streak
      newStreak = currentStreak + 1;
    } else if (currentStreak === 0) {
      // Start new streak
      newStreak = 1;
    } else {
      // Streak was broken, reset to 1 (today qualifies)
      newStreak = 1;
    }

    // Update longest streak if exceeded
    const newLongestStreak = Math.max(longestStreak, newStreak);

    await supabase
      .from('user_profiles')
      .update({
        current_streak: newStreak,
        longest_streak: newLongestStreak,
      })
      .eq('id', userId);
  } catch (error) {
    console.error('[updateStreakAfterActivity] Error:', error);
  }
}

