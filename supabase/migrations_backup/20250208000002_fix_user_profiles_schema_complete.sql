-- Migration: Fix user_profiles schema - Add all missing columns
-- Date: 2025-02-08
-- IMPORTANT: Execute this in Supabase SQL Editor, then reload schema cache

-- Add onboarding_completed if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add has_password if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'has_password'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN has_password boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Ensure username is nullable and has unique constraint (case-insensitive)
DO $$
BEGIN
  -- Make username nullable if not already
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'username'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_profiles
    ALTER COLUMN username DROP NOT NULL;
  END IF;

  -- Drop existing unique constraint/index if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_profiles_username_key'
  ) THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_username_key;
  END IF;

  -- Create unique index on username (case-insensitive, ignoring nulls)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'user_profiles' 
    AND indexname = 'user_profiles_username_lower_key'
  ) THEN
    CREATE UNIQUE INDEX user_profiles_username_lower_key 
    ON public.user_profiles (lower(username))
    WHERE username IS NOT NULL;
  END IF;
END $$;

-- Ensure display_name is nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'display_name'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_profiles
    ALTER COLUMN display_name DROP NOT NULL;
  END IF;
END $$;

-- Ensure bio is nullable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'bio'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN bio text;
  END IF;
END $$;

-- Ensure avatar_url is nullable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN avatar_url text;
  END IF;
END $$;

-- Ensure interests exists with default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'interests'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN interests text[] NOT NULL DEFAULT '{}'::text[];
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'interests'
    AND column_default IS NULL
  ) THEN
    ALTER TABLE public.user_profiles
    ALTER COLUMN interests SET DEFAULT '{}'::text[];
    UPDATE public.user_profiles SET interests = '{}'::text[] WHERE interests IS NULL;
    ALTER TABLE public.user_profiles
    ALTER COLUMN interests SET NOT NULL;
  END IF;
END $$;

-- Ensure xp_total exists with default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'xp_total'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN xp_total integer NOT NULL DEFAULT 0;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'xp_total'
    AND column_default IS NULL
  ) THEN
    ALTER TABLE public.user_profiles
    ALTER COLUMN xp_total SET DEFAULT 0;
    UPDATE public.user_profiles SET xp_total = 0 WHERE xp_total IS NULL;
    ALTER TABLE public.user_profiles
    ALTER COLUMN xp_total SET NOT NULL;
  END IF;
END $$;

-- Ensure current_streak exists with default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'current_streak'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD COLUMN current_streak integer NOT NULL DEFAULT 0;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_profiles' 
    AND column_name = 'current_streak'
    AND column_default IS NULL
  ) THEN
    ALTER TABLE public.user_profiles
    ALTER COLUMN current_streak SET DEFAULT 0;
    UPDATE public.user_profiles SET current_streak = 0 WHERE current_streak IS NULL;
    ALTER TABLE public.user_profiles
    ALTER COLUMN current_streak SET NOT NULL;
  END IF;
END $$;

-- Update has_password for existing users who have email/password auth
-- This is a best-effort update based on auth.users metadata
UPDATE public.user_profiles up
SET has_password = true
WHERE EXISTS (
  SELECT 1 
  FROM auth.users au
  WHERE au.id = up.id
    AND au.encrypted_password IS NOT NULL 
    AND au.encrypted_password != ''
);

-- Ensure RLS is enabled
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.user_profiles;

-- Create RLS policies
-- SELECT: Users can view their own profile + public profiles
CREATE POLICY "Users can view own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Allow public read for social features (optional - can be restricted if needed)
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- CRITICAL: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Add comments for documentation
COMMENT ON COLUMN public.user_profiles.onboarding_completed IS 'Whether the user has completed the profile onboarding wizard';
COMMENT ON COLUMN public.user_profiles.has_password IS 'Whether the user has set a password (false for OAuth-only users)';

