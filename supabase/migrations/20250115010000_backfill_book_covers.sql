-- Backfill missing book covers from openlibrary_cover_id or google_books_id
-- 
-- WHY: Some books.cover_url were set to NULL but have valid openlibrary_cover_id
-- or google_books_id. This script restores cover URLs from these sources.
--
-- IMPORTANT: Only updates rows where cover_url IS NULL to avoid overwriting
-- existing covers (including user-uploaded covers or manually set URLs).
--
-- Priority:
-- 1) OpenLibrary cover ID (if openlibrary_cover_id is present)
-- 2) Google Books cover (if google_books_id is present)

-- Step 1: Backfill from OpenLibrary cover_id (most reliable)
UPDATE public.books
SET cover_url = 'https://covers.openlibrary.org/b/id/' || openlibrary_cover_id::text || '-L.jpg?default=false'
WHERE cover_url IS NULL
  AND openlibrary_cover_id IS NOT NULL
  AND openlibrary_cover_id > 0;

-- Step 2: Backfill from Google Books ID (if OpenLibrary not available)
UPDATE public.books
SET cover_url = 'https://books.google.com/books/content?id=' || google_books_id || '&printsec=frontcover&img=1&zoom=1&source=gbs_api'
WHERE cover_url IS NULL
  AND google_books_id IS NOT NULL
  AND google_books_id != ''
  AND openlibrary_cover_id IS NULL; -- Only if OpenLibrary was not available

-- Log results (optional - for verification)
DO $$
DECLARE
  ol_updated_count integer;
  google_updated_count integer;
BEGIN
  SELECT COUNT(*) INTO ol_updated_count
  FROM public.books
  WHERE cover_url LIKE 'https://covers.openlibrary.org/b/id/%';

  SELECT COUNT(*) INTO google_updated_count
  FROM public.books
  WHERE cover_url LIKE 'https://books.google.com/books/content?id=%';

  RAISE NOTICE 'Backfill complete: % OpenLibrary covers, % Google Books covers', 
    ol_updated_count, google_updated_count;
END $$;
