-- Clean existing activity photos: convert URLs to paths
-- This migration fixes activities.photos that contain full URLs instead of paths

-- Function to extract path from URL
-- Example: "https://xxx.supabase.co/storage/v1/object/public/activity-photos/userId/0.jpg"
-- Should become: "userId/0.jpg"
DO $$
DECLARE
  activity_record RECORD;
  photo_url TEXT;
  photo_path TEXT;
  cleaned_photos TEXT[];
  path_found BOOLEAN;
BEGIN
  -- Loop through all activities that have photos
  FOR activity_record IN 
    SELECT id, photos 
    FROM public.activities 
    WHERE photos IS NOT NULL 
      AND array_length(photos, 1) > 0
  LOOP
    cleaned_photos := ARRAY[]::TEXT[];
    path_found := false;
    
    -- Process each photo in the array
    FOR photo_url IN SELECT unnest(activity_record.photos)
    LOOP
      -- Check if it's a URL (starts with http:// or https://)
      IF photo_url LIKE 'http://%' OR photo_url LIKE 'https://%' THEN
        -- Extract path from URL
        -- Pattern: .../activity-photos/{path}
        -- We want to extract everything after "activity-photos/"
        IF photo_url LIKE '%/activity-photos/%' THEN
          photo_path := substring(photo_url from 'activity-photos/(.+?)(\?|$)');
          
          -- Verify the extracted path is valid (should be userId/filename.jpg)
          IF photo_path IS NOT NULL 
            AND photo_path LIKE '%/%' 
            AND length(photo_path) > 3 THEN
            cleaned_photos := array_append(cleaned_photos, photo_path);
            path_found := true;
          ELSE
            -- Invalid path extracted, skip this photo
            RAISE NOTICE 'Could not extract valid path from URL: %', photo_url;
          END IF;
        ELSE
          -- URL doesn't contain activity-photos/, skip
          RAISE NOTICE 'URL does not contain activity-photos/: %', photo_url;
        END IF;
      ELSE
        -- Already a path (doesn't start with http), keep it
        -- Verify it's a valid path format (userId/filename)
        IF photo_url LIKE '%/%' AND length(photo_url) > 3 THEN
          cleaned_photos := array_append(cleaned_photos, photo_url);
          path_found := true;
        ELSE
          -- Invalid path format, skip
          RAISE NOTICE 'Invalid path format: %', photo_url;
        END IF;
      END IF;
    END LOOP;
    
    -- Update the activity if we cleaned any photos
    IF path_found THEN
      UPDATE public.activities
      SET photos = cleaned_photos
      WHERE id = activity_record.id;
      
      RAISE NOTICE 'Cleaned photos for activity %: % -> %', 
        activity_record.id, 
        activity_record.photos, 
        cleaned_photos;
    END IF;
  END LOOP;
END $$;

-- Add comment
COMMENT ON COLUMN public.activities.photos IS 'Array of storage paths (not URLs). Format: ["userId/0.jpg"]. Paths must be converted to URLs using getPublicUrl() at display time.';

