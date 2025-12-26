-- Create book_summaries table for caching generated summaries
CREATE TABLE IF NOT EXISTS book_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'google', 'openlibrary', etc.
  source_id TEXT NOT NULL, -- book.id from source (e.g., Google Books ID, OpenLibrary key)
  lang TEXT NOT NULL DEFAULT 'fr', -- 'fr', 'en', etc.
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one summary per (source, source_id, lang)
  UNIQUE(source, source_id, lang)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_book_summaries_lookup 
ON book_summaries(source, source_id, lang);

-- Index for cleanup (optional: to remove old summaries)
CREATE INDEX IF NOT EXISTS idx_book_summaries_created_at 
ON book_summaries(created_at);

-- RLS: Allow authenticated users to read summaries
ALTER TABLE book_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read summaries"
ON book_summaries
FOR SELECT
TO authenticated
USING (true);

-- RLS: Allow authenticated users to insert/update summaries (via Edge Function with service role)
-- Note: Edge Functions use service_role, so they bypass RLS
-- This policy is for direct client access if needed
CREATE POLICY "Allow authenticated users to insert summaries"
ON book_summaries
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update summaries"
ON book_summaries
FOR UPDATE
TO authenticated
USING (true);

COMMENT ON TABLE book_summaries IS 'Cache for AI-generated book summaries by language';
COMMENT ON COLUMN book_summaries.source IS 'Source of the book (google, openlibrary, etc.)';
COMMENT ON COLUMN book_summaries.source_id IS 'Book ID from the source system';
COMMENT ON COLUMN book_summaries.lang IS 'Language code (fr, en, etc.)';
COMMENT ON COLUMN book_summaries.summary IS 'Generated summary text (2-4 sentences)';

