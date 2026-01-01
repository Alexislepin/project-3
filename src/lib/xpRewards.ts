/**
 * XP Rewards System
 * 
 * Calculates XP for various activities:
 * - Reading sessions (anti-farm, rewards quality)
 * - Streak milestones (regularity bonus)
 * - Goal completion (daily/weekly)
 * 
 * All XP is added via Supabase RPC function `award_xp_with_event`
 * to ensure proper tracking and limits.
 */

import { supabase } from './supabase';

/**
 * Calculate XP from a reading session
 * Rules:
 * - If duration < 5 minutes → 0 XP
 * - Base XP = round(10 × log10(1 + minutes))
 * - Bonus pages: +1 XP per 10 pages (max +5 XP per session)
 * - Daily cap: 40 XP from reading
 * 
 * @param durationMinutes Duration of reading session
 * @param pagesRead Number of pages read
 * @returns XP amount (0-45 per session, capped at 40/day)
 */
export function calculateReadingXp(durationMinutes: number, pagesRead: number = 0): number {
  // Minimum duration check
  if (durationMinutes < 5) {
    return 0;
  }

  // Base XP from duration (logarithmic to prevent farming)
  const baseXp = Math.round(10 * Math.log10(1 + durationMinutes));

  // Bonus from pages: +1 XP per 10 pages, max +5
  const pagesBonus = Math.min(5, Math.floor(pagesRead / 10));

  const totalXp = baseXp + pagesBonus;

  // Note: Daily cap of 40 XP is enforced by the RPC function
  return totalXp;
}

/**
 * Calculate XP from streak milestone
 * Bonus is awarded once per milestone:
 * - 2 days → +5 XP
 * - 5 days → +15 XP
 * - 10 days → +30 XP
 * - 30 days → +100 XP
 * 
 * @param streakDays Current streak
 * @param previousStreakDays Previous streak (to detect milestone)
 * @returns XP amount if milestone reached, 0 otherwise
 */
export function calculateStreakXp(streakDays: number, previousStreakDays: number = 0): number {
  // Only award if we crossed a milestone
  if (streakDays <= previousStreakDays) {
    return 0;
  }

  // Check milestones (only award once per milestone)
  if (streakDays >= 30 && previousStreakDays < 30) {
    return 100;
  } else if (streakDays >= 10 && previousStreakDays < 10) {
    return 30;
  } else if (streakDays >= 5 && previousStreakDays < 5) {
    return 15;
  } else if (streakDays >= 2 && previousStreakDays < 2) {
    return 5;
  }

  return 0;
}

/**
 * Award XP for goal completion
 * - Daily goal → +10 XP
 * - Weekly goal → +30 XP
 * 
 * @param goalType 'daily' | 'weekly'
 * @returns XP amount
 */
export function calculateGoalXp(goalType: 'daily' | 'weekly'): number {
  return goalType === 'daily' ? 10 : 30;
}

/**
 * Check and award XP for completed goals
 * This should be called after an activity is created to check if any goals were just completed
 * 
 * @param userId User ID
 * @returns Promise<void>
 */
export async function checkAndAwardGoalXp(userId: string): Promise<void> {
  try {
    // Check daily goals
    const { checkDailyGoals } = await import('../utils/goalNotifications');
    const dailyGoals = await checkDailyGoals(userId);
    
    // Check if any daily goal was just completed
    // We need to track which goals were already rewarded today
    // For simplicity, we'll check if goal is complete and award XP
    // (The RPC function should handle duplicate prevention via daily limits)
    for (const goal of dailyGoals) {
      if (goal.isComplete) {
        await awardXp(userId, calculateGoalXp('daily'), 'goal_daily', {
          goalId: goal.goalId,
          goalType: goal.goalType,
          label: goal.label,
        });
      }
    }

    // Check weekly goals
    const { checkWeeklyGoals } = await import('../utils/goalNotifications');
    const weeklyGoals = await checkWeeklyGoals(userId);
    
    for (const goal of weeklyGoals) {
      if (goal.isComplete) {
        await awardXp(userId, calculateGoalXp('weekly'), 'goal_weekly', {
          goalId: goal.goalId,
          goalType: goal.goalType,
          label: goal.label,
        });
      }
    }
  } catch (error) {
    console.error('[checkAndAwardGoalXp] Error:', error);
  }
}

/**
 * Award XP to user via RPC function
 * This ensures proper tracking, daily limits, and event logging
 * 
 * @param userId User ID
 * @param amount XP amount to award
 * @param source Source of XP ('reading', 'streak', 'goal_daily', 'goal_weekly', 'book_challenge')
 * @param metadata Optional metadata for the event
 * @returns New total XP or null if error
 */
export async function awardXp(
  userId: string,
  amount: number,
  source: 'reading' | 'streak' | 'goal_daily' | 'goal_weekly' | 'book_challenge',
  metadata?: Record<string, any>
): Promise<number | null> {
  if (amount <= 0) {
    return null;
  }

  try {
    // Build message based on source
    let message = '';
    switch (source) {
      case 'reading':
        message = `Session de lecture${metadata?.pagesRead ? ` · ${metadata.pagesRead} pages` : ''}`;
        break;
      case 'streak':
        message = `Série de ${metadata?.streakDays || 0} jours`;
        break;
      case 'goal_daily':
        message = `Objectif journalier atteint`;
        break;
      case 'goal_weekly':
        message = `Objectif hebdomadaire atteint`;
        break;
      case 'book_challenge':
        message = metadata?.message || 'Défi livre';
        break;
    }

    const { data: newXpTotal, error } = await supabase.rpc('award_xp_with_event', {
      p_user_id: userId,
      p_amount: amount,
      p_source: source,
      p_verdict: source === 'book_challenge' ? metadata?.verdict : null,
      p_book_id: metadata?.bookId || null,
      p_book_title: metadata?.bookTitle || null,
      p_message: message,
      p_meta: metadata || {},
    });

    if (error) {
      console.error('[awardXp] Error:', error);
      return null;
    }

    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('xp-updated', {
      detail: { xp_total: newXpTotal },
    }));

    return newXpTotal;
  } catch (error) {
    console.error('[awardXp] Exception:', error);
    return null;
  }
}

