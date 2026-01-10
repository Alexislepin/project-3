/*
  # Allow Following Users to Read Custom Covers in Feed
  
  This migration updates RLS policies on user_books to allow users to read
  custom_cover_url from users they follow, for displaying custom covers in the feed.
  
  IMPORTANT:
  - Only SELECT is allowed (not INSERT/UPDATE/DELETE)
  - Only book_id, user_id, custom_cover_url columns should be selected (already enforced in code)
  - Users can read their own user_books OR user_books from users they follow
*/

-- Ensure RLS is enabled
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- Drop the existing overly permissive policy (if it exists)
DROP POLICY IF EXISTS "authenticated_users_can_read_all_user_books" ON public.user_books;
DROP POLICY IF EXISTS "select_user_books_following" ON public.user_books;

-- Create new policy: users can read their own user_books OR user_books from users they follow
CREATE POLICY "select_user_books_following"
ON public.user_books
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.follows f
    WHERE f.follower_id = auth.uid()
      AND f.following_id = public.user_books.user_id
  )
);

-- Note: Keep existing INSERT/UPDATE/DELETE policies unchanged
-- They already restrict to own user_books only

