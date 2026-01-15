-- Repair existing public.book_covers table to match expected schema

-- 1) Ensure required columns exist (each ALTER TABLE statement must be separate)
DO $$
BEGIN
  -- Add book_key if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'book_key') THEN
    ALTER TABLE public.book_covers ADD COLUMN book_key text;
  END IF;

  -- Add storage_path if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'storage_path') THEN
    ALTER TABLE public.book_covers ADD COLUMN storage_path text;
  END IF;

  -- Add source if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'source') THEN
    ALTER TABLE public.book_covers ADD COLUMN source text DEFAULT 'user';
  END IF;

  -- Add width if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'width') THEN
    ALTER TABLE public.book_covers ADD COLUMN width integer;
  END IF;

  -- Add height if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'height') THEN
    ALTER TABLE public.book_covers ADD COLUMN height integer;
  END IF;

  -- Add created_by if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'created_by') THEN
    ALTER TABLE public.book_covers ADD COLUMN created_by uuid;
  END IF;

  -- Add created_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'created_at') THEN
    ALTER TABLE public.book_covers ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;

  -- Add updated_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'book_covers' 
                 AND column_name = 'updated_at') THEN
    ALTER TABLE public.book_covers ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2) Set default values for existing rows where needed
UPDATE public.book_covers
SET source = COALESCE(source, 'user')
WHERE source IS NULL;

UPDATE public.book_covers
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

UPDATE public.book_covers
SET updated_at = COALESCE(updated_at, now())
WHERE updated_at IS NULL;

-- 3) Backfill minimal values if needed
-- If some rows exist without book_key, set to storage_path (last resort)
UPDATE public.book_covers
SET book_key = COALESCE(book_key, storage_path)
WHERE book_key IS NULL;

-- 4) Ensure updated_at trigger function exists (use generic function name as requested)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (handles both naming conventions)
DROP TRIGGER IF EXISTS trg_book_covers_updated_at ON public.book_covers;
DROP TRIGGER IF EXISTS book_covers_updated_at ON public.book_covers;

-- Create trigger using the generic function
CREATE TRIGGER trg_book_covers_updated_at
BEFORE UPDATE ON public.book_covers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 5) Indexes (safe)
CREATE INDEX IF NOT EXISTS idx_book_covers_book_key ON public.book_covers(book_key);
CREATE INDEX IF NOT EXISTS idx_book_covers_created_by ON public.book_covers(created_by);
CREATE INDEX IF NOT EXISTS idx_book_covers_source ON public.book_covers(source);
CREATE INDEX IF NOT EXISTS idx_book_covers_created_at_desc ON public.book_covers(created_at DESC);

-- 6) Unique constraint on book_key (only if no duplicates)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.book_covers
    WHERE book_key IS NOT NULL
    GROUP BY book_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipping unique constraint: duplicates exist in book_key';
  ELSE
    BEGIN
      ALTER TABLE public.book_covers
        ADD CONSTRAINT book_covers_book_key_unique UNIQUE (book_key);
    EXCEPTION WHEN duplicate_object THEN
      -- already exists
      NULL;
    END;
  END IF;
END $$;

