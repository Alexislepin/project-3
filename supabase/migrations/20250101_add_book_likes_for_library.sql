-- Migration: Ensure book_likes table has book_id column for Library likes
-- This migration ensures book_likes table supports both book_key (primary) and book_id (for Library books)

-- Check if book_id column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'book_likes' AND column_name = 'book_id'
  ) THEN
    ALTER TABLE book_likes 
    ADD COLUMN book_id uuid REFERENCES books(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure unique constraint on (user_id, book_key) exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'book_likes_user_id_book_key_key'
  ) THEN
    ALTER TABLE book_likes 
    ADD CONSTRAINT book_likes_user_id_book_key_key UNIQUE (user_id, book_key);
  END IF;
END $$;

-- Add index on book_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_book_likes_book_id ON book_likes(book_id);

-- RLS policies (if not already exist)
-- SELECT: public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'book_likes' AND policyname = 'book_likes_select_public'
  ) THEN
    CREATE POLICY book_likes_select_public ON book_likes
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- INSERT: authenticated users can like
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'book_likes' AND policyname = 'book_likes_insert_authenticated'
  ) THEN
    CREATE POLICY book_likes_insert_authenticated ON book_likes
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- DELETE: users can unlike their own likes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'book_likes' AND policyname = 'book_likes_delete_own'
  ) THEN
    CREATE POLICY book_likes_delete_own ON book_likes
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

