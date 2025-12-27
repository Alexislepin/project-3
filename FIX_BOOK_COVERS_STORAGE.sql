-- ============================================
-- FIX BOOK COVERS STORAGE RLS POLICIES
-- ============================================
-- Execute this SQL in Supabase Dashboard > SQL Editor
-- This will fix the "new row violates row-level security policy" error

-- Step 1: Drop existing policies (if any)
DROP POLICY IF EXISTS "Public can read book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own book covers" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own book covers" ON storage.objects;

-- Step 2: Create policy for public read access
CREATE POLICY "Public can read book covers"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'book-covers');

-- Step 3: Create policy for authenticated users to upload
-- Path must start with: user_covers/<auth.uid()>/
CREATE POLICY "Users can upload their own book covers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-covers' AND
  name LIKE 'user_covers/' || auth.uid()::text || '/%'
);

-- Step 4: Create policy for authenticated users to update
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

-- Step 5: Create policy for authenticated users to delete
CREATE POLICY "Users can delete their own book covers"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'book-covers' AND
  name LIKE 'user_covers/' || auth.uid()::text || '/%'
);

-- ============================================
-- VERIFICATION
-- ============================================
-- After running this, verify the policies exist:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%book covers%';

