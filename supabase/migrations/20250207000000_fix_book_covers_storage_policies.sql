/*
  # Fix Book Covers Storage Bucket Policies
  
  This migration ensures the book-covers bucket has the correct RLS policies.
  
  IMPORTANT: 
  1. First, create the bucket in Supabase Dashboard:
     - Go to Storage > Create Bucket
     - Name: "book-covers"
     - Public: true
     - File size limit: 10MB
     - Allowed MIME types: image/jpeg, image/png, image/webp
  
  2. Then run this migration to create/update the policies.
*/

-- Enable RLS on storage.objects if not already enabled
-- Note: RLS is typically enabled by default on storage.objects

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public can read book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own book covers" ON storage.objects;

-- Policy: Anyone can read book covers (public bucket)
CREATE POLICY "Public can read book covers"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'book-covers');

-- Policy: Users can upload their own book covers
-- Path must be: user_covers/<auth.uid()>/<book_id>/<filename>
-- Using starts_with to check that path starts with user_covers/<auth.uid()>/
CREATE POLICY "Users can upload their own book covers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-covers' AND
  name LIKE 'user_covers/' || auth.uid()::text || '/%'
);

-- Policy: Users can update/replace their own book covers
CREATE POLICY "Users can update their own book covers"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'book-covers' AND
  name LIKE 'user_covers/' || auth.uid()::text || '/%'
)
WITH CHECK (
  bucket_id = 'book-covers' AND
  name LIKE 'user_covers/' || auth.uid()::text || '/%'
);

-- Policy: Users can delete their own book covers
CREATE POLICY "Users can delete their own book covers"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'book-covers' AND
  name LIKE 'user_covers/' || auth.uid()::text || '/%'
);

