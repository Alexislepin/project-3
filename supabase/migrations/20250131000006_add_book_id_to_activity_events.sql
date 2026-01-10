/*
  # Add book_id to activity_events

  1. Changes
    - Add `book_id` column to `activity_events` table (nullable UUID, references books.id)
    - Add index on `book_id` for performance
    - Add index on `(event_type, created_at DESC)` for feed queries

  2. Security
    - Maintains existing RLS policies
    - book_id is nullable to support legacy events that only have book_key
*/

-- Add book_id column to activity_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activity_events' AND column_name = 'book_id'
  ) THEN
    ALTER TABLE public.activity_events 
    ADD COLUMN book_id uuid REFERENCES public.books(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index on book_id for performance
CREATE INDEX IF NOT EXISTS idx_activity_events_book_id ON public.activity_events(book_id);

-- Add composite index for feed queries (event_type + created_at)
CREATE INDEX IF NOT EXISTS idx_activity_events_type_created ON public.activity_events(event_type, created_at DESC);

