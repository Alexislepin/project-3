/*
  # Add Custom Cover Metadata to user_books
  
  1. Changes
    - Add custom_cover_source column to track where the cover came from ('camera' | 'gallery')
    - Add custom_cover_updated_at column to track when the cover was last updated
    - Note: custom_cover_url already exists from previous migration
  
  2. Security
    - RLS policies already allow users to UPDATE their own user_books rows
    - No additional RLS policies needed
*/

-- Add custom_cover_source column
ALTER TABLE user_books
ADD COLUMN IF NOT EXISTS custom_cover_source text CHECK (custom_cover_source IN ('camera', 'gallery'));

-- Add custom_cover_updated_at column
ALTER TABLE user_books
ADD COLUMN IF NOT EXISTS custom_cover_updated_at timestamptz;

-- Add comments to document these fields
COMMENT ON COLUMN user_books.custom_cover_source IS 'Source of the custom cover: camera or gallery';
COMMENT ON COLUMN user_books.custom_cover_updated_at IS 'Timestamp when the custom cover was last updated';

