import { supabase } from './supabase';
import { startOfLocalWeek, toLocalDateKey } from '../utils/dateUtils';

export type DayStat = {
  dayKey: string;
  label: 'L' | 'M' | 'M' | 'J' | 'V' | 'S' | 'D';
  pages: number;
  minutes: number;
};

export interface WeeklyActivityResult {
  totalPages: number;
  days: DayStat[];
  weekStart: string; // ISO date
  weekEnd: string;   // ISO date
}

export type WeeklyActivityOptions = {
  weekOffset?: number; // 0 = semaine en cours, 1 = semaine précédente, etc.
  visibility?: 'all' | 'public';
  visibilities?: ('public' | 'followers' | 'private')[];
};

/**
 * Fetch and aggregate weekly reading activity (Monday-Sunday of current week)
 * Groups activities by local date (timezone-aware)
 * 
 * IMPORTANT: This function only counts activities from the CURRENT week (Monday to Sunday).
 * If it's Monday and no activities have been logged yet this week, the result will be 0 pages.
 * This is EXPECTED BEHAVIOR - the graph resets at the start of each new week.
 * Activities from previous weeks are NOT included in this calculation.
 */
export async function fetchWeeklyActivity(
  userId: string,
  options: WeeklyActivityOptions = {}
): Promise<WeeklyActivityResult> {
  const { weekOffset = 0, visibility = 'all', visibilities } = options;

  // Calculate week boundaries in local timezone (Monday 00:00:00 to Sunday 23:59:59)
  const weekStart = startOfLocalWeek();
  // Décaler de n semaines en arrière si weekOffset > 0
  weekStart.setDate(weekStart.getDate() - weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Convert to ISO for Supabase query (UTC)
  // Activities before weekStart (from previous weeks) are excluded
  const weekStartISO = weekStart.toISOString();
  const weekEndISO = weekEnd.toISOString();

  // Fetch activities from the current week (Monday-Sunday)
  let query = supabase
    .from('activities')
    .select('created_at, pages_read, duration_minutes, visibility')
    .eq('user_id', userId)
    .eq('type', 'reading')
    .gte('created_at', weekStartISO)
    .lte('created_at', weekEndISO);

  if (visibilities && visibilities.length > 0) {
    query = visibilities.length === 1 ? query.eq('visibility', visibilities[0]) : query.in('visibility', visibilities);
  } else if (visibility === 'public') {
    query = query.eq('visibility', 'public');
  }

  const { data: activities, error } = await query;

  if (error) {
    console.error('[fetchWeeklyActivity] Error:', error);
    return { totalPages: 0, days: getEmptyWeekDays(), weekStart: weekStartISO, weekEnd: weekEndISO };
  }

  // Initialize 7 days (Monday=0, Sunday=6)
  const days: DayStat[] = getEmptyWeekDays();

  // Aggregate by local date
  let totalPages = 0;
  
  if (activities) {
    for (const activity of activities) {
      if (!activity.created_at) continue;

      // Convert UTC created_at to local Date
      const activityDate = new Date(activity.created_at);
      
      // Get local date key (YYYY-MM-DD)
      const dateKey = toLocalDateKey(activityDate);
      
      // Get day of week in local timezone (0=Sunday, 1=Monday, ..., 6=Saturday)
      const dayOfWeek = activityDate.getDay();
      // Convert to Monday=0 index: (dayOfWeek + 6) % 7
      const dayIndex = (dayOfWeek + 6) % 7;

      const pages = Number(activity.pages_read) || 0;
      const minutes = Number(activity.duration_minutes) || 0;

      // Add to the correct day bucket
      days[dayIndex].pages += pages;
      days[dayIndex].minutes += minutes;
      days[dayIndex].dayKey = dateKey;

      totalPages += pages;
    }
  }

  return { totalPages, days, weekStart: weekStartISO, weekEnd: weekEndISO };
}

/**
 * Initialize empty week days array (Monday to Sunday)
 */
function getEmptyWeekDays(): DayStat[] {
  const dayLabels: DayStat['label'][] = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  return dayLabels.map((label, index) => ({
    dayKey: '',
    label,
    pages: 0,
    minutes: 0,
  }));
}

/**
 * Helper to convert DayStat[] to number[] (pages only) for backward compatibility
 */
export function weeklyActivityToPagesArray(days: DayStat[]): number[] {
  return days.map(d => d.pages);
}

export function formatWeekRangeLabel(start: Date, end: Date): string {
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'fr-FR';
  const startLabel = start.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  const endLabel = end.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  return `${startLabel} – ${endLabel}`;
}

