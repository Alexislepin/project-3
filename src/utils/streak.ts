import { supabase } from '../lib/supabase';
import { computeStreakFromActivities } from '../lib/readingStreak';

/**
 * Updates user streak after an activity is created.
 * Uses local timezone-based calculation for accurate streak tracking.
 * 
 * @param userId - User ID
 * @returns Promise<void>
 */
export async function updateStreakAfterActivity(userId: string): Promise<void> {
  try {
    // Load last 200 reading activities to compute streak (local timezone)
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('created_at, pages_read, duration_minutes, type, photos')
      .eq('user_id', userId)
      .eq('type', 'reading')
      .order('created_at', { ascending: false })
      .limit(200);

    if (activitiesError) {
      console.error('[updateStreakAfterActivity] Error loading activities:', activitiesError);
      return;
    }

    // Compute streak from activities (local timezone)
    const newStreak = computeStreakFromActivities(activities || []);

    // Get current longest streak
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('longest_streak')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return;

    const longestStreak = profile.longest_streak || 0;
    const newLongestStreak = Math.max(longestStreak, newStreak);

    // Update streak in database
    await supabase
      .from('user_profiles')
      .update({
        current_streak: newStreak,
        longest_streak: newLongestStreak,
      })
      .eq('id', userId);

    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('streak-updated', { detail: { streak: newStreak } }));
  } catch (error) {
    console.error('[updateStreakAfterActivity] Error:', error);
  }
}
