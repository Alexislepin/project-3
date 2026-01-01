/**
 * Leveling system utilities
 * 
 * XP required formula: 50 × N²
 * - Level 1: 0-199 XP (starts at 0, next level at 200)
 * - Level 2: 200-1249 XP (starts at 200, next level at 1250)
 * - Level 3: 1250-4999 XP (starts at 1250, next level at 5000)
 * - Level N: starts at 50×N², ends at 50×(N+1)²-1
 */

export interface LevelProgress {
  level: number;
  intoLevel: number; // XP earned in current level (from start of level to current)
  needed: number; // XP needed to reach next level
  remaining: number; // XP remaining to next level
  progress: number; // Progress percentage (0-100)
  xpTotal: number;
}

/**
 * Get XP required to reach a specific level
 * @param level Target level
 * @returns XP required to reach that level (start XP of that level)
 */
export function getXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * level * level;
}

/**
 * Calculate level from total XP
 * @param xpTotal Total XP accumulated
 * @returns Level number (starts at 1)
 */
export function getLevelFromXp(xpTotal: number): number {
  if (xpTotal < 0) return 1;
  if (xpTotal < 200) return 1; // Level 1: 0-199 XP
  
  // Level N starts at 50×N²
  // Find the largest N such that 50×N² <= xpTotal
  // Then level = N
  // We solve: 50×N² <= xpTotal => N <= sqrt(xpTotal/50)
  const level = Math.floor(Math.sqrt(xpTotal / 50));
  
  // Ensure we're in the correct level range
  // Level N: [50×N², 50×(N+1)²)
  const levelStart = 50 * level * level;
  const nextLevelStart = 50 * (level + 1) * (level + 1);
  
  if (xpTotal >= levelStart && xpTotal < nextLevelStart) {
    return level;
  }
  
  // Fallback: if somehow we're outside the range, calculate directly
  return Math.max(1, Math.floor(Math.sqrt(xpTotal / 50)));
}

/**
 * Calculate level progress details
 * @param xpTotal Total XP accumulated
 * @returns Level progress information
 */
export function getLevelProgress(xpTotal: number): LevelProgress {
  if (xpTotal < 0) xpTotal = 0;

  const level = getLevelFromXp(xpTotal);
  const levelStart = getXpForLevel(level); // XP at start of current level
  const nextLevelStart = getXpForLevel(level + 1); // XP at start of next level
  
  // XP earned in current level (from start of level to current)
  const intoLevel = Math.max(0, xpTotal - levelStart);
  
  // XP needed to reach next level (total needed, not remaining)
  const needed = nextLevelStart - levelStart;
  
  // XP remaining to next level
  const remaining = Math.max(0, nextLevelStart - xpTotal);
  
  // Progress percentage (0-100)
  const progress = needed > 0 ? Math.min(100, Math.max(0, (intoLevel / needed) * 100)) : 100;

  return {
    level,
    intoLevel,
    needed,
    remaining,
    progress,
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

