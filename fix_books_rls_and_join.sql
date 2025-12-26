/*
  # Fix Books RLS and Join Issues
  
  This script ensures that:
  1. Foreign key exists between user_books.book_id and books.id
  2. RLS policies allow authenticated users to read books (required for joins)
  3. RLS policies allow authenticated users to insert books
  
  Run this in Supabase SQL Editor if books are returning null in joins.
*/

-- ============================================
-- 1. VERIFY/CREATE FOREIGN KEY
-- ============================================

-- Check if FK exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_books_book_id_fkey'
    AND table_name = 'user_books'
  ) THEN
    -- Create FK if it doesn't exist
    ALTER TABLE public.user_books
    ADD CONSTRAINT user_books_book_id_fkey
    FOREIGN KEY (book_id)
    REFERENCES public.books (id)
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Foreign key user_books_book_id_fkey created';
  ELSE
    RAISE NOTICE 'Foreign key user_books_book_id_fkey already exists';
  END IF;
END $$;

-- ============================================
-- 2. ENABLE RLS ON BOOKS (if not already)
-- ============================================

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. DROP EXISTING POLICIES (to avoid conflicts)
-- ============================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'books'
    ) 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.books';
    END LOOP;
END $$;

-- ============================================
-- 4. CREATE RLS POLICIES FOR BOOKS
-- ============================================

-- Policy: Allow authenticated users to SELECT books (CRITICAL for joins)
CREATE POLICY "books_select_authenticated"
ON public.books
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow authenticated users to INSERT books (needed when adding new books)
CREATE POLICY "books_insert_authenticated"
ON public.books
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy: Allow authenticated users to UPDATE books (optional, for corrections)
CREATE POLICY "books_update_authenticated"
ON public.books
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- ============================================
-- 5. VERIFY/CREATE RLS POLICIES FOR USER_BOOKS
-- ============================================

ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start fresh
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_books'
    ) 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.user_books';
    END LOOP;
END $$;

-- Policy: Allow authenticated users to SELECT all user_books (for social features)
CREATE POLICY "user_books_select_authenticated"
ON public.user_books
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow users to INSERT their own books
CREATE POLICY "user_books_insert_own"
ON public.user_books
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to UPDATE their own books
CREATE POLICY "user_books_update_own"
ON public.user_books
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to DELETE their own books
CREATE POLICY "user_books_delete_own"
ON public.user_books
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- 6. VERIFICATION QUERIES (run these to check)
-- ============================================

-- Check FK exists
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'user_books'
  AND kcu.column_name = 'book_id';

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('books', 'user_books');

-- Check policies exist
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('books', 'user_books')
ORDER BY tablename, policyname;

