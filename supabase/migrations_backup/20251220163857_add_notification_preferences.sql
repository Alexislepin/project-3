/*
  # Add Notification Preferences

  1. Changes to user_profiles table
    - Add `notifications_enabled` (boolean) - Master switch for all notifications
    - Add `notification_time` (time) - Preferred time to receive daily goal reminders
    - Add `goal_reminder_enabled` (boolean) - Enable/disable goal reminders specifically
  
  2. Security
    - Users can only update their own notification preferences
*/

-- Add notification preference columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'notifications_enabled'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN notifications_enabled boolean DEFAULT false,
    ADD COLUMN notification_time time DEFAULT '20:00:00',
    ADD COLUMN goal_reminder_enabled boolean DEFAULT true;
  END IF;
END $$;