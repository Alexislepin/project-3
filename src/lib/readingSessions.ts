/**
 * Helper to identify real reading sessions vs baseline activities
 * A real session requires both pages > 0 AND duration > 0
 */
export function isRealReadingSession(a: any): boolean {
  const pages = Number(a?.pages_read) || 0;
  const mins = Number(a?.duration_minutes) || 0;
  return pages > 0 && mins > 0;
}

