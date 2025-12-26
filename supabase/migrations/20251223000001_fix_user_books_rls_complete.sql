/*
  # Fix User Books RLS Policies - Complete Solution
  
  This migration ensures that authenticated users can read all user_books
  for social features like viewing other users' libraries.
  
  IMPORTANT: Run this SQL in Supabase SQL Editor if the previous migration didn't work.
*/

-- First, check current policies (for debugging - can be commented out)
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename = 'user_books';

-- Enable RLS
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on user_books to start fresh
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_books') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.user_books';
    END LOOP;
END $$;

-- Create policy to allow authenticated users to read all user_books
CREATE POLICY "authenticated_users_can_read_all_user_books"
  ON public.user_books
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow users to insert their own books
CREATE POLICY "users_can_insert_own_books"
  ON public.user_books
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own books
CREATE POLICY "users_can_update_own_books"
  ON public.user_books
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to delete their own books
CREATE POLICY "users_can_delete_own_books"
  ON public.user_books
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);











