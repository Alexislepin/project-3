-- Change book_translations to use book_key (text) instead of book_id (uuid)
-- This allows caching translations for books not yet in the books table
-- Migration: 20250127000000_change_book_translations_to_book_key.sql

-- Drop existing constraints and indexes
DROP INDEX IF EXISTS idx_book_translations_book_lang;
ALTER TABLE book_translations DROP CONSTRAINT IF EXISTS book_translations_book_id_fkey;

-- Add new book_key column
ALTER TABLE book_translations
ADD COLUMN IF NOT EXISTS book_key text;

-- Migrate existing data: convert book_id UUIDs to book_key format
-- For books in the books table, use isbn:... or uuid:... format
UPDATE book_translations bt
SET book_key = COALESCE(
  CASE 
    WHEN b.isbn IS NOT NULL THEN 'isbn:' || b.isbn
    ELSE 'uuid:' || bt.book_id::text
  END,
  'uuid:' || bt.book_id::text
)
FROM books b
WHERE bt.book_id = b.id;

-- For any remaining rows without a match, use uuid: format
UPDATE book_translations
SET book_key = 'uuid:' || book_id::text
WHERE book_key IS NULL;

-- Make book_key NOT NULL
ALTER TABLE book_translations
ALTER COLUMN book_key SET NOT NULL;

-- Drop old book_id column
ALTER TABLE book_translations
DROP COLUMN book_id;

-- Update unique constraint to use book_key
ALTER TABLE book_translations
DROP CONSTRAINT IF EXISTS book_translations_book_id_lang_key;

ALTER TABLE book_translations
ADD CONSTRAINT book_translations_book_key_lang_key UNIQUE(book_key, lang);

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_book_translations_book_key_lang ON book_translations(book_key, lang);

-- Update comment
COMMENT ON TABLE book_translations IS 'Cache for translated book descriptions (book_key, lang, text). book_key format: isbn:..., ol:/works/..., uuid:..., etc.';
COMMENT ON COLUMN book_translations.book_key IS 'Stable book identifier (isbn:..., ol:/works/..., uuid:..., etc.)';

