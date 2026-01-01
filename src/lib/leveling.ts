/**
 * Leveling system utilities
 * 
 * NEW XP required formula: 50 × N²
 * - Level 1: 0-199 XP (50 × 1² = 50, but we start at 0)
 * - Level 2: 200-449 XP (50 × 2² = 200)
 * - Level 3: 450-799 XP (50 × 3² = 450)
 * - Level 5: 1,250-1,799 XP (50 × 5² = 1,250)
 * - Level 10: 5,000-5,449 XP (50 × 10² = 5,000)
 * - Level 20: 20,000-20,449 XP (50 × 20² = 20,000)
 * 
 * Formula: XP required for level N = 50 × N²
 * To find level from XP: solve 50 × N² = XP => N = sqrt(XP / 50)
 */

export interface LevelProgress {
  level: number;
  currentXpInLevel: number;
  requiredForNext: number;
  percent: number;
  xpTotal: number;
}

/**
 * Calculate XP required to reach a specific level
 * @param level Target level
 * @returns XP required to reach that level
 */
export function getXpRequiredForLevel(level: number): number {
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
  if (xpTotal === 0) return 1;
  
  // Solve: 50 × N² = XP => N = sqrt(XP / 50)
  // Level is the floor of this calculation + 1
  const level = Math.floor(Math.sqrt(xpTotal / 50)) + 1;
  
  // Ensure minimum level is 1
  return Math.max(1, level);
}

/**
 * Calculate level progress details
 * @param xpTotal Total XP accumulated
 * @returns Level progress information
 */
export function getLevelProgress(xpTotal: number): LevelProgress {
  if (xpTotal < 0) xpTotal = 0;

  const level = getLevelFromXp(xpTotal);
  const xpForCurrentLevel = getXpRequiredForLevel(level); // XP required to reach current level
  const xpForNextLevel = getXpRequiredForLevel(level + 1); // XP required to reach next level
  const currentXpInLevel = xpTotal - xpForCurrentLevel; // XP in current level
  const requiredForNext = xpForNextLevel - xpForCurrentLevel; // XP needed to reach next level
  const percent = requiredForNext > 0 
    ? Math.min(100, Math.max(0, (currentXpInLevel / requiredForNext) * 100))
    : 100;

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

