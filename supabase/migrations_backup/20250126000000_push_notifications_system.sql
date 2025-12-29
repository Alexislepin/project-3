/*
  # Push Notifications System - Complete Implementation

  This migration creates the complete infrastructure for iOS push notifications:
  1. Tables: notifications, user_devices, notification_deliveries
  2. Columns in user_profiles: push preferences and reading goals
  3. RLS policies for all tables
  4. Indexes for performance
  5. Triggers for social notifications (like/comment/follow)

  Last Updated: 2025-01-26
*/

-- ============================================================
-- 1. EXTEND user_profiles WITH PUSH PREFERENCES
-- ============================================================

DO $$
BEGIN
  -- Add push notification preferences
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'push_enabled_social'
  ) THEN
    ALTER TABLE public.user_profiles 
    ADD COLUMN push_enabled_social boolean DEFAULT true,
    ADD COLUMN push_enabled_reminders boolean DEFAULT true,
    ADD COLUMN reading_preference_window text CHECK (reading_preference_window IN ('morning', 'lunch', 'evening')),
    ADD COLUMN daily_goal_minutes integer DEFAULT 20,
    ADD COLUMN timezone text DEFAULT 'UTC',
    ADD COLUMN books_goal_per_month integer DEFAULT 1;
  END IF;
END $$;

-- ============================================================
-- 2. CREATE user_devices TABLE (APNs tokens)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  device_token text NOT NULL, -- APNs token
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id text, -- Optional: device identifier
  app_version text, -- Optional: app version for debugging
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now(),
  UNIQUE(user_id, device_token) -- One token per user per device
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_token ON public.user_devices(device_token);

-- ============================================================
-- 3. CREATE notifications TABLE (in-app notification history)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'reminder', 'goal_achieved', 'streak')),
  actor_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL, -- Who triggered (null for system)
  target_type text, -- 'activity', 'profile', 'goal', etc.
  target_id uuid, -- ID of the target (activity_id, etc.)
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}', -- Additional payload for deep linking
  read_at timestamptz, -- When user read it
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type, created_at DESC);

-- ============================================================
-- 4. CREATE notification_deliveries TABLE (prevent duplicates)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL, -- 'reminder', 'like', etc.
  date_key date NOT NULL, -- YYYY-MM-DD for daily reminders
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, notification_type, date_key) -- One delivery per type per day
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_date ON public.notification_deliveries(user_id, date_key DESC);

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- Enable RLS
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- user_devices: Users can only see/manage their own devices
DROP POLICY IF EXISTS "Users can view own devices" ON public.user_devices;
CREATE POLICY "Users can view own devices"
  ON public.user_devices FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own devices" ON public.user_devices;
CREATE POLICY "Users can insert own devices"
  ON public.user_devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own devices" ON public.user_devices;
CREATE POLICY "Users can update own devices"
  ON public.user_devices FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own devices" ON public.user_devices;
CREATE POLICY "Users can delete own devices"
  ON public.user_devices FOR DELETE
  USING (auth.uid() = user_id);

-- notifications: Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can insert notifications (for triggers/edge functions)
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true); -- Edge functions use service role

-- notification_deliveries: Service role only (internal tracking)
DROP POLICY IF EXISTS "Service role can manage deliveries" ON public.notification_deliveries;
CREATE POLICY "Service role can manage deliveries"
  ON public.notification_deliveries FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 6. TRIGGERS FOR SOCIAL NOTIFICATIONS
-- ============================================================

-- Function to create notification on activity_reaction (like)
CREATE OR REPLACE FUNCTION public.handle_activity_reaction_notification()
RETURNS trigger AS $$
DECLARE
  activity_owner_id uuid;
  actor_username text;
  activity_title text;
BEGIN
  -- Get activity owner
  SELECT user_id INTO activity_owner_id
  FROM public.activities
  WHERE id = NEW.activity_id;

  -- Don't notify if user likes their own activity
  IF activity_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get actor username
  SELECT username INTO actor_username
  FROM public.user_profiles
  WHERE id = NEW.user_id;

  -- Get activity title
  SELECT title INTO activity_title
  FROM public.activities
  WHERE id = NEW.activity_id;

  -- Create notification
  INSERT INTO public.notifications (
    user_id,
    type,
    actor_id,
    target_type,
    target_id,
    title,
    body,
    data
  ) VALUES (
    activity_owner_id,
    'like',
    NEW.user_id,
    'activity',
    NEW.activity_id,
    'LEXU.',
    actor_username || ' a aimé ton activité',
    jsonb_build_object(
      'activity_id', NEW.activity_id,
      'actor_id', NEW.user_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on activity_reactions
DROP TRIGGER IF EXISTS on_activity_reaction_created ON public.activity_reactions;
CREATE TRIGGER on_activity_reaction_created
  AFTER INSERT ON public.activity_reactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_activity_reaction_notification();

-- Function to create notification on activity_comment
CREATE OR REPLACE FUNCTION public.handle_activity_comment_notification()
RETURNS trigger AS $$
DECLARE
  activity_owner_id uuid;
  actor_username text;
BEGIN
  -- Get activity owner
  SELECT user_id INTO activity_owner_id
  FROM public.activities
  WHERE id = NEW.activity_id;

  -- Don't notify if user comments on their own activity
  IF activity_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get actor username
  SELECT username INTO actor_username
  FROM public.user_profiles
  WHERE id = NEW.user_id;

  -- Create notification
  INSERT INTO public.notifications (
    user_id,
    type,
    actor_id,
    target_type,
    target_id,
    title,
    body,
    data
  ) VALUES (
    activity_owner_id,
    'comment',
    NEW.user_id,
    'activity',
    NEW.activity_id,
    'LEXU.',
    actor_username || ' a commenté ton activité',
    jsonb_build_object(
      'activity_id', NEW.activity_id,
      'comment_id', NEW.id,
      'actor_id', NEW.user_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on activity_comments
DROP TRIGGER IF EXISTS on_activity_comment_created ON public.activity_comments;
CREATE TRIGGER on_activity_comment_created
  AFTER INSERT ON public.activity_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_activity_comment_notification();

-- Function to create notification on follow
CREATE OR REPLACE FUNCTION public.handle_follow_notification()
RETURNS trigger AS $$
DECLARE
  actor_username text;
BEGIN
  -- Don't notify if user follows themselves
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  -- Get actor username
  SELECT username INTO actor_username
  FROM public.user_profiles
  WHERE id = NEW.follower_id;

  -- Create notification
  INSERT INTO public.notifications (
    user_id,
    type,
    actor_id,
    target_type,
    target_id,
    title,
    body,
    data
  ) VALUES (
    NEW.following_id,
    'follow',
    NEW.follower_id,
    'profile',
    NEW.follower_id,
    'LEXU.',
    actor_username || ' s''est abonné à toi',
    jsonb_build_object(
      'actor_id', NEW.follower_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on follows
DROP TRIGGER IF EXISTS on_follow_created ON public.follows;
CREATE TRIGGER on_follow_created
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.handle_follow_notification();

-- ============================================================
-- 7. HELPER FUNCTION: Check if reminder already sent today
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_reminder_been_sent_today(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  sent_today boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM public.notification_deliveries
    WHERE user_id = p_user_id
      AND notification_type = 'reminder'
      AND date_key = CURRENT_DATE
  ) INTO sent_today;
  
  RETURN COALESCE(sent_today, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. UPDATE TIMESTAMPS
-- ============================================================

-- Auto-update updated_at for user_devices
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_devices_updated_at ON public.user_devices;
CREATE TRIGGER update_user_devices_updated_at
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9. NOTIFY POSTGREST TO RELOAD SCHEMA
-- ============================================================

NOTIFY pgrst, 'reload schema';

