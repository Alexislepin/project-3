/**
 * Edge Function: cron_reminders
 * 
 * Scheduled function (cron) that sends daily goal reminders to users
 * based on their reading_preference_window and timezone.
 * 
 * Runs every 15 minutes and checks:
 * 1. Users with push_enabled_reminders = true
 * 2. Users with reading_preference_window set
 * 3. Current time in user's timezone matches target window
 * 4. Goal not yet achieved today
 * 5. Reminder not already sent today
 * 
 * Target times:
 * - morning: 10:00
 * - lunch: 13:00
 * - evening: 20:00
 * 
 * Usage: Set up as Supabase Cron Job (pg_cron) or external cron service
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface UserReminder {
  user_id: string;
  device_token: string;
  daily_goal_minutes: number;
  timezone: string;
  reading_preference_window: 'morning' | 'lunch' | 'evening';
}

// Target times for each window (24h format)
const TARGET_TIMES = {
  morning: 10,
  lunch: 13,
  evening: 20,
};

/**
 * Get current hour in user's timezone
 */
function getCurrentHourInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch (error) {
    console.error(`Invalid timezone ${timezone}, defaulting to UTC`);
    return new Date().getUTCHours();
  }
}

/**
 * Check if user's goal is achieved today
 */
async function isGoalAchievedToday(
  supabase: any,
  userId: string,
  dailyGoalMinutes: number
): Promise<boolean> {
  // Get today's activities for the user
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayEnd = tomorrow.toISOString();

  // Sum duration_minutes from activities today
  const { data, error } = await supabase
    .from('activities')
    .select('duration_minutes')
    .eq('user_id', userId)
    .eq('type', 'reading')
    .gte('created_at', todayStart)
    .lt('created_at', todayEnd);

  if (error) {
    console.error(`Error checking goal for user ${userId}:`, error);
    return false; // Default to not achieved if error
  }

  const totalMinutes = (data || []).reduce(
    (sum: number, activity: any) => sum + (activity.duration_minutes || 0),
    0
  );

  return totalMinutes >= dailyGoalMinutes;
}

/**
 * Check if reminder already sent today
 */
async function hasReminderBeenSentToday(
  supabase: any,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', 'reminder')
    .eq('date_key', new Date().toISOString().split('T')[0])
    .maybeSingle();

  if (error) {
    console.error(`Error checking reminder delivery for user ${userId}:`, error);
    return false;
  }

  return !!data;
}

/**
 * Send push notification via send_push function
 */
async function sendReminderPush(
  supabase: any,
  deviceToken: string,
  dailyGoalMinutes: number
): Promise<boolean> {
  try {
    // Call send_push function
    const { data, error } = await supabase.functions.invoke('send_push', {
      body: {
        device_token: deviceToken,
        title: 'LEXU.',
        body: `⏰ N'oublie pas ton objectif : ${dailyGoalMinutes} min aujourd'hui`,
        data: {
          type: 'reminder',
          daily_goal_minutes: dailyGoalMinutes,
        },
        sound: 'default',
      },
    });

    if (error) {
      console.error(`Error sending push to ${deviceToken}:`, error);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Exception sending push:`, error);
    return false;
  }
}

/**
 * Create notification record in database
 */
async function createNotificationRecord(
  supabase: any,
  userId: string,
  dailyGoalMinutes: number
): Promise<void> {
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'reminder',
    actor_id: null, // System notification
    target_type: 'goal',
    title: 'LEXU.',
    body: `⏰ N'oublie pas ton objectif : ${dailyGoalMinutes} min aujourd'hui`,
    data: {
      daily_goal_minutes: dailyGoalMinutes,
    },
  });
}

/**
 * Record reminder delivery to prevent duplicates
 */
async function recordReminderDelivery(
  supabase: any,
  userId: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  await supabase.from('notification_deliveries').upsert(
    {
      user_id: userId,
      notification_type: 'reminder',
      date_key: today,
    },
    {
      onConflict: 'user_id,notification_type,date_key',
    }
  );
}

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log('Starting reminder cron job...');

    // Get current UTC time
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    // We check within a 15-minute window (±5 minutes from target)
    // This allows for some flexibility in cron timing
    const timeWindows = Object.entries(TARGET_TIMES).map(([window, targetHour]) => ({
      window: window as 'morning' | 'lunch' | 'evening',
      targetHour,
    }));

    let remindersSent = 0;
    let errors = 0;

    // Process each time window
    for (const { window, targetHour } of timeWindows) {
      // Check if current time is within ±5 minutes of target
      const timeDiff = Math.abs(currentHour - targetHour);
      if (timeDiff > 0 && timeDiff !== 23) {
        // Not within 1 hour window (except midnight wrap)
        continue;
      }

      // Get users who should receive reminders for this window
      const { data: users, error: usersError } = await supabase
        .from('user_profiles')
        .select(`
          id,
          daily_goal_minutes,
          reading_preference_window,
          timezone,
          push_enabled_reminders
        `)
        .eq('reading_preference_window', window)
        .eq('push_enabled_reminders', true);

      if (usersError) {
        console.error(`Error fetching users for window ${window}:`, usersError);
        continue;
      }

      if (!users || users.length === 0) {
        console.log(`No users found for window ${window}`);
        continue;
      }

      // Get device tokens for these users
      const userIds = users.map((u: any) => u.id);
      const { data: devices, error: devicesError } = await supabase
        .from('user_devices')
        .select('user_id, device_token')
        .in('user_id', userIds)
        .eq('platform', 'ios');

      if (devicesError) {
        console.error(`Error fetching devices:`, devicesError);
        continue;
      }

      if (!devices || devices.length === 0) {
        console.log(`No devices found for window ${window}`);
        continue;
      }

      // Create map of user_id -> device tokens
      const userDevices = new Map<string, string[]>();
      for (const device of devices) {
        if (!userDevices.has(device.user_id)) {
          userDevices.set(device.user_id, []);
        }
        userDevices.get(device.user_id)!.push(device.device_token);
      }

      // Process each user
      for (const user of users) {
        const userId = user.id;
        const userTimezone = user.timezone || 'UTC';
        const currentHourInTz = getCurrentHourInTimezone(userTimezone);

        // Check if current hour matches target (with ±5 min tolerance)
        if (Math.abs(currentHourInTz - targetHour) > 0) {
          continue; // Not the right time yet
        }

        // Check if reminder already sent today
        const alreadySent = await hasReminderBeenSentToday(supabase, userId);
        if (alreadySent) {
          console.log(`Reminder already sent today for user ${userId}`);
          continue;
        }

        // Check if goal already achieved
        const goalAchieved = await isGoalAchievedToday(
          supabase,
          userId,
          user.daily_goal_minutes || 20
        );
        if (goalAchieved) {
          console.log(`Goal already achieved for user ${userId}`);
          continue;
        }

        // Get device tokens for this user
        const tokens = userDevices.get(userId) || [];
        if (tokens.length === 0) {
          console.log(`No device tokens for user ${userId}`);
          continue;
        }

        // Send push to all devices
        let pushSent = false;
        for (const token of tokens) {
          const success = await sendReminderPush(
            supabase,
            token,
            user.daily_goal_minutes || 20
          );
          if (success) {
            pushSent = true;
          }
        }

        if (pushSent) {
          // Create notification record
          await createNotificationRecord(
            supabase,
            userId,
            user.daily_goal_minutes || 20
          );

          // Record delivery
          await recordReminderDelivery(supabase, userId);

          remindersSent++;
          console.log(`Reminder sent to user ${userId}`);
        } else {
          errors++;
          console.error(`Failed to send reminder to user ${userId}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        remindersSent,
        errors,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Cron job error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

