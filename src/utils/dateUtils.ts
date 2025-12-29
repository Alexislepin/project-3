export function formatDistanceToNow(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Pad number to 2 digits
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Convert date to local date key (YYYY-MM-DD)
 */
export function toLocalDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Get start of local day (00:00:00)
 */
export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get start of local week (Monday at 00:00:00)
 */
export function startOfLocalWeek(date: Date = new Date()): Date {
  const d = startOfLocalDay(date);
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diffToMonday = (day + 6) % 7; // Mon=0, Tue=1 ... Sun=6
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

/**
 * Calculate the date range for the last 7 days in ISO format (UTC)
 * Returns start (7 days ago at 00:00:00 local time) and end (now) as ISO strings
 * This ensures proper timezone handling when querying Supabase (which stores timestamps in UTC)
 */
export function last7DaysRangeISO(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();

  // Start = 6 days ago (to include today, that's 7 days total: today + 6 previous days)
  // Set to start of day (00:00:00) in local timezone, then convert to ISO
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  return { start: start.toISOString(), end };
}
