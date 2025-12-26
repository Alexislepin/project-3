-- Add OpenLibrary keys to books table for better description fetching
-- Migration: 20250125000000_add_openlibrary_keys_to_books.sql

ALTER TABLE books
ADD COLUMN IF NOT EXISTS openlibrary_work_key text NULL,
ADD COLUMN IF NOT EXISTS openlibrary_edition_key text NULL;

-- Add comment for documentation
COMMENT ON COLUMN books.openlibrary_work_key IS 'OpenLibrary work key (e.g., /works/OL123456W) for fetching descriptions';
COMMENT ON COLUMN books.openlibrary_edition_key IS 'OpenLibrary edition key (e.g., /books/OL123456M) for fetching descriptions';

