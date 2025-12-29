-- Add language preference to user_profiles and create book_translations cache table
-- Migration: 20250126000000_add_lang_and_translations.sql

-- Add lang column to user_profiles (default 'fr')
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS lang text DEFAULT 'fr' CHECK (lang IN ('fr', 'en'));

-- Create book_translations cache table
CREATE TABLE IF NOT EXISTS book_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  lang text NOT NULL CHECK (lang IN ('fr', 'en')),
  text text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id, lang)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_book_translations_book_lang ON book_translations(book_id, lang);

-- Enable RLS
ALTER TABLE book_translations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for book_translations
-- Anyone can read translations (public cache)
CREATE POLICY "Anyone can read book_translations"
  ON book_translations
  FOR SELECT
  USING (true);

-- Only authenticated users can insert/update (via Edge Function with service role)
-- Note: Edge Functions use service role, so they bypass RLS
-- This policy is for direct client access (if needed)
CREATE POLICY "Authenticated users can insert book_translations"
  ON book_translations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update book_translations"
  ON book_translations
  FOR UPDATE
  TO authenticated
  USING (true);

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.lang IS 'User interface language preference (fr or en)';
COMMENT ON TABLE book_translations IS 'Cache for translated book descriptions (book_id, lang, text)';

