-- Make ISBN required and unique, auto-generate cover_url
-- Migration: Make ISBN required and unique

-- Ensure columns exist
ALTER TABLE books ADD COLUMN IF NOT EXISTS isbn text;
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_url text;

-- Create unique index on ISBN (allows nulls initially)
CREATE UNIQUE INDEX IF NOT EXISTS books_isbn_unique ON books (isbn) WHERE isbn IS NOT NULL;

-- Note: We'll make ISBN NOT NULL after backfilling existing records
-- For now, we enforce it at the application level

