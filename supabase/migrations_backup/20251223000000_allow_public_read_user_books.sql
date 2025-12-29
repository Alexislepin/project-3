/*
  # Allow Public Read Access to user_books
  
  This migration adds a policy to allow authenticated users to read user_books
  from other users. This is needed for social features like viewing other users' libraries.
  
  1. Changes
    - Add policy to allow SELECT on user_books for authenticated users
    - This enables viewing other users' book collections (social feature)
  
  2. Security
    - Only allows SELECT (read), not INSERT, UPDATE, or DELETE
    - Users can still only modify their own books (existing policies)
*/

-- Enable RLS if not already enabled
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can read user_books" ON public.user_books;
DROP POLICY IF EXISTS "Users can read their own books" ON public.user_books;
DROP POLICY IF EXISTS "Public read access for user_books" ON public.user_books;

-- Policy to allow authenticated users to read all user_books
-- This is needed for viewing other users' libraries (social feature)
CREATE POLICY "Authenticated users can read user_books"
  ON public.user_books
  FOR SELECT
  TO authenticated
  USING (true);

