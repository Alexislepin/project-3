-- Add custom fields to user_books for per-user book customizations
-- These fields allow users to override book metadata (title, author, pages, cover, description)
-- without affecting the global books table

ALTER TABLE user_books
ADD COLUMN IF NOT EXISTS custom_title text,
ADD COLUMN IF NOT EXISTS custom_author text,
ADD COLUMN IF NOT EXISTS custom_total_pages integer,
ADD COLUMN IF NOT EXISTS custom_description text,
ADD COLUMN IF NOT EXISTS custom_cover_url text;

-- Add comments to document these fields
COMMENT ON COLUMN user_books.custom_title IS 'User-specific title override for this book';
COMMENT ON COLUMN user_books.custom_author IS 'User-specific author override for this book';
COMMENT ON COLUMN user_books.custom_total_pages IS 'User-specific page count override for this book';
COMMENT ON COLUMN user_books.custom_description IS 'User-specific description/notes for this book';
COMMENT ON COLUMN user_books.custom_cover_url IS 'User-specific cover URL override for this book';

-- RLS policies already allow users to UPDATE their own user_books rows
-- The existing policy: auth.uid() = user_id allows updates to all columns
-- So no additional RLS policies are needed for these custom fields

