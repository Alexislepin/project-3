/*
  # Add book_ai_summaries table for caching AI-generated reading recaps
  
  1. Changes
    - Create book_ai_summaries table to cache AI-generated recaps by user, book, and page
    - Support multiple modes: 'global', 'chapters', 'bullets'
    - Support multiple languages: 'fr', 'en'
    - Index for fast lookups by user, book, and upto_page
  
  2. Security
    - RLS enabled: users can only read/insert/update their own summaries
    - Edge Functions use service_role to bypass RLS for caching
*/

-- Create book_ai_summaries table
CREATE TABLE IF NOT EXISTS public.book_ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  upto_page INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('global', 'chapters', 'bullets')),
  language TEXT NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one summary per (user_id, book_id, mode, language, upto_page)
  UNIQUE(user_id, book_id, mode, language, upto_page)
);

-- Index for fast lookups (user, book, upto_page desc for cache queries)
CREATE INDEX IF NOT EXISTS idx_book_ai_summaries_lookup 
ON public.book_ai_summaries(user_id, book_id, mode, language, upto_page DESC);

-- Index for cleanup (optional: to remove old summaries)
CREATE INDEX IF NOT EXISTS idx_book_ai_summaries_created_at 
ON public.book_ai_summaries(created_at);

-- Enable RLS
ALTER TABLE public.book_ai_summaries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own summaries
CREATE POLICY "Users can read own summaries"
ON public.book_ai_summaries
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can insert their own summaries
CREATE POLICY "Users can insert own summaries"
ON public.book_ai_summaries
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own summaries
CREATE POLICY "Users can update own summaries"
ON public.book_ai_summaries
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.book_ai_summaries IS 'Cache for AI-generated reading recaps by user, book, and page';
COMMENT ON COLUMN public.book_ai_summaries.upto_page IS 'Page number up to which the recap is generated (no spoilers beyond)';
COMMENT ON COLUMN public.book_ai_summaries.mode IS 'Summary format: global (8-12 lines), chapters (by acts/sections), bullets (10 bullet points)';
COMMENT ON COLUMN public.book_ai_summaries.language IS 'Language of the summary (fr, en)';

