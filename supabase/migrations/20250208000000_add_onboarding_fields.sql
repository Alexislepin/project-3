-- Migration: Add onboarding_completed and has_password to user_profiles
-- Date: 2025-02-08

-- Add onboarding_completed column (default false for existing users)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Add has_password column (default false for existing users)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS has_password boolean NOT NULL DEFAULT false;

-- Update has_password for existing users who have email/password auth
-- This is a best-effort update based on auth.users metadata
UPDATE public.user_profiles
SET has_password = true
WHERE id IN (
  SELECT id 
  FROM auth.users 
  WHERE encrypted_password IS NOT NULL 
    AND encrypted_password != ''
);

-- Ensure username has unique constraint (case-insensitive)
-- Drop existing constraint if it exists (might be named differently)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_profiles_username_key'
  ) THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_username_key;
  END IF;
END $$;

-- Create unique index on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_lower_key 
ON public.user_profiles (lower(username));

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.onboarding_completed IS 'Whether the user has completed the profile onboarding wizard';
COMMENT ON COLUMN public.user_profiles.has_password IS 'Whether the user has set a password (false for OAuth-only users)';

