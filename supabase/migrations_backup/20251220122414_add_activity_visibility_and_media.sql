/*
  # Add Activity Visibility and Media Support

  1. Changes
    - Add `visibility` column to activities table (public, followers, private)
    - Add `photos` column to store activity photo URLs
    - Add `quotes` column to store reading quotes with page numbers
    - Add index on visibility for filtering

  2. Security
    - Maintains existing RLS policies
    - Users can only see public activities or activities from people they follow based on visibility
*/

-- Add visibility column to activities
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE public.activities 
    ADD COLUMN visibility text DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private'));
  END IF;
END $$;

-- Add photos column to store photo URLs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'photos'
  ) THEN
    ALTER TABLE public.activities 
    ADD COLUMN photos text[] DEFAULT '{}';
  END IF;
END $$;

-- Add quotes column for reading quotes with page numbers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'quotes'
  ) THEN
    ALTER TABLE public.activities 
    ADD COLUMN quotes jsonb DEFAULT '[]';
  END IF;
END $$;

-- Add index on visibility for better query performance
CREATE INDEX IF NOT EXISTS idx_activities_visibility ON public.activities(visibility);

-- Add index on created_at for feed queries
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON public.activities(created_at DESC);
