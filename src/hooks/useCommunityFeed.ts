import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getBookSocialCounts, type BookSocialCounts } from '../lib/bookSocial';

/**
 * Community book row from get_top_liked_books RPC
 */
export type CommunityBookRow = {
  book_key: string;
  likes_count: number;
  comments_count: number;
  last_like_at: string;
  title: string | null;
  author: string | null;
  cover_url: string | null;
  isbn: string | null;
  google_books_id: string | null;
  openlibrary_work_key: string | null;
  openlibrary_edition_key: string | null;
  openlibrary_cover_id: number | null;
  total_pages: number | null;
  description: string | null;
};

/**
 * Hook to manage community liked books feed
 * 
 * Features:
 * - Fetches only books with at least 1 like
 * - Ordered by likes_count DESC
 * - Loads social counts (likes, comments, isLiked) for current user
 * - Prevents duplicate fetches with request key
 * - Supports pagination
 */
export function useCommunityFeed(userId: string | undefined) {
  const [books, setBooks] = useState<CommunityBookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [socialCounts, setSocialCounts] = useState<BookSocialCounts>({});
  
  // Request guard to prevent duplicate fetches (StrictMode double-fetch protection)
  const fetchLockRef = useRef(false);
  const requestKeyRef = useRef<string | null>(null);
  // Track current page using ref (avoids stale closure issues)
  const pageRef = useRef(0);
  
  const LIMIT = 20;

  /**
   * Load community books from Supabase RPC
   * 
   * Usage:
   * const { data, error } = await supabase.rpc('get_top_liked_books', { p_limit: 20, p_offset: 0 });
   * 
   * Pagination:
   * const limit = 20;
   * const offset = page * limit;
   * const { data } = await supabase.rpc('get_top_liked_books', { p_limit: limit, p_offset: offset });
   * 
   * @param reset - If true, resets the feed and starts from page 0
   */
  const loadBooks = useCallback(async (reset: boolean = false) => {
    if (!userId) return;
    
    // Prevent duplicate fetches
    if (fetchLockRef.current) {
      console.log('[useCommunityFeed] Already fetching, skipping');
      return;
    }

    // Calculate offset: use current page from ref, or 0 if reset
    if (reset) {
      pageRef.current = 0;
    }
    const currentPage = pageRef.current;
    const offset = currentPage * LIMIT;
    const fetchKey = `community-${reset}-${offset}-${userId}`;
    
    if (requestKeyRef.current === fetchKey) {
      console.log('[useCommunityFeed] Duplicate request key, skipping');
      return;
    }

    fetchLockRef.current = true;
    requestKeyRef.current = fetchKey;

    if (reset) {
      setBooks([]);
      setHasMore(true);
      setLoading(true);
    } else {
      setLoading(true);
    }

    try {
      // Call RPC with correct pagination
      const { data, error } = await supabase.rpc('get_top_liked_books', {
        p_limit: LIMIT,
        p_offset: offset,
      });

      if (error) {
        console.error('[useCommunityFeed] RPC error:', error);
        setHasMore(false);
        setLoading(false);
        fetchLockRef.current = false;
        return;
      }

      if (!data || data.length === 0) {
        setHasMore(false);
        setLoading(false);
        fetchLockRef.current = false;
        return;
      }

      // Update books (append if not reset, replace if reset)
      setBooks(prev => reset ? data : [...prev, ...data]);
      setHasMore(data.length === LIMIT);
      
      // Update page ref: next page after loading
      pageRef.current = reset ? 1 : currentPage + 1;

      // Load social counts for new books
      if (data.length > 0 && userId) {
        const bookKeys = data
          .map(row => row.book_key)
          .filter((key): key is string => !!key && key !== 'unknown');
        
        if (bookKeys.length > 0) {
          setSocialCounts(currentCounts => {
            const newBookKeys = bookKeys.filter(key => !currentCounts[key]);
            if (newBookKeys.length > 0) {
              // Load counts asynchronously (don't block UI)
              getBookSocialCounts(newBookKeys, userId)
                .then(counts => {
                  setSocialCounts(prev => ({ ...prev, ...counts }));
                })
                .catch(error => {
                  console.warn('[useCommunityFeed] Error loading social counts:', error);
                });
            }
            return currentCounts;
          });
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('[useCommunityFeed] Unexpected error:', error);
      setHasMore(false);
      if (reset) {
        setBooks([]);
        pageRef.current = 0;
      }
      setLoading(false);
    } finally {
      fetchLockRef.current = false;
    }
  }, [userId]);

  /**
   * Refresh the feed (reset and reload from page 0)
   */
  const refresh = useCallback(() => {
    loadBooks(true);
  }, [loadBooks]);

  /**
   * Load more books (pagination)
   */
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadBooks(false);
    }
  }, [loadBooks, loading, hasMore]);

  /**
   * Update social counts (for optimistic updates after like/unlike)
   */
  const updateSocialCounts = useCallback((bookKey: string, counts: { likes: number; comments: number; isLiked: boolean }) => {
    setSocialCounts(prev => ({
      ...prev,
      [bookKey]: counts,
    }));
  }, []);

  return {
    books,
    loading,
    hasMore,
    socialCounts,
    refresh,
    loadMore,
    updateSocialCounts,
  };
}

