import { supabase } from './supabase';
import { computeStreakInfoFromActivities } from './readingStreak';

/**
 * Unified streak calculation service
 * Single source of truth for streak calculation across the app
 */
export interface StreakInfo {
  streak: number;
  atRisk: boolean;
  msLeft: number;
}

/**
 * Check if an activity represents an active reading day
 * More lenient than isRealReadingSession: counts a day as active if:
 * - pages_read > 0 OR
 * - duration_minutes > 0 OR
 * - photos?.length > 0
 * 
 * This ensures days with just photos or just minutes count for the streak
 */
function isActiveReadingDay(activity: any): boolean {
  const pages = Number(activity?.pages_read) || 0;
  const mins = Number(activity?.duration_minutes) || 0;
  const photos = activity?.photos;
  const hasPhotos = Array.isArray(photos) && photos.length > 0;
  
  return pages > 0 || mins > 0 || hasPhotos;
}

/**
 * Fetch and calculate streak info for a user
 * This is the single source of truth for streak calculation
 * 
 * @param userId User ID
 * @param now Current date (default: new Date())
 * @returns StreakInfo with streak, atRisk, and msLeft
 */
export async function fetchStreakInfo(userId: string, now = new Date()): Promise<StreakInfo> {
  try {
    // Single unified query - same everywhere
    const { data: activities, error } = await supabase
      .from('activities')
      .select('created_at, pages_read, duration_minutes, type, photos')
      .eq('user_id', userId)
      .eq('type', 'reading')
      .order('created_at', { ascending: false })
      .limit(400);

    if (error) {
      console.error('[streakService] Error fetching activities:', error);
      return { streak: 0, atRisk: false, msLeft: 0 };
    }

    const allActivities = activities || [];
    console.log('[streakService] Total activities fetched:', allActivities.length);

    // Filter to active reading days (more lenient than isRealReadingSession)
    // Count a day as active if pages > 0 OR duration > 0 OR photos > 0
    const activeDays = allActivities.filter(isActiveReadingDay);
    console.log('[streakService] Active days after filter:', activeDays.length);

    // Calculate streak using unified function
    const info = computeStreakInfoFromActivities(activeDays, now);
    console.log('[streakService] Streak calculated:', {
      streak: info.streak,
      atRisk: info.atRisk,
      msLeft: info.msLeft,
      hasReadToday: info.hasReadToday,
    });

    // Update DB only if different from current value (avoid concurrent updates)
    // We check the current value first to avoid unnecessary writes
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('current_streak')
      .eq('id', userId)
      .maybeSingle();

    const currentStreak = profile?.current_streak ?? 0;
    if (currentStreak !== info.streak) {
      console.log('[streakService] Updating DB streak:', { from: currentStreak, to: info.streak });
      await supabase
        .from('user_profiles')
        .update({ current_streak: info.streak })
        .eq('id', userId);
    } else {
      console.log('[streakService] Streak unchanged, skipping DB update');
    }

    return {
      streak: info.streak,
      atRisk: info.atRisk,
      msLeft: info.msLeft,
    };
  } catch (error) {
    console.error('[streakService] Unexpected error:', error);
    return { streak: 0, atRisk: false, msLeft: 0 };
  }
}

