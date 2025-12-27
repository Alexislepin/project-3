/*
  # Fix Activities RLS Policies for Feed (Followers)

  This migration ensures that activities are visible to followers in the feed.
  
  Problem:
  - Activities feed should show:
    1. User's own activities (always)
    2. Activities from users they follow (if visibility is 'public' or 'followers')
  - Current RLS might be too restrictive, preventing followers from seeing activities
  
  Solution:
  - Add/update RLS policy to allow SELECT if:
    - activity.user_id = auth.uid() (own activities)
    - OR activity.visibility = 'public' (public activities from anyone)
    - OR (activity.visibility = 'followers' AND exists (select 1 from follows where follower_id = auth.uid() and following_id = activity.user_id))
  
  Security:
  - Only allows SELECT (read), not INSERT, UPDATE, or DELETE
  - Users can still only INSERT their own activities (existing policy)
  - Private activities (visibility = 'private') are only visible to the owner
*/

-- Enable RLS if not already enabled
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Drop existing SELECT policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own activities" ON public.activities;
DROP POLICY IF EXISTS "Users can view public activities" ON public.activities;
DROP POLICY IF EXISTS "Users can view activities from followed users" ON public.activities;
DROP POLICY IF EXISTS "Activities are visible to owners and followers" ON public.activities;

-- Create comprehensive SELECT policy for feed visibility
CREATE POLICY "Activities are visible to owners and followers"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (
    -- Own activities (always visible)
    user_id = auth.uid()
    OR
    -- Public activities from anyone
    visibility = 'public'
    OR
    -- Followers-only activities from users the current user follows
    (visibility = 'followers' AND EXISTS (
      SELECT 1 FROM public.follows
      WHERE follows.follower_id = auth.uid()
      AND follows.following_id = activities.user_id
    ))
  );

-- Ensure INSERT policy exists (users can only insert their own activities)
DROP POLICY IF EXISTS "Users can insert own activities" ON public.activities;
CREATE POLICY "Users can insert own activities"
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Ensure UPDATE policy exists (users can only update their own activities)
DROP POLICY IF EXISTS "Users can update own activities" ON public.activities;
CREATE POLICY "Users can update own activities"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Ensure DELETE policy exists (users can only delete their own activities)
DROP POLICY IF EXISTS "Users can delete own activities" ON public.activities;
CREATE POLICY "Users can delete own activities"
  ON public.activities
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Add comment
COMMENT ON POLICY "Activities are visible to owners and followers" ON public.activities IS 
  'Allows users to see their own activities, public activities, and followers-only activities from users they follow';

