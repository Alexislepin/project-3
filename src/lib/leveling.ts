/**
 * Leveling system utilities
 * 
 * XP required formula: level * 100
 * - Level 1: 0-99 XP
 * - Level 2: 100-199 XP
 * - Level 3: 200-299 XP
 * etc.
 */

export interface LevelProgress {
  level: number;
  currentXpInLevel: number;
  requiredForNext: number;
  percent: number;
  xpTotal: number;
}

/**
 * Calculate level from total XP
 * @param xpTotal Total XP accumulated
 * @returns Level number (starts at 1)
 */
export function getLevelFromXp(xpTotal: number): number {
  if (xpTotal < 0) return 1;
  // Level 1 = 0-99, Level 2 = 100-199, etc.
  // Formula: level = floor(xpTotal / 100) + 1
  return Math.floor(xpTotal / 100) + 1;
}

/**
 * Calculate level progress details
 * @param xpTotal Total XP accumulated
 * @returns Level progress information
 */
export function getLevelProgress(xpTotal: number): LevelProgress {
  if (xpTotal < 0) xpTotal = 0;

  const level = getLevelFromXp(xpTotal);
  const xpForCurrentLevel = (level - 1) * 100; // XP required to reach current level
  const currentXpInLevel = xpTotal - xpForCurrentLevel; // XP in current level
  const requiredForNext = level * 100; // XP required to reach next level
  const percent = Math.min(100, Math.max(0, (currentXpInLevel / 100) * 100));

  return {
    level,
    currentXpInLevel,
    requiredForNext,
    percent,
    xpTotal,
  };
}

/**
 * Format XP number for display
 */
export function formatXp(xp: number): string {
  if (xp >= 1000000) {
    return `${(xp / 1000000).toFixed(1)}M`;
  }
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1)}K`;
  }
  return xp.toString();
}

