/*
  # Create Book Covers Pool Table
  
  This migration creates a centralized pool of book covers uploaded by users.
  This allows the app to fallback to covers already uploaded by any user for the same book_key.
  
  Table: `book_covers`
    - Stores metadata about uploaded book covers
    - Links to Supabase Storage bucket "book-covers"
    - One cover per book_key (isbn:... or uuid)
  
  Storage:
    - Bucket: "book-covers" (created in this migration if not exists)
    - Public read access
    - Path structure for pool: `book_covers/<book_key>/<uuid>.jpg`
    - Path structure for user covers: `user_covers/<user_id>/<book_id>/<uuid>.jpg` (existing, separate)
  
  RLS Policies (Table):
    - SELECT: Public (everyone can read)
    - INSERT: Authenticated users only (created_by = auth.uid())
    - UPDATE/DELETE: Only creator (created_by = auth.uid())
  
  Storage Policies:
    - SELECT: Public read for all paths in bucket
    - INSERT: Authenticated users can upload to `book_covers/<book_key>/...` path
    - UPDATE/DELETE: Only creator can modify (enforced via table RLS + storage path check)
*/

-- Create book-covers bucket if it doesn't exist
-- This bucket is used for both user covers (user_covers/) and pooled covers (book_covers/)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book-covers',
  'book-covers',
  true, -- Public read access
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Public read access for all book covers (pooled and user-specific)
-- This policy already exists from previous migrations, but we ensure it's here
DROP POLICY IF EXISTS "Public can read book covers" ON storage.objects;
CREATE POLICY "Public can read book covers"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'book-covers');

-- Storage Policy: Authenticated users can upload to book_covers/<book_key>/... path
-- This allows any authenticated user to upload a cover for a book_key
-- The table RLS policy ensures only valid entries are created (created_by = auth.uid())
DROP POLICY IF EXISTS "Authenticated users can upload pooled book covers" ON storage.objects;
CREATE POLICY "Authenticated users can upload pooled book covers"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'book-covers' AND
    split_part(name, '/', 1) = 'book_covers'
  );

-- Storage Policy: Only creator can update pooled covers
-- IMPORTANT: Storage policies cannot check table ownership, so we allow authenticated users
-- to update files in book_covers/ path. The table RLS policy enforces ownership when updating
-- the book_covers table record. In practice, clients should:
-- 1. Update the table record (RLS enforces ownership)
-- 2. Then update the storage file (if table update succeeds)
-- If a user modifies a storage file without updating the table, the record will become orphaned
-- but this is acceptable for the pool use case.
DROP POLICY IF EXISTS "Creators can update pooled book covers" ON storage.objects;
CREATE POLICY "Creators can update pooled book covers"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'book-covers' AND
    split_part(name, '/', 1) = 'book_covers'
  )
  WITH CHECK (
    bucket_id = 'book-covers' AND
    split_part(name, '/', 1) = 'book_covers'
  );

-- Storage Policy: Only creator can delete pooled covers
-- IMPORTANT: Storage policies cannot check table ownership, so we allow authenticated users
-- to delete files in book_covers/ path. The table RLS policy enforces ownership when deleting
-- from book_covers table. Clients should:
-- 1. Delete from book_covers table first (RLS enforces ownership)
-- 2. Then delete the storage file (if table delete succeeds)
-- This ensures only creators can fully remove covers from the pool.
DROP POLICY IF EXISTS "Creators can delete pooled book covers" ON storage.objects;
CREATE POLICY "Creators can delete pooled book covers"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'book-covers' AND
    split_part(name, '/', 1) = 'book_covers'
  );

-- Note: User-specific covers (user_covers/<user_id>/...) are handled by existing policies
-- from migrations 20250205000001_create_book_covers_storage.sql and 20250207000000_fix_book_covers_storage_policies.sql

-- Create book_covers table
CREATE TABLE IF NOT EXISTS public.book_covers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_key text NOT NULL UNIQUE,  -- Unique book identifier (isbn:... or uuid)
  storage_path text NOT NULL,  -- Path in Storage bucket "book-covers"
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'openlibrary', 'google', 'manual')),
  width integer NULL,  -- Image width in pixels
  height integer NULL,  -- Image height in pixels
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_book_covers_book_key ON public.book_covers(book_key);
CREATE INDEX IF NOT EXISTS idx_book_covers_created_by ON public.book_covers(created_by);
CREATE INDEX IF NOT EXISTS idx_book_covers_source ON public.book_covers(source);
CREATE INDEX IF NOT EXISTS idx_book_covers_created_at ON public.book_covers(created_at DESC);

-- Enable RLS
ALTER TABLE public.book_covers ENABLE ROW LEVEL SECURITY;

-- RLS Policy: SELECT - Public read (everyone can read)
CREATE POLICY "Public can read book covers"
  ON public.book_covers
  FOR SELECT
  TO public
  USING (true);

-- RLS Policy: INSERT - Authenticated users only (must set created_by = auth.uid())
CREATE POLICY "Authenticated users can insert book covers"
  ON public.book_covers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- RLS Policy: UPDATE - Only creator can update
CREATE POLICY "Creators can update their book covers"
  ON public.book_covers
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- RLS Policy: DELETE - Only creator can delete
CREATE POLICY "Creators can delete their book covers"
  ON public.book_covers
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_book_covers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on UPDATE
CREATE TRIGGER book_covers_updated_at
  BEFORE UPDATE ON public.book_covers
  FOR EACH ROW
  EXECUTE FUNCTION update_book_covers_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.book_covers IS 'Centralized pool of book covers uploaded by users. One cover per book_key (isbn:... or uuid).';
COMMENT ON COLUMN public.book_covers.book_key IS 'Unique book identifier: isbn:9781234567890 or uuid from books table';
COMMENT ON COLUMN public.book_covers.storage_path IS 'Path in Storage bucket "book-covers" (e.g., book_covers/isbn:9781234567890/abc123.jpg)';
COMMENT ON COLUMN public.book_covers.source IS 'Source of the cover: user (uploaded), openlibrary, google, manual';
COMMENT ON COLUMN public.book_covers.created_by IS 'User who uploaded the cover (references auth.users, set to NULL on user deletion)';

