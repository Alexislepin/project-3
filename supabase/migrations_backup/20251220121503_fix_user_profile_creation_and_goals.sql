/*
  # Fix User Profile Creation and Reading Goals

  1. Changes
    - Create a trigger function to automatically create user_profile when auth user signs up
    - Update user_goals type constraint to include new reading goal types
    - Ensure existing users without profiles get one created

  2. Security
    - Maintains existing RLS policies
*/

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substring(new.id::text from 1 for 8)),
    COALESCE(new.raw_user_meta_data->>'display_name', 'User')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop existing constraint on user_goals
ALTER TABLE public.user_goals DROP CONSTRAINT IF EXISTS user_goals_type_check;

-- Add new constraint with updated goal types
ALTER TABLE public.user_goals ADD CONSTRAINT user_goals_type_check 
  CHECK (type IN (
    'daily_pages', 
    'weekly_workouts', 
    'daily_time', 
    'weekly_books',
    'daily_15min',
    'daily_30min',
    'daily_60min',
    'weekly_pages'
  ));

-- Create profiles for existing auth users without profiles
DO $$
DECLARE
  auth_user RECORD;
BEGIN
  FOR auth_user IN 
    SELECT au.id, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.user_profiles up ON au.id = up.id
    WHERE up.id IS NULL
  LOOP
    INSERT INTO public.user_profiles (id, username, display_name)
    VALUES (
      auth_user.id,
      COALESCE(auth_user.raw_user_meta_data->>'username', 'user_' || substring(auth_user.id::text from 1 for 8)),
      COALESCE(auth_user.raw_user_meta_data->>'display_name', 'User')
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
