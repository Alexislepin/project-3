/*
  # Add current_xp column to user_profiles for gamification
  
  1. Changes
    - Add current_xp integer column to user_profiles (default 0)
    - Optional: Add last_xp_at timestamp for tracking
  
  2. Security
    - No RLS changes needed (users can already update their own profiles)
*/

-- Add current_xp column
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS current_xp integer NOT NULL DEFAULT 0;

-- Optional: Add last_xp_at for tracking (can be used for anti-spam or analytics)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS last_xp_at timestamptz;

COMMENT ON COLUMN public.user_profiles.current_xp IS 'Total XP points earned by the user (gamification)';
COMMENT ON COLUMN public.user_profiles.last_xp_at IS 'Timestamp of last XP gain (for anti-spam/analytics)';

