import { useState, useEffect, useRef, useCallback } from 'react';
import { searchBooks as searchGoogleBooks, Book as GoogleBook } from '../lib/googleBooks';
import { searchBooks as searchOpenLibraryBooks } from '../services/openLibrary';
import { debugLog } from '../utils/logger';

/**
 * Normalized search result (merged from multiple sources)
 */
export type SearchResult = GoogleBook & {
  source?: 'google' | 'openlibrary' | 'archive';
};

/**
 * Hook to manage Explorer search functionality
 * 
 * Features:
 * - Searches Google Books first, then OpenLibrary as fallback
 * - Debounced search (300ms)
 * - Merges and normalizes results
 * - Aborts previous requests when new search starts
 * - Strictly separate from community feed (mutually exclusive)
 */
export function useExplorerSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  
  // Debounce timer
  const searchTimeoutRef = useRef<number | null>(null);
  // Abort controller for canceling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Perform search across multiple sources
   * @param searchQuery - Search query (minimum 2 characters)
   */
  const search = useCallback(async (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim();
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // If query is too short, clear results
    if (trimmedQuery.length < 2) {
      setResults([]);
      setSearching(false);
      setQuery('');
      return;
    }

    setQuery(trimmedQuery);
    setSearching(true);

    // Debounce: wait 300ms before searching
    searchTimeoutRef.current = window.setTimeout(async () => {
      // Create new abort controller for this search
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        let mergedResults: SearchResult[] = [];

        // Priority 1: Google Books API
        try {
          if (!abortController.signal.aborted) {
            const googleResults = await searchGoogleBooks(trimmedQuery, abortController.signal, 0, 20);
            if (googleResults && googleResults.length > 0) {
              mergedResults = googleResults.map(book => ({
                ...book,
                source: 'google' as const,
              }));
              debugLog(`[useExplorerSearch] Found ${googleResults.length} results from Google Books`);
            }
          }
        } catch (googleError: any) {
          if (googleError?.name === 'AbortError') {
            // Request was aborted, ignore
            return;
          }
          if (googleError?.message?.includes('API key')) {
            debugLog('[useExplorerSearch] Google Books API key missing, trying OpenLibrary');
          } else {
            debugLog('[useExplorerSearch] Google Books error, trying OpenLibrary:', googleError);
          }
        }

        // Priority 2: OpenLibrary (if Google returned 0 results or was aborted)
        if (mergedResults.length === 0 && !abortController.signal.aborted) {
          try {
            const olResults = await searchOpenLibraryBooks(trimmedQuery, 1);
            if (olResults && olResults.length > 0) {
              // Convert OpenLibraryBook to GoogleBook format
              mergedResults = olResults.map((olBook) => ({
                id: olBook.openLibraryKey || olBook.isbn || `ol-${olBook.title}`,
                title: olBook.title,
                authors: olBook.author,
                category: undefined,
                pageCount: undefined, // OpenLibraryBook doesn't expose pages directly
                publisher: undefined,
                isbn: olBook.isbn || undefined,
                isbn13: olBook.isbn13 || undefined,
                isbn10: olBook.isbn10 || undefined,
                description: undefined,
                thumbnail: olBook.coverUrl || undefined,
                cover_i: olBook.cover_i,
                source: 'openlibrary' as const,
              }));
              debugLog(`[useExplorerSearch] Found ${olResults.length} results from OpenLibrary`);
            }
          } catch (olError: any) {
            if (olError?.name === 'AbortError') {
              // Request was aborted, ignore
              return;
            }
            debugLog('[useExplorerSearch] OpenLibrary error:', olError);
          }
        }

        // Only update if request wasn't aborted
        if (!abortController.signal.aborted) {
          setResults(mergedResults);
          setSearching(false);
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          // Request was aborted, ignore
          return;
        }
        console.error('[useExplorerSearch] Unexpected error:', error);
        setResults([]);
        setSearching(false);
      }
    }, 300); // 300ms debounce
  }, []);

  /**
   * Clear search results and reset state
   */
  const clear = useCallback(() => {
    // Clear timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // Abort in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setResults([]);
    setSearching(false);
    setQuery('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    results,
    searching,
    query,
    search,
    clear,
  };
}

