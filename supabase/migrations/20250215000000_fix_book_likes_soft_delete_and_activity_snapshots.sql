/*
  # Fix Book Likes Soft Delete & Activity Events Snapshots

  This migration addresses 4 bugs:
  1. Enable re-liking books after unliking (soft delete with deleted_at)
  2. Ensure activity_events always has book metadata (snapshots)
  3. Remove blocking unique constraints on like_id
  4. Add like_id column to activity_events if missing

  1. Changes
    - Add `deleted_at` column to `book_likes` for soft delete support
    - Add `like_id` column to `activity_events` (nullable, references book_likes.id)
    - Add snapshot columns to `activity_events`: `book_title`, `book_author`, `book_cover_url`
    - Remove unique constraint on `like_id` in `activity_events` if it exists
    - Update indexes for soft delete queries

  2. Security
    - No RLS changes needed (existing policies remain)
    - All columns are nullable for backward compatibility
*/

-- ============================================================================
-- 1. Add deleted_at to book_likes (soft delete support)
-- ============================================================================
ALTER TABLE book_likes
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Add index for filtering active likes (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_book_likes_active 
ON book_likes(user_id, book_key, deleted_at) 
WHERE deleted_at IS NULL;

-- Add index for book_likes count queries (only active likes)
CREATE INDEX IF NOT EXISTS idx_book_likes_book_key_active 
ON book_likes(book_key, deleted_at) 
WHERE deleted_at IS NULL;

-- Comment
COMMENT ON COLUMN book_likes.deleted_at IS 'Soft delete timestamp. NULL = active like, NOT NULL = unliked';

-- ============================================================================
-- 2. Add like_id column to activity_events (if missing)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_events' 
    AND column_name = 'like_id'
  ) THEN
    ALTER TABLE activity_events
    ADD COLUMN like_id UUID NULL 
    REFERENCES book_likes(id) ON DELETE SET NULL;
    
    COMMENT ON COLUMN activity_events.like_id IS 'Reference to book_likes.id for the like that triggered this event (nullable)';
  END IF;
END $$;

-- Add index for like_id lookups
CREATE INDEX IF NOT EXISTS idx_activity_events_like_id 
ON activity_events(like_id) 
WHERE like_id IS NOT NULL;

-- ============================================================================
-- 3. Remove unique constraint on like_id if it exists (allows re-liking)
-- ============================================================================
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find constraint on like_id
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'activity_events'::regclass
    AND conname LIKE '%like_id%'
    AND contype = 'u'; -- unique constraint
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Dropped unique constraint: %', constraint_name;
  END IF;
END $$;

-- Also check for activity_events_like_id_key specifically
ALTER TABLE activity_events 
DROP CONSTRAINT IF EXISTS activity_events_like_id_key;

-- ============================================================================
-- 4. Add snapshot columns to activity_events (book metadata fallback)
-- ============================================================================
ALTER TABLE activity_events
ADD COLUMN IF NOT EXISTS book_title TEXT NULL,
ADD COLUMN IF NOT EXISTS book_author TEXT NULL,
ADD COLUMN IF NOT EXISTS book_cover_url TEXT NULL;

-- Add indexes for snapshot columns (optional, for queries)
CREATE INDEX IF NOT EXISTS idx_activity_events_book_title 
ON activity_events(book_title) 
WHERE book_title IS NOT NULL;

-- Comments
COMMENT ON COLUMN activity_events.book_title IS 'Snapshot of book.title at event creation time (fallback if books join fails)';
COMMENT ON COLUMN activity_events.book_author IS 'Snapshot of book.author at event creation time (fallback if books join fails)';
COMMENT ON COLUMN activity_events.book_cover_url IS 'Snapshot of book.cover_url at event creation time (fallback if books join fails)';

-- ============================================================================
-- 5. Ensure book_id is NOT NULL for book_like events (data integrity)
-- ============================================================================
-- Note: This is informational only - we can't enforce NOT NULL for existing NULL values
-- But we can add a CHECK constraint for new rows
ALTER TABLE activity_events
DROP CONSTRAINT IF EXISTS activity_events_book_like_requires_book_id;

ALTER TABLE activity_events
ADD CONSTRAINT activity_events_book_like_requires_book_id
CHECK (
  (event_type NOT IN ('book_like', 'like')) OR (book_id IS NOT NULL)
);

COMMENT ON CONSTRAINT activity_events_book_like_requires_book_id ON activity_events 
IS 'book_like events must have a book_id (enforced for new rows)';

-- ============================================================================
-- 6. Update existing book_likes: set deleted_at = NULL for all existing rows
-- ============================================================================
-- All existing likes should be active (not deleted)
UPDATE book_likes 
SET deleted_at = NULL 
WHERE deleted_at IS NULL; -- No-op, but ensures consistency

-- ============================================================================
-- 7. Migration summary
-- ============================================================================
-- ✅ book_likes.deleted_at added (soft delete)
-- ✅ activity_events.like_id added (FK to book_likes)
-- ✅ activity_events.book_title/author/cover_url added (snapshots)
-- ✅ Unique constraint on like_id removed (allows re-liking)
-- ✅ Indexes added for performance
-- ✅ CHECK constraint added for book_id on book_like events

