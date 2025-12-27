-- Add custom_cover_path column to user_books for storing uploaded cover paths
ALTER TABLE public.user_books
  ADD COLUMN IF NOT EXISTS custom_cover_path text;

-- Add comment
COMMENT ON COLUMN public.user_books.custom_cover_path IS 'Path to uploaded cover image in Supabase Storage (book-covers bucket)';

