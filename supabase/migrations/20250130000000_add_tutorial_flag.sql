/*
  # Add Tutorial Completion Flag

  1. Changes
    - Add `has_completed_tutorial` boolean column to `user_profiles`
    - Default to `false` for new users
    - Existing users default to `true` (they've already used the app)

  2. Security
    - Maintains existing RLS policies
*/

-- Add tutorial completion flag
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS has_completed_tutorial boolean DEFAULT false;

-- Set existing users to true (they've already used the app)
UPDATE public.user_profiles
SET has_completed_tutorial = true
WHERE has_completed_tutorial IS NULL OR has_completed_tutorial = false;

-- Set default to false for new users
ALTER TABLE public.user_profiles
ALTER COLUMN has_completed_tutorial SET DEFAULT false;

