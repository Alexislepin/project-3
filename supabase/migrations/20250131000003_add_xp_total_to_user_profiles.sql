/*
  # Add xp_total column to user_profiles for leveling system
  
  1. Changes
    - Add xp_total bigint column to user_profiles (default 0)
    - Migrate existing current_xp values to xp_total if they exist
    - Keep current_xp for backward compatibility (can be removed later)
  
  2. Security
    - No RLS changes needed (users can already update their own profiles)
*/

-- Add xp_total column
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS xp_total bigint NOT NULL DEFAULT 0;

-- Migrate existing current_xp to xp_total if current_xp exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'current_xp'
  ) THEN
    UPDATE public.user_profiles
    SET xp_total = COALESCE(current_xp, 0)
    WHERE xp_total = 0 AND current_xp > 0;
  END IF;
END $$;

COMMENT ON COLUMN public.user_profiles.xp_total IS 'Total cumulative XP points for leveling system (bigint for large numbers)';

