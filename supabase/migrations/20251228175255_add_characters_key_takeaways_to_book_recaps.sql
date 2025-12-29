/*
  # Add characters and key_takeaways columns to book_recaps table

  1. Changes
    - Add `characters` jsonb column (default empty array)
    - Add `key_takeaways` jsonb column (default empty array)
    - These columns store structured data from the new OpenAI response format
    - Backward compatible: old recap_data jsonb still works

  2. Security
    - No RLS changes needed (existing policies still apply)
*/

-- Add characters column (jsonb array of character objects)
ALTER TABLE book_recaps
ADD COLUMN IF NOT EXISTS characters jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Add key_takeaways column (jsonb array of strings)
ALTER TABLE book_recaps
ADD COLUMN IF NOT EXISTS key_takeaways jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Add comments
COMMENT ON COLUMN book_recaps.characters IS 'Array of character objects: [{name, who, why_important}]';
COMMENT ON COLUMN book_recaps.key_takeaways IS 'Array of key takeaway strings (minimum 5)';

-- Note: The recap_data jsonb column still exists and contains the full recap object
-- These new columns are for faster queries and structured access

