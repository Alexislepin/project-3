-- Migration: Ensure activity_reactions table has correct schema
-- Fix: Remove 'type' column if it exists (not in schema) and ensure unique constraint

-- 1) Drop 'type' column if it exists (it shouldn't be there according to schema)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_reactions' 
    AND column_name = 'type'
  ) THEN
    ALTER TABLE public.activity_reactions DROP COLUMN type;
  END IF;
END $$;

-- 2) Ensure unique constraint exists (one reaction per user per activity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'activity_reactions_activity_id_user_id_key'
  ) THEN
    ALTER TABLE public.activity_reactions
    ADD CONSTRAINT activity_reactions_activity_id_user_id_key
    UNIQUE (activity_id, user_id);
  END IF;
END $$;

-- 3) Ensure created_at has default
ALTER TABLE public.activity_reactions
  ALTER COLUMN created_at SET DEFAULT now();

