/*
 * Migration: Create get_book_likers RPC function and index
 * 
 * Purpose: Support "who liked this book" modal in Explorer feed
 * 
 * RPC: get_book_likers(p_book_key, p_limit, p_offset)
 * Returns: user_id, username, avatar_url, liked_at
 * 
 * Index: book_likes_active_book_key_idx on book_likes(book_key) WHERE deleted_at IS NULL
 * 
 * Security: Uses SECURITY DEFINER to bypass RLS (aggregation function)
 * Grants: EXECUTE to authenticated users
 */

-- ============================================================================
-- 1. Create index for fast lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS book_likes_active_book_key_idx
ON public.book_likes (book_key)
WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. Create get_book_likers function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_book_likers(
  p_book_key TEXT,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  liked_at TIMESTAMPTZ,
  display_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    bl.user_id,
    COALESCE(p.username, 'user') AS username,
    p.avatar_url,
    bl.created_at AS liked_at,
    COALESCE(p.display_name, p.username, 'Utilisateur') AS display_name
  FROM public.book_likes bl
  JOIN public.user_profiles p ON p.id = bl.user_id
  WHERE bl.book_key = p_book_key
    AND bl.deleted_at IS NULL
  ORDER BY bl.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- ============================================================================
-- 3. Grant execute permission to authenticated users
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_book_likers(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_book_likers(TEXT, INT, INT) TO anon;

-- ============================================================================
-- 4. Add comment
-- ============================================================================

COMMENT ON FUNCTION public.get_book_likers(TEXT, INT, INT) IS 
'Returns users who liked a book, ordered by most recent like first. Supports pagination with limit and offset.';

