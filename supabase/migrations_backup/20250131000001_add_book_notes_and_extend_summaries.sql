/*
  # Add book_notes table and extend book_ai_summaries for v2 recap
  
  1. Changes
    - Create book_notes table for user notes/highlights per page
    - Extend book_ai_summaries with ultra_20s, takeaways, question columns
  
  2. Security
    - RLS enabled: users can only read/insert/update/delete their own notes
*/

-- A) Create book_notes table
CREATE TABLE IF NOT EXISTS public.book_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  page INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL,
  created_from TEXT NOT NULL DEFAULT 'manual' CHECK (created_from IN ('manual', 'import', 'ocr', 'quote')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_book_notes_user_book_page
ON public.book_notes(user_id, book_id, page);

-- Enable RLS
ALTER TABLE public.book_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own notes
CREATE POLICY "read_own_notes"
ON public.book_notes
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can insert their own notes
CREATE POLICY "insert_own_notes"
ON public.book_notes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own notes
CREATE POLICY "update_own_notes"
ON public.book_notes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own notes
CREATE POLICY "delete_own_notes"
ON public.book_notes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

COMMENT ON TABLE public.book_notes IS 'User notes and highlights per page for books';
COMMENT ON COLUMN public.book_notes.page IS 'Page number where the note was taken';
COMMENT ON COLUMN public.book_notes.note IS 'Note text (highlight, annotation, etc.)';
COMMENT ON COLUMN public.book_notes.created_from IS 'Source of the note: manual, import, ocr, quote';

-- B) Extend book_ai_summaries with v2 columns
ALTER TABLE public.book_ai_summaries
ADD COLUMN IF NOT EXISTS ultra_20s TEXT,
ADD COLUMN IF NOT EXISTS takeaways TEXT,
ADD COLUMN IF NOT EXISTS question TEXT;

-- Update mode CHECK constraint to include 'v2'
ALTER TABLE public.book_ai_summaries
DROP CONSTRAINT IF EXISTS book_ai_summaries_mode_check;

ALTER TABLE public.book_ai_summaries
ADD CONSTRAINT book_ai_summaries_mode_check
CHECK (mode IN ('global', 'chapters', 'bullets', 'v2'));

COMMENT ON COLUMN public.book_ai_summaries.ultra_20s IS 'Ultra-quick recap in 2-3 sentences (20 seconds read)';
COMMENT ON COLUMN public.book_ai_summaries.takeaways IS 'Key takeaways in bullet format (5 max)';
COMMENT ON COLUMN public.book_ai_summaries.question IS 'Question to get back into the book';

