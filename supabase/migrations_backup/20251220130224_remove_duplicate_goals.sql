/*
  # Remove duplicate user goals and add unique constraint
  
  1. Changes
    - Remove duplicate goals, keeping only the most recent one for each user_id + type combination
    - Add unique partial index to prevent future duplicates
  
  2. Security
    - No RLS changes needed as existing policies remain in place
*/

-- Remove duplicates, keeping only the most recent goal for each user_id + type combination
DELETE FROM user_goals a USING user_goals b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.type = b.type 
  AND a.active = true 
  AND b.active = true;

-- Add unique partial index to prevent duplicates in the future
DROP INDEX IF EXISTS idx_unique_active_user_goal;

CREATE UNIQUE INDEX idx_unique_active_user_goal 
ON user_goals (user_id, type) 
WHERE active = true;