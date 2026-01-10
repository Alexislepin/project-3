/**
 * Format reading activity stats for display
 * 
 * @param activity Activity object with pages_read, duration_minutes, and optional reading_speed_pph
 * @returns Formatted stats string or null if nothing to display
 */
export function formatReadingStats(activity: {
  pages_read?: number | null;
  duration_minutes?: number | null;
  reading_speed_pph?: number | null;
}): string | null {
  const pages = activity.pages_read ?? 0;
  const duration = activity.duration_minutes ?? 0;
  const speedPph = activity.reading_speed_pph;

  // If pages_read = 0, show "Session de lecture" + duration (if available)
  if (pages === 0) {
    if (duration > 0) {
      const minutes = Math.max(1, Math.round(duration));
      return `Session de lecture • ${minutes} min`;
    }
    return 'Session de lecture';
  }

  // If pages_read > 0, show "X pages • Y min • Z p/h"
  const parts: string[] = [];

  // Pages (always show if > 0)
  if (pages > 0) {
    parts.push(`${pages} page${pages > 1 ? 's' : ''}`);
  }

  // Duration (if available)
  if (duration > 0) {
    const minutes = Math.max(1, Math.round(duration));
    parts.push(`${minutes} min`);
  }

  // Speed (calculate or use provided)
  let speed: number | null = null;
  if (speedPph && speedPph > 0) {
    speed = speedPph;
  } else if (pages > 0 && duration > 0) {
    // Calculate: pages / (duration_minutes / 60) = pages per hour
    speed = (pages / (duration / 60));
  }

  if (speed && speed > 0) {
    parts.push(`${speed.toFixed(1)} p/h`);
  }

  return parts.length > 0 ? parts.join(' • ') : null;
}

/**
 * Format reading activity action text
 * 
 * @param displayName User's display name
 * @param bookTitle Book title (optional)
 * @param showName Whether to include the name (default: true)
 * @returns Formatted action text like "a lu Le Personal MBA" or "Alexis a lu Le Personal MBA"
 */
export function formatReadingAction(
  displayName: string,
  bookTitle?: string | null,
  showName: boolean = true
): string {
  const namePart = showName ? `${displayName} ` : '';
  const bookPart = bookTitle ? bookTitle : 'un livre';
  return `${namePart}a lu ${bookPart}`;
}

/**
 * Get reading activity UI data (premium layout)
 * Returns action label, title, author, and stats chips
 * 
 * @param activity Activity object with pages_read, duration_minutes, reading_speed_pph, book
 * @returns UI data object with actionLabel, title, author, statsChips
 */
export function getReadingUI(activity: {
  pages_read?: number | null;
  duration_minutes?: number | null;
  reading_speed_pph?: number | null;
  book?: {
    title?: string | null;
    author?: string | null;
  } | null;
}): {
  actionLabel: string;
  title: string;
  author: string;
  statsChips: Array<{ label: string; value: string }>;
} {
  const pages = activity.pages_read ?? 0;
  const duration = activity.duration_minutes ?? 0;
  const speedPph = activity.reading_speed_pph;
  const bookTitle = activity.book?.title || 'un livre';
  const bookAuthor = activity.book?.author || 'Auteur inconnu';

  // Action label: "a lu" or "Session de lecture" (SANS le titre pour éviter duplication)
  const actionLabel = pages === 0 ? 'Session de lecture' : 'a lu';

  // Stats chips
  const statsChips: Array<{ label: string; value: string }> = [];

  // Pages chip (only if > 0)
  if (pages > 0) {
    statsChips.push({
      label: 'pages',
      value: `${pages}`,
    });
  }

  // Duration chip (if available)
  if (duration > 0) {
    const minutes = Math.max(1, Math.round(duration));
    statsChips.push({
      label: 'min',
      value: `${minutes}`,
    });
  }

  // Speed chip (only if pages > 0, never for "Session de lecture")
  if (pages > 0) {
    let speed: number | null = null;
    if (speedPph && speedPph > 0) {
      speed = speedPph;
    } else if (pages > 0 && duration > 0) {
      // Calculate: pages / (duration_minutes / 60) = pages per hour
      speed = (pages / (duration / 60));
    }

    if (speed && speed > 0) {
      statsChips.push({
        label: 'p/h',
        value: speed.toFixed(1),
      });
    }
  }

  return {
    actionLabel,
    title: bookTitle,
    author: bookAuthor,
    statsChips,
  };
}

