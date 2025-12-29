/*
  # Create Book Covers Storage Bucket Policies
  
  This migration creates storage policies for the book-covers bucket.
  
  IMPORTANT: The bucket itself must be created manually in Supabase Dashboard:
    1. Go to Storage > Create Bucket
    2. Name: "book-covers"
    3. Public: true (for easy access via URLs)
    4. File size limit: 10MB (reasonable for cover images)
    5. Allowed MIME types: image/jpeg, image/png, image/webp
  
  Storage Structure:
    user_covers/<user_id>/<book_id>/<uuid>.jpg
  
  Policies:
    - SELECT (READ): Public read (anyone can read cover images)
    - INSERT (UPLOAD): Only the owner (user_id in path matches auth.uid())
    - UPDATE (REPLACE): Only the owner
    - DELETE: Only the owner
  
  Note: Run this migration AFTER creating the bucket in Supabase Dashboard.
*/

-- Drop existing policies if they exist (in case of re-running migration)
DROP POLICY IF EXISTS "Public can read book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own book covers" ON storage.objects;

-- Policy: Anyone can read book covers (public bucket)
-- The path structure ensures files are not easily guessable due to UUID in filename
CREATE POLICY "Public can read book covers"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'book-covers');

-- Policy: Users can upload their own book covers
-- Path must start with user_covers/<auth.uid()>/
-- Using split_part to extract folder structure: user_covers/<user_id>/...
CREATE POLICY "Users can upload their own book covers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-covers' AND
  split_part(name, '/', 1) = 'user_covers' AND
  split_part(name, '/', 2) = auth.uid()::text
);

-- Policy: Users can update/replace their own book covers
CREATE POLICY "Users can update their own book covers"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'book-covers' AND
  split_part(name, '/', 1) = 'user_covers' AND
  split_part(name, '/', 2) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'book-covers' AND
  split_part(name, '/', 1) = 'user_covers' AND
  split_part(name, '/', 2) = auth.uid()::text
);

-- Policy: Users can delete their own book covers
CREATE POLICY "Users can delete their own book covers"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'book-covers' AND
  split_part(name, '/', 1) = 'user_covers' AND
  split_part(name, '/', 2) = auth.uid()::text
);

