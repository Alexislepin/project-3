-- Add UNIQUE constraint on user_books (user_id, book_id) if it doesn't exist
-- This ensures database-level safety against duplicate entries

-- Check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'user_books_user_id_book_id_key'
  ) THEN
    -- Add UNIQUE constraint
    ALTER TABLE public.user_books
    ADD CONSTRAINT user_books_user_id_book_id_key UNIQUE (user_id, book_id);
    
    RAISE NOTICE 'UNIQUE constraint added successfully';
  ELSE
    RAISE NOTICE 'UNIQUE constraint already exists';
  END IF;
END $$;

-- Verify constraint exists
SELECT 
  conname AS constraint_name,
  contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'public.user_books'::regclass
  AND conname = 'user_books_user_id_book_id_key';

