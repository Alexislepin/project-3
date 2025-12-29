-- Migration: Create avatars storage bucket and RLS policies
-- Date: 2025-02-08

-- Create avatars bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true, -- Public read
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Allow authenticated users to upload their own avatar
-- Path format: {userId}.jpg (bucket is 'avatars')
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  name LIKE auth.uid()::text || '.%'
);

-- RLS Policy: Allow authenticated users to update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  name LIKE auth.uid()::text || '.%'
)
WITH CHECK (
  bucket_id = 'avatars' AND
  name LIKE auth.uid()::text || '.%'
);

-- RLS Policy: Allow authenticated users to delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  name LIKE auth.uid()::text || '.%'
);

-- RLS Policy: Allow public read access
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

