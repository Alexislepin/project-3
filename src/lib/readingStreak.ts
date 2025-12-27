/**
 * Reading streak calculation utilities
 * All calculations use LOCAL timezone (device timezone), not UTC
 */

/**
 * Converts a Date to a local date key (YYYY-MM-DD)
 * Uses the device's local timezone, not UTC
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes the reading streak from activities
 * 
 * Rules:
 * - A "active day" = at least one activity of type 'reading' with:
 *   - pages_read > 0 OR duration_minutes > 0
 * - Streak = number of consecutive active days counting backwards from TODAY (local)
 * 
 * @param activities Array of activities with created_at, pages_read, duration_minutes, type
 * @returns The current streak (0 if no activity today)
 */
export function computeStreakFromActivities(activities: Array<{
  created_at: string;
  pages_read?: number | null;
  duration_minutes?: number | null;
  type?: string;
}>): number {
  // Build Set of active days (local timezone)
  const activeDays = new Set<string>();

  for (const activity of activities) {
    // Only count reading activities
    if (activity.type !== 'reading') continue;

    // Must have at least pages_read > 0 OR duration_minutes > 0
    const hasPages = (activity.pages_read ?? 0) > 0;
    const hasDuration = (activity.duration_minutes ?? 0) > 0;
    
    if (!hasPages && !hasDuration) continue;

    // Convert created_at to local date key
    const activityDate = new Date(activity.created_at);
    const dayKey = toLocalDateKey(activityDate);
    activeDays.add(dayKey);
  }

  // Debug: log active days (first 10)
  const activeDaysArray = Array.from(activeDays).sort().reverse();
  console.log('[computeStreakFromActivities] activeDays', activeDaysArray.slice(0, 10));

  // Calculate streak: count consecutive days backwards from TODAY (local)
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today (local)

  let count = 0;
  let currentDate = new Date(today);

  // Loop backwards day by day
  while (true) {
    const dayKey = toLocalDateKey(currentDate);
    
    if (activeDays.has(dayKey)) {
      count++;
      // Move to previous day
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      // Streak broken
      break;
    }
  }

  console.log('[computeStreakFromActivities] computed streak', count);
  return count;
}

