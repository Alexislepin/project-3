/*
  # Fix RLS Policies for book_comments and activity_events
  
  This script ensures correct RLS policies for:
  - book_comments: SELECT for authenticated, INSERT/DELETE only own (user_id=auth.uid)
  - activity_events: SELECT for authenticated, INSERT only own (actor_id=auth.uid)
  
  This script is IDEMPOTENT: can be run multiple times safely.
  
  Run this in Supabase SQL Editor.
*/

-- ============================================
-- 1. book_comments RLS Policies
-- ============================================

-- Enable RLS (idempotent)
ALTER TABLE public.book_comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "Anyone can read book comments" ON public.book_comments;
DROP POLICY IF EXISTS "Users can insert their own comments" ON public.book_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.book_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.book_comments;

-- Policy: SELECT for authenticated users
CREATE POLICY "book_comments_select_authenticated"
  ON public.book_comments
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: INSERT only own comments (user_id = auth.uid())
CREATE POLICY "book_comments_insert_own"
  ON public.book_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: UPDATE only own comments (user_id = auth.uid())
CREATE POLICY "book_comments_update_own"
  ON public.book_comments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: DELETE only own comments (user_id = auth.uid())
CREATE POLICY "book_comments_delete_own"
  ON public.book_comments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 2. activity_events RLS Policies
-- ============================================

-- Enable RLS (idempotent)
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS "activity_events_read_all_authenticated" ON public.activity_events;
DROP POLICY IF EXISTS "activity_events_insert_own" ON public.activity_events;
DROP POLICY IF EXISTS "activity_events_delete_own" ON public.activity_events;

-- Policy: SELECT for authenticated users
CREATE POLICY "activity_events_select_authenticated"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: INSERT only own events (actor_id = auth.uid())
CREATE POLICY "activity_events_insert_own"
  ON public.activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- Policy: DELETE only own events (actor_id = auth.uid())
-- Note: This is optional but good practice for cleanup
CREATE POLICY "activity_events_delete_own"
  ON public.activity_events
  FOR DELETE
  TO authenticated
  USING (actor_id = auth.uid());

-- ============================================
-- 3. Verification Queries (run after applying policies)
-- ============================================

-- Check all policies on book_comments
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'book_comments'
ORDER BY policyname;

-- Check all policies on activity_events
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'activity_events'
ORDER BY policyname;

-- Quick test: Try to SELECT (should work if authenticated)
-- Run this in Supabase SQL Editor while logged in:
-- SELECT COUNT(*) FROM public.book_comments;
-- SELECT COUNT(*) FROM public.activity_events;
-- 
-- If you get 0 rows or an error, check:
-- 1. Are you authenticated? (check auth.uid() is not null)
-- 2. Are the policies correctly applied? (run the verification queries above)
-- 3. Is RLS enabled? (check with: SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('book_comments', 'activity_events');)

