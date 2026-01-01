/**
 * Calculate reading XP based on duration and pages
 * 
 * Rules:
 * - Minimum 5 minutes per session (0 XP if < 5 min)
 * - Base XP = 10 × log₁₀(1 + minutes)
 * - Bonus: +1 XP per 10 pages (max +5 XP per session)
 * - Maximum: 40 XP per day (handled by RPC function)
 * 
 * @param durationMinutes Duration in minutes
 * @param pagesRead Number of pages read
 * @returns XP amount (0 if session < 5 minutes)
 */
export function calculateReadingXp(durationMinutes: number, pagesRead: number = 0): number {
  // Minimum 5 minutes required
  if (durationMinutes < 5) {
    return 0;
  }

  // Base XP from duration: 10 × log₁₀(1 + minutes)
  const baseXp = Math.round(10 * Math.log10(1 + durationMinutes));

  // Bonus from pages: +1 XP per 10 pages (max +5 XP)
  const pagesBonus = Math.min(5, Math.floor(pagesRead / 10));

  const totalXp = baseXp + pagesBonus;

  return totalXp;
}

