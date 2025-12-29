-- Migration: Add triggers to automatically create activity_events when book_likes or book_comments are inserted
-- This ensures that likes and comments appear in the Home feed

-- 1) Function to add book_like event to activity_events
CREATE OR REPLACE FUNCTION public.add_book_like_event()
RETURNS TRIGGER AS $$
DECLARE
  v_book_key text;
BEGIN
  -- Get book_key from the book_likes row
  -- book_key can be null, so we use COALESCE with book_id as fallback
  v_book_key := COALESCE(NEW.book_key, NEW.book_id::text);
  
  -- Normalize OpenLibrary keys if needed (e.g., "/works/..." -> "ol:/works/...")
  IF v_book_key LIKE '/works/%' THEN
    v_book_key := 'ol:' || v_book_key;
  ELSIF v_book_key LIKE 'works/%' THEN
    v_book_key := 'ol:/' || v_book_key;
  END IF;
  
  -- Insert into activity_events
  -- Only insert if the event doesn't already exist (avoid duplicates)
  INSERT INTO public.activity_events (
    actor_id,
    event_type,
    book_key,
    comment_id,
    created_at
  )
  SELECT
    NEW.user_id,
    'book_like',
    v_book_key,
    NULL,
    COALESCE(NEW.created_at, NOW())
  WHERE NOT EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE actor_id = NEW.user_id
      AND event_type = 'book_like'
      AND book_key = v_book_key
      AND created_at >= NOW() - INTERVAL '1 minute'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Trigger on book_likes insert
DROP TRIGGER IF EXISTS trigger_add_book_like_event ON public.book_likes;
CREATE TRIGGER trigger_add_book_like_event
  AFTER INSERT ON public.book_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.add_book_like_event();

-- 3) Function to add book_comment event to activity_events
CREATE OR REPLACE FUNCTION public.add_book_comment_event()
RETURNS TRIGGER AS $$
DECLARE
  v_book_key text;
BEGIN
  -- Get book_key from the book_comments row
  v_book_key := COALESCE(NEW.book_key, NEW.book_id::text);
  
  -- Normalize OpenLibrary keys if needed
  IF v_book_key LIKE '/works/%' THEN
    v_book_key := 'ol:' || v_book_key;
  ELSIF v_book_key LIKE 'works/%' THEN
    v_book_key := 'ol:/' || v_book_key;
  END IF;
  
  -- Insert into activity_events
  -- Only insert if the event doesn't already exist (avoid duplicates)
  INSERT INTO public.activity_events (
    actor_id,
    event_type,
    book_key,
    comment_id,
    created_at
  )
  SELECT
    NEW.user_id,
    'book_comment',
    v_book_key,
    NEW.id,
    COALESCE(NEW.created_at, NOW())
  WHERE NOT EXISTS (
    SELECT 1 FROM public.activity_events
    WHERE actor_id = NEW.user_id
      AND event_type = 'book_comment'
      AND comment_id = NEW.id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) Trigger on book_comments insert
DROP TRIGGER IF EXISTS trigger_add_book_comment_event ON public.book_comments;
CREATE TRIGGER trigger_add_book_comment_event
  AFTER INSERT ON public.book_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.add_book_comment_event();

