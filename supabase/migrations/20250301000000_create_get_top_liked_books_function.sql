/*
  # Create get_top_liked_books Function

  This migration creates a PostgreSQL function that returns the most liked books
  across the entire community, ordered by likes count (descending) and most recent like (descending).

  1. Purpose
    - Aggregate active likes (deleted_at IS NULL) by book_key
    - Join with books_cache and books tables to get book metadata
    - Order by likes_count DESC, then last_like_at DESC
    - Support pagination with limit and offset

  2. Output
    - book_key: The canonical book key (primary identifier)
    - likes_count: Number of active likes for this book
    - comments_count: Number of comments (0 for now, can be added later)
    - last_like_at: Timestamp of the most recent like
    - Book metadata: title, author, cover_url, isbn, google_books_id, openlibrary_work_key, etc.

  3. Joins
    - book_likes.book_key -> books_cache.book_key (for fast lookup)
    - books_cache.isbn -> books.isbn (for additional metadata like total_pages, description)
    - Falls back to books.openlibrary_work_key or books.google_books_id if ISBN match fails

  4. Security
    - Uses SECURITY DEFINER to bypass RLS (aggregation function)
    - Returns only public data (book metadata, like counts)
*/

-- ============================================================================
-- 1. Create get_top_liked_books function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_top_liked_books(
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  book_key TEXT,
  likes_count BIGINT,
  comments_count BIGINT,
  last_like_at TIMESTAMPTZ,
  -- Book metadata (from books_cache and books)
  title TEXT,
  author TEXT,
  cover_url TEXT,
  isbn TEXT,
  google_books_id TEXT,
  openlibrary_work_key TEXT,
  openlibrary_edition_key TEXT,
  openlibrary_cover_id INTEGER,
  total_pages INTEGER,
  description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH liked_books AS (
    -- Aggregate active likes by book_key
    -- Only include books with at least 1 like (WHERE clause ensures this)
    SELECT
      bl.book_key,
      COUNT(*)::BIGINT AS likes_count,
      MAX(bl.created_at) AS last_like_at,
      MIN(bl.created_at) AS first_like_at  -- For tie-break with created_at
    FROM book_likes bl
    WHERE bl.deleted_at IS NULL
    GROUP BY bl.book_key
    HAVING COUNT(*) > 0  -- Only books with at least 1 like
  ),
  commented_books AS (
    -- Aggregate comments by book_key (for future use)
    SELECT
      bc.book_key,
      COUNT(*)::BIGINT AS comments_count
    FROM book_comments bc
    GROUP BY bc.book_key
  ),
  books_with_metadata AS (
    -- Join liked_books with books_cache (fast lookup by book_key)
    SELECT
      lb.book_key,
      lb.likes_count,
      COALESCE(cb.comments_count, 0)::BIGINT AS comments_count,
      lb.last_like_at,
      lb.first_like_at,  -- For tie-break sorting
      -- Metadata from books_cache (always available if book_key exists)
      bc.title AS cache_title,
      bc.author AS cache_author,
      bc.cover_url AS cache_cover_url,
      bc.isbn AS cache_isbn
    FROM liked_books lb
    LEFT JOIN books_cache bc ON bc.book_key = lb.book_key
    LEFT JOIN commented_books cb ON cb.book_key = lb.book_key
  ),
  enriched_books AS (
    -- Try to enrich with additional metadata from books table
    SELECT
      bm.book_key,
      bm.likes_count,
      bm.comments_count,
      bm.last_like_at,
      bm.first_like_at,  -- Pass through for tie-break
      -- Prefer books table metadata, fallback to books_cache
      COALESCE(b.title, bm.cache_title) AS title,
      COALESCE(b.author, bm.cache_author) AS author,
      COALESCE(b.cover_url, bm.cache_cover_url) AS cover_url,
      COALESCE(b.isbn, bm.cache_isbn) AS isbn,
      b.google_books_id,
      b.openlibrary_work_key,
      b.openlibrary_edition_key,
      b.openlibrary_cover_id,
      b.total_pages,
      b.description,
      -- Use books.created_at for tie-break (or first_like_at as fallback)
      COALESCE(b.created_at, bm.first_like_at) AS book_created_at
    FROM books_with_metadata bm
    LEFT JOIN books b ON (
      -- Try to match by ISBN first (most reliable)
      (bm.cache_isbn IS NOT NULL AND b.isbn = bm.cache_isbn)
      OR
      -- Try to match by OpenLibrary work key
      (bm.book_key LIKE 'ol:/works/%' AND b.openlibrary_work_key = bm.book_key)
      OR
      -- Try to match by OpenLibrary edition key
      (bm.book_key LIKE 'ol:/books/%' AND b.openlibrary_edition_key = bm.book_key)
      OR
      -- Try to match by Google Books ID (handle both "google:" and "gb:" prefixes)
      (bm.book_key LIKE 'google:%' AND b.google_books_id = SUBSTRING(bm.book_key FROM 8))
      OR
      (bm.book_key LIKE 'gb:%' AND b.google_books_id = SUBSTRING(bm.book_key FROM 4))
    )
  )
  SELECT
    eb.book_key,
    eb.likes_count,
    eb.comments_count,
    eb.last_like_at,
    eb.title,
    eb.author,
    eb.cover_url,
    eb.isbn,
    eb.google_books_id,
    eb.openlibrary_work_key,
    eb.openlibrary_edition_key,
    eb.openlibrary_cover_id,
    eb.total_pages,
    eb.description
  FROM enriched_books eb
  ORDER BY 
    eb.likes_count DESC, 
    eb.last_like_at DESC NULLS LAST,
    eb.book_created_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================================================
-- 2. Grant execute permission to authenticated users
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_top_liked_books(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_liked_books(INT, INT) TO anon;

-- ============================================================================
-- 3. Add comment
-- ============================================================================

COMMENT ON FUNCTION get_top_liked_books(INT, INT) IS 
'Returns the most liked books across the community, ordered by likes count (desc) and most recent like (desc). Supports pagination with limit and offset.';

