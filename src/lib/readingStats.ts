// Centralized reading stats computation with strict validation
// Used across Profile, UserProfileView, and Insights pages

export type StatResult = 
  | { type: 'value'; value: number; formattedValue: string; unit: string; context?: string }
  | { type: 'message'; message: string };

export interface ReadingStatsResult {
  speed: StatResult;
  pace: StatResult;
  isValidForRecord: boolean;
  hasSessions: boolean;
  totalPages: number;
  totalMinutes: number;
}

// Format number intelligently (round large values, add thousands separators)
export function formatStatValue(value: number): string {
  if (value >= 1000) {
    // Round to nearest 10 for very large values
    const rounded = Math.round(value / 10) * 10;
    return `~${rounded.toLocaleString('fr-FR')}`;
  } else if (value >= 100) {
    // Round to nearest integer for large values
    return Math.round(value).toLocaleString('fr-FR');
  } else {
    // Keep 1 decimal for smaller values
    return value.toFixed(1);
  }
}

// Format duration (minutes to "X min" or "X.X h")
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${Math.round(totalMinutes)} min`;
  }
  return `${(totalMinutes / 60).toFixed(1)} h`;
}

/**
 * Compute reading stats from activities with strict validation
 * @param totalPages Total pages read
 * @param totalMinutes Total minutes spent reading
 * @param minPagesForRecord Minimum pages required for a valid record (default: 5)
 * @returns ReadingStatsResult with validated stats
 */
export function computeReadingStats(
  totalPages: number,
  totalMinutes: number,
  minPagesForRecord: number = 5
): ReadingStatsResult {
  const pages = Math.max(0, totalPages);
  const minutes = Math.max(0, totalMinutes);

  // Check if there are any reading sessions
  const hasSessions = pages > 0 || minutes > 0;

  // Strict validation: need at least 1 minute for any speed/pace calculation
  if (minutes < 1) {
    return {
      speed: { type: 'message', message: 'Données insuffisantes' },
      pace: { type: 'message', message: 'Données insuffisantes' },
      isValidForRecord: false,
      hasSessions,
      totalPages: pages,
      totalMinutes: minutes,
    };
  }

  // Calculate speed (pages per hour)
  const speedPph = pages > 0 && minutes >= 1 
    ? Number((pages / (minutes / 60)).toFixed(1))
    : null;

  // Calculate pace (minutes per page) - only if pages > 0
  const paceMinPerPage = pages > 0 && minutes >= 1
    ? Number((minutes / pages).toFixed(1))
    : null;

  // Record is valid only if: min 1 minute, min 5 pages, and pace is calculable
  const isValidForRecord = minutes >= 1 && pages >= minPagesForRecord && paceMinPerPage != null && paceMinPerPage > 0;

  // Generate context message for speed
  let speedContext: string | undefined;
  if (speedPph != null && speedPph > 0) {
    if (minutes < 5) {
      speedContext = 'Calculé sur une session courte';
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      if (hours > 0) {
        speedContext = `Basé sur ${hours}h${mins > 0 ? ` ${mins}min` : ''} de lecture`;
      } else {
        speedContext = `Basé sur ${Math.round(minutes)} min de lecture`;
      }
    }
  }

  return {
    speed: speedPph != null && speedPph > 0
      ? { 
          type: 'value', 
          value: speedPph, 
          formattedValue: formatStatValue(speedPph),
          unit: 'p/h',
          context: speedContext,
        }
      : { type: 'message', message: 'Données insuffisantes' },
    pace: paceMinPerPage != null && paceMinPerPage > 0
      ? { 
          type: 'value', 
          value: paceMinPerPage, 
          formattedValue: paceMinPerPage.toFixed(1),
          unit: 'min/page' 
        }
      : { type: 'message', message: 'Données insuffisantes' },
    isValidForRecord,
    hasSessions,
    totalPages: pages,
    totalMinutes: minutes,
  };
}

/**
 * Compute PR (Personal Record) from activities
 * @param activities Array of reading activities
 * @param lookbackDays Number of days to look back for PR (default: 30)
 * @returns PR stats or null if no valid record
 */
export function computePR(
  activities: Array<{
    pages_read?: number | null;
    duration_minutes?: number | null;
    reading_speed_pph?: number | null;
    reading_pace_min_per_page?: number | null;
    created_at?: string | null;
  }>,
  lookbackDays: number = 30
): {
  speedPph: number | null;
  paceMinPerPage: number | null;
  hasAnySessions: boolean;
} {
  // Check if user has ever had a reading session
  const hasAnySessions = activities.some(a => 
    (Number(a.pages_read) > 0 || Number(a.duration_minutes) > 0)
  );

  if (!hasAnySessions) {
    return { speedPph: null, paceMinPerPage: null, hasAnySessions: false };
  }

  const now = new Date();
  const lookbackDate = new Date(now);
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  // Filter recent activities
  const recentActivities = activities.filter(a => {
    if (!a.created_at) return false;
    return new Date(a.created_at) >= lookbackDate;
  });

  let bestPPH: number | null = null;
  let bestPace: number | null = null;

  for (const a of recentActivities) {
    const pages = Number(a.pages_read) || 0;
    const mins = Number(a.duration_minutes) || 0;

    // Strict validation: record requires min 1 minute and min 5 pages
    if (mins < 1 || pages < 5) continue;

    // Try stored values first
    if (a.reading_speed_pph != null) {
      const pph = Number(a.reading_speed_pph);
      if (pph > 0 && (bestPPH == null || pph > bestPPH)) {
        bestPPH = pph;
      }
    }
    if (a.reading_pace_min_per_page != null) {
      const pace = Number(a.reading_pace_min_per_page);
      if (pace > 0 && (bestPace == null || pace < bestPace)) {
        bestPace = pace;
      }
    }
    
    // Fallback: calculate from pages_read and duration_minutes
    if (bestPPH == null || bestPace == null) {
      const calcPph = pages / (mins / 60);
      const calcPace = mins / pages;
      
      if (bestPPH == null || calcPph > bestPPH) {
        bestPPH = calcPph;
      }
      if (bestPace == null || calcPace < bestPace) {
        bestPace = calcPace;
      }
    }
  }

  // Final validation: ensure the best session meets record criteria
  if (bestPPH != null && bestPace != null && bestPace > 0) {
    return {
      speedPph: Number(bestPPH.toFixed(1)),
      paceMinPerPage: Number(bestPace.toFixed(1)),
      hasAnySessions: true,
    };
  }

  return { speedPph: null, paceMinPerPage: null, hasAnySessions: true };
}

