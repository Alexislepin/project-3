/**
 * One-time XP backfill script for existing users
 * 
 * This script:
 * 1. Fetches all users from user_profiles
 * 2. For each user, fetches all reading activities
 * 3. Calculates XP using the same logic as production
 * 4. Applies daily cap of 40 XP/day (UTC-based)
 * 5. Updates user_profiles.xp_total
 * 
 * Usage:
 *   npm run backfill:xp          # Dry run (default)
 *   npm run backfill:xp -- --run  # Actually update database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Calculate reading XP for a single activity
 * Formula: 10 × log₁₀(1 + minutes)
 * Bonus: +1 XP per 10 pages (max +5 XP)
 * Minimum: 5 minutes required
 */
function calculateReadingXp(durationMinutes: number, pagesRead: number): number {
  if (durationMinutes < 5) return 0;
  
  // Base XP from duration (logarithmic)
  const baseXp = Math.round(10 * Math.log10(1 + durationMinutes));
  
  // Bonus from pages: +1 XP per 10 pages, max +5 XP
  const pagesBonus = Math.min(5, Math.floor((pagesRead || 0) / 10));
  
  return baseXp + pagesBonus;
}

/**
 * Calculate total XP for a user from all reading activities
 * Applies daily cap of 40 XP/day (UTC-based)
 */
async function calculateUserXp(userId: string): Promise<number> {
  // Fetch all reading activities
  const { data: activities, error } = await supabase
    .from('activities')
    .select('created_at, duration_minutes, pages_read')
    .eq('user_id', userId)
    .eq('type', 'reading')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[${userId}] Error fetching activities:`, error);
    return 0;
  }

  if (!activities || activities.length === 0) {
    return 0;
  }

  // Group activities by UTC date and calculate XP per day
  const dailyXp = new Map<string, number>(); // date (YYYY-MM-DD) -> total XP for that day

  for (const activity of activities) {
    if (!activity.created_at) continue;
    
    // Get UTC date (YYYY-MM-DD)
    const date = new Date(activity.created_at);
    const utcDate = date.toISOString().split('T')[0];
    
    // Calculate XP for this activity
    const xp = calculateReadingXp(
      activity.duration_minutes || 0,
      activity.pages_read || 0
    );
    
    // Add to daily total (with cap)
    const currentDailyXp = dailyXp.get(utcDate) || 0;
    const newDailyXp = Math.min(40, currentDailyXp + xp); // Cap at 40 XP/day
    dailyXp.set(utcDate, newDailyXp);
  }

  // Sum all daily XP
  let totalXp = 0;
  for (const xp of dailyXp.values()) {
    totalXp += xp;
  }

  return totalXp;
}

/**
 * Main backfill function
 */
async function backfillXp(dryRun: boolean = true) {
  console.log(`\n🚀 Starting XP backfill (${dryRun ? 'DRY RUN' : 'LIVE'})...\n`);

  // Fetch all users
  const { data: users, error: usersError } = await supabase
    .from('user_profiles')
    .select('id, username, display_name, xp_total');

  if (usersError) {
    console.error('❌ Error fetching users:', usersError);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('ℹ️  No users found');
    return;
  }

  console.log(`📊 Found ${users.length} users\n`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const progress = `[${i + 1}/${users.length}]`;

    try {
      const calculatedXp = await calculateUserXp(user.id);
      const currentXp = user.xp_total || 0;

      if (calculatedXp === currentXp) {
        console.log(`${progress} ${user.display_name || user.username || user.id}: ${calculatedXp} XP (unchanged)`);
        unchanged++;
        continue;
      }

      console.log(
        `${progress} ${user.display_name || user.username || user.id}: ` +
        `${currentXp} → ${calculatedXp} XP (${calculatedXp > currentXp ? '+' : ''}${calculatedXp - currentXp})`
      );

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ xp_total: calculatedXp })
          .eq('id', user.id);

        if (updateError) {
          console.error(`  ❌ Error updating:`, updateError);
          errors++;
        } else {
          updated++;
        }
      } else {
        updated++; // Count as would-be update in dry run
      }
    } catch (error: any) {
      console.error(`${progress} ${user.display_name || user.username || user.id}: ❌ Error:`, error.message);
      errors++;
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log(`   Errors: ${errors}`);
  
  if (dryRun) {
    console.log(`\n⚠️  This was a DRY RUN. Use --run to actually update the database.`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--run');

// Run backfill
backfillXp(dryRun)
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

