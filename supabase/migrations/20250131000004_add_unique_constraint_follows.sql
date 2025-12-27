/*
  # Add unique constraint to follows table to prevent duplicate follows
  
  1. Changes
    - Add unique constraint on (follower_id, following_id) to prevent following the same user twice
    - This ensures data integrity and prevents duplicate follow relationships
  
  2. Security
    - No RLS changes needed
*/

-- Add unique constraint to prevent duplicate follows
ALTER TABLE public.follows
ADD CONSTRAINT follows_unique UNIQUE (follower_id, following_id);

COMMENT ON CONSTRAINT follows_unique ON public.follows IS 'Prevents duplicate follow relationships between the same users';

