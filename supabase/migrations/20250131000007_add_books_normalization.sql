/*
  # Add Books Normalization and Indexes

  1. Changes
    - Add normalized columns: `title_norm`, `author_norm`, `updated_at` to `books` table
    - Normalize existing ISBN values (remove hyphens/spaces)
    - Add unique indexes on identifiers (ISBN, google_books_id, openlibrary keys)
    - Create `normalize_text()` function for text normalization
    - Add trigger to auto-normalize on INSERT/UPDATE

  2. Security
    - Maintains existing RLS policies
    - Normalized columns are for internal use (search, deduplication)
*/

-- Enable unaccent extension if not already enabled
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1) Add normalized columns to books table
DO $$
BEGIN
  -- Add title_norm
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'title_norm'
  ) THEN
    ALTER TABLE public.books ADD COLUMN title_norm text;
  END IF;

  -- Add author_norm
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'author_norm'
  ) THEN
    ALTER TABLE public.books ADD COLUMN author_norm text;
  END IF;

  -- Add updated_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.books ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2) Create normalize_text function
CREATE OR REPLACE FUNCTION public.normalize_text(x text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF x IS NULL OR x = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN regexp_replace(
    trim(
      unaccent(lower(x))
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  );
END;
$$;

-- 3) Normalize existing ISBN values (remove hyphens and spaces, keep only digits and X)
UPDATE public.books
SET isbn = regexp_replace(isbn, '[^0-9X]', '', 'g')
WHERE isbn IS NOT NULL
  AND isbn ~ '[^0-9X]';

-- 4) Add unique index on ISBN (partial: only when not null)
DROP INDEX IF EXISTS books_isbn_unique;
CREATE UNIQUE INDEX books_isbn_unique 
ON public.books(isbn) 
WHERE isbn IS NOT NULL;

-- 5) Add unique partial indexes on external identifiers
-- google_books_id
DROP INDEX IF EXISTS books_google_books_id_unique;
CREATE UNIQUE INDEX books_google_books_id_unique 
ON public.books(google_books_id) 
WHERE google_books_id IS NOT NULL;

-- openlibrary_work_key
DROP INDEX IF EXISTS books_openlibrary_work_key_unique;
CREATE UNIQUE INDEX books_openlibrary_work_key_unique 
ON public.books(openlibrary_work_key) 
WHERE openlibrary_work_key IS NOT NULL;

-- openlibrary_edition_key (check if column exists first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'openlibrary_edition_key'
  ) THEN
    -- Drop existing index if any
    DROP INDEX IF EXISTS books_openlibrary_edition_key_unique;
    
    -- Create unique partial index
    CREATE UNIQUE INDEX books_openlibrary_edition_key_unique 
    ON public.books(openlibrary_edition_key) 
    WHERE openlibrary_edition_key IS NOT NULL;
  END IF;
END $$;

-- 6) Create trigger function for normalization
CREATE OR REPLACE FUNCTION public.books_normalize_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normalize title
  NEW.title_norm = public.normalize_text(NEW.title);
  
  -- Normalize author
  NEW.author_norm = public.normalize_text(NEW.author);
  
  -- Clean ISBN (remove hyphens and spaces, keep only digits and X)
  IF NEW.isbn IS NOT NULL THEN
    NEW.isbn = regexp_replace(NEW.isbn, '[^0-9X]', '', 'g');
  END IF;
  
  -- Update updated_at timestamp
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$;

-- 7) Create trigger
DROP TRIGGER IF EXISTS books_normalize_before_insert_update ON public.books;
CREATE TRIGGER books_normalize_before_insert_update
BEFORE INSERT OR UPDATE ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.books_normalize_trigger();

-- 8) Backfill normalized columns for existing rows
UPDATE public.books
SET 
  title_norm = public.normalize_text(title),
  author_norm = public.normalize_text(author),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE title_norm IS NULL OR author_norm IS NULL;

-- 9) Add index on normalized columns for search performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_books_title_norm ON public.books(title_norm);
CREATE INDEX IF NOT EXISTS idx_books_author_norm ON public.books(author_norm);

