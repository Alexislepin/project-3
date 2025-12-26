import { debugLog, fatalError } from '../utils/logger';

/**
 * OpenLibrary Book interface (normalized)
 */
export interface OpenLibraryBook {
  title: string;
  author: string;
  isbn?: string;
  isbn13?: string;
  isbn10?: string;
  coverUrl: string | null;
  cover_i?: number; // OpenLibrary cover ID (most reliable for covers)
  pages?: number;
  firstPublishYear?: number;
  openLibraryKey?: string; // e.g., "/works/OL123456W"
}

/**
 * OpenLibrary Search API response structure
 */
interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  numFoundExact: boolean;
  docs: Array<{
    title?: string;
    author_name?: string[];
    isbn?: string[];
    cover_i?: number;
    number_of_pages_median?: number;
    first_publish_year?: number;
    key?: string; // e.g., "/works/OL123456W"
    [key: string]: any;
  }>;
}

// Simple env guard for dev-only logs
const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

/**
 * Throttle: track last request time for generic search
 */
let lastSearchRequestTime = 0;
const SEARCH_THROTTLE_MS = 300;

/**
 * Cache for generic search: Map<query, results>
 */
const searchCache = new Map<string, OpenLibraryBook[]>();

/**
 * Cache for ISBN lookups (to protect against rate limits)
 * - In-memory Map
 * - Mirrored in localStorage with TTL
 */
type CachedIsbnEntry = {
  value: OpenLibraryBook | null;
  expiresAt: number;
};

const isbnCache = new Map<string, CachedIsbnEntry>();
const ISBN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getIsbnCacheKey(isbn: string): string {
  const clean = isbn.replace(/[-\s]/g, '').toLowerCase();
  return `ol:isbn:${clean}`;
}

function loadIsbnFromLocalStorage(isbn: string): CachedIsbnEntry | null {
  if (typeof window === 'undefined' || !('localStorage' in window)) return null;
  try {
    const key = getIsbnCacheKey(isbn);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedIsbnEntry;
    if (!parsed || typeof parsed.expiresAt !== 'number') return null;
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveIsbnToLocalStorage(isbn: string, entry: CachedIsbnEntry): void {
  if (typeof window === 'undefined' || !('localStorage' in window)) return;
  try {
    const key = getIsbnCacheKey(isbn);
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Ignore localStorage errors (quota, private mode, etc.)
  }
}

/**
 * Get cover URL for an OpenLibrary book item
 * Priority:
 * 1) cover_i => https://covers.openlibrary.org/b/id/{cover_i}-L.jpg (most reliable)
 * 2) isbn => https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg (fallback)
 * 3) null (will show placeholder)
 * Note: ?default=false évite les redirections vers archive.org
 */
export function getCoverUrl(item: {
  cover_i?: number;
  isbn?: string[];
}): string | null {
  // Priority 1: cover_i (cover ID) - most reliable
  if (typeof item.cover_i === 'number' && item.cover_i > 0) {
    return `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg?default=false`;
  }

  // Priority 2: ISBN (first valid ISBN in array)
  if (Array.isArray(item.isbn) && item.isbn.length > 0) {
    const firstIsbn = item.isbn[0].replace(/[-\s]/g, '');
    if (firstIsbn.length >= 10) {
      return `https://covers.openlibrary.org/b/isbn/${firstIsbn}-L.jpg?default=false`;
    }
  }

  // No cover available
  return null;
}

/**
 * OpenLibrary Subjects API response structure
 */
interface OpenLibrarySubjectsResponse {
  works: Array<{
    key: string; // e.g., "/works/OL123456W"
    title: string;
    authors?: Array<{ key: string; name: string }>;
    cover_id?: number;
    cover_i?: number;
    first_publish_year?: number;
    edition_count?: number;
    [key: string]: any;
  }>;
  work_count: number;
}

/**
 * Check if a string contains Cyrillic characters
 */
function containsCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

/**
 * Check if a string is mostly non-Latin (too many non-Latin characters)
 */
function isMostlyNonLatin(text: string): boolean {
  const nonLatinRegex = /[^\u0000-\u007F\u00A0-\u00FF\u0100-\u017F\u0180-\u024F]/g;
  const nonLatinCount = (text.match(nonLatinRegex) || []).length;
  return nonLatinCount > text.length * 0.3; // More than 30% non-Latin
}

/**
 * Fetch books from OpenLibrary Subjects API (French literature)
 * This is more reliable than search for getting French-only books
 */
export async function fetchBySubject(
  subject: string = 'french_literature',
  limit: number = 20,
  offset: number = 0
): Promise<OpenLibraryBook[]> {
  try {
    const url = `https://openlibrary.org/subjects/${subject}.json?limit=${limit}&offset=${offset}`;
    
    if (isDev) {
      debugLog(`OpenLibrary Subjects API: ${url}`);
    }

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      fatalError(`OpenLibrary Subjects API error (${response.status}):`, errorText);
      return [];
    }

    const data: OpenLibrarySubjectsResponse = await response.json();

    if (!data.works || !Array.isArray(data.works)) {
      if (isDev) {
        debugLog('OpenLibrary Subjects API returned invalid data structure');
      }
      return [];
    }

    // Normalize and filter works
    const normalizedBooks: OpenLibraryBook[] = [];
    
    for (const work of data.works) {
      // Filter out Cyrillic titles
      if (containsCyrillic(work.title)) {
        continue;
      }

      // Filter out mostly non-Latin titles
      if (isMostlyNonLatin(work.title)) {
        continue;
      }

      // Extract author
      const author = work.authors && work.authors.length > 0
        ? work.authors[0].name
        : 'Auteur inconnu';

      // Filter out Cyrillic authors
      if (containsCyrillic(author)) {
        continue;
      }

      // Extract cover ID (prefer cover_id, fallback to cover_i)
      const coverId = work.cover_id || work.cover_i;

      // Only include books with a cover ID (required for Explorer)
      if (!coverId || typeof coverId !== 'number' || coverId <= 0) {
        continue;
      }

      // Normalize to OpenLibraryBook format
      const normalized: OpenLibraryBook = {
        title: work.title.trim(),
        author: author.trim(),
        cover_i: coverId,
        coverUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`,
        firstPublishYear: work.first_publish_year,
        openLibraryKey: work.key,
      };

      normalizedBooks.push(normalized);
    }

    if (isDev) {
      debugLog(`OpenLibrary Subjects API returned ${normalizedBooks.length} valid French books (filtered from ${data.works.length} works)`);
    }

    return normalizedBooks;
  } catch (error) {
    fatalError('Error fetching from OpenLibrary Subjects API:', error);
    return [];
  }
}

/**
 * Normalize OpenLibrary search result to our format
 */
function normalizeBook(doc: OpenLibrarySearchResponse['docs'][0]): OpenLibraryBook | null {
  if (!doc.title) {
    return null;
  }

  const title = doc.title.trim();
  const author = Array.isArray(doc.author_name) && doc.author_name.length > 0
    ? doc.author_name[0].trim()
    : 'Auteur inconnu';

  if (!title || !author) {
    return null;
  }

  // Extract ISBNs (prefer ISBN13, fallback to ISBN10)
  let isbn: string | undefined;
  let isbn13: string | undefined;
  let isbn10: string | undefined;

  if (Array.isArray(doc.isbn) && doc.isbn.length > 0) {
    // Find ISBN13 (13 digits) and ISBN10 (10 digits)
    for (const isbnStr of doc.isbn) {
      const clean = isbnStr.replace(/[-\s]/g, '');
      if (clean.length === 13) {
        isbn13 = clean;
        isbn = clean;
      } else if (clean.length === 10 && !isbn10) {
        isbn10 = clean;
        if (!isbn) {
          isbn = clean;
        }
      }
    }
    // If no ISBN13 found, use first ISBN as fallback
    if (!isbn && doc.isbn.length > 0) {
      isbn = doc.isbn[0].replace(/[-\s]/g, '');
    }
  }

  const coverUrl = getCoverUrl(doc);
  const cover_i = typeof doc.cover_i === 'number' && doc.cover_i > 0 ? doc.cover_i : undefined;
  const pages = typeof doc.number_of_pages_median === 'number' && doc.number_of_pages_median > 0
    ? doc.number_of_pages_median
    : undefined;
  const firstPublishYear = typeof doc.first_publish_year === 'number' && doc.first_publish_year > 0
    ? doc.first_publish_year
    : undefined;

  return {
    title,
    author,
    isbn,
    isbn13,
    isbn10,
    coverUrl,
    cover_i,
    pages,
    firstPublishYear,
    openLibraryKey: doc.key,
  };
}

/**
 * Search books using OpenLibrary Search API
 * Uses throttle (300ms) and cache to avoid rate limits
 * 
 * @param query Search query (e.g., "roman", "classiques français")
 * @param page Page number (default: 1)
 * @returns Normalized list of books
 */
export async function searchBooks(query: string, page: number = 1): Promise<OpenLibraryBook[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = query.trim().toLowerCase();

  // Check cache first (only for page 1 to avoid caching all pages)
  if (page === 1 && searchCache.has(normalizedQuery)) {
    if (isDev) {
      debugLog(`OpenLibrary cache hit for query: "${normalizedQuery}"`);
    }
    return searchCache.get(normalizedQuery)!;
  }

  // Throttle: wait if last request was < 300ms ago
  const now = Date.now();
  const timeSinceLastRequest = now - lastSearchRequestTime;
  if (timeSinceLastRequest < SEARCH_THROTTLE_MS) {
    const waitTime = SEARCH_THROTTLE_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastSearchRequestTime = Date.now();

  try {
    // OpenLibrary Search API with pagination
    // Docs: https://openlibrary.org/dev/docs/api/search
    const searchParams = new URLSearchParams({
      q: normalizedQuery,
      fields: 'title,author_name,isbn,cover_i,number_of_pages_median,key,first_publish_year',
      limit: '20',
      page: String(page),
      language: 'fre', // Filter for French books
    });

    const url = `https://openlibrary.org/search.json?${searchParams}`;
    if (isDev) {
      debugLog(`OpenLibrary search: ${url}`);
    }

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      fatalError(`OpenLibrary API error (${response.status}):`, errorText);
      return [];
    }

    const data: OpenLibrarySearchResponse = await response.json();

    if (!data.docs || !Array.isArray(data.docs)) {
      if (isDev) {
        debugLog('OpenLibrary API returned invalid data structure');
      }
      return [];
    }

    // Normalize results
    const normalizedBooks: OpenLibraryBook[] = [];
    for (const doc of data.docs) {
      const normalized = normalizeBook(doc);
      if (normalized) {
        normalizedBooks.push(normalized);
      }
    }

    // Cache results (only page 1)
    if (page === 1) {
      searchCache.set(normalizedQuery, normalizedBooks);
    }
    if (isDev) {
      debugLog(`OpenLibrary search returned ${normalizedBooks.length} books for query: "${normalizedQuery}" page ${page}`);
    }

    return normalizedBooks;
  } catch (error) {
    fatalError('Error searching OpenLibrary:', error);
    return [];
  }
}

/**
 * Clear the search cache (useful for testing or forced refresh)
 */
export function clearSearchCache(): void {
  searchCache.clear();
}

/**
 * Fetch a single book by ISBN using OpenLibrary Search API
 * Uses in-memory + localStorage cache with TTL 7 days to avoid rate limits.
 *
 * NOTE: This prefers metadata from the search API; cover URL is validated via Covers API.
 */
export async function fetchByIsbn(isbn: string): Promise<{
  title: string;
  authors: string;
  description?: string;
  isbn13?: string;
  isbn10?: string;
  openLibraryWorkKey?: string;
  coverUrl?: string;
  cover_i?: number;
} | null> {
  if (!isbn) return null;

  const cleanIsbn = isbn.replace(/[-\s]/g, '');
  if (!cleanIsbn || cleanIsbn.length < 10) {
    return null;
  }

  const cacheKey = cleanIsbn.toLowerCase();

  // 1) In-memory cache
  const inMem = isbnCache.get(cacheKey);
  if (inMem && Date.now() < inMem.expiresAt && inMem.value) {
    // Convert OpenLibraryBook to return type format
    const cached = inMem.value;
    return {
      title: cached.title,
      authors: cached.author, // OpenLibraryBook.author -> authors
      description: undefined,
      isbn13: cached.isbn13,
      isbn10: cached.isbn10,
      openLibraryWorkKey: cached.openLibraryKey,
      coverUrl: cached.coverUrl || undefined,
      cover_i: cached.cover_i,
    };
  }

  // 2) localStorage cache
  const fromLs = loadIsbnFromLocalStorage(cleanIsbn);
  if (fromLs && Date.now() < fromLs.expiresAt && fromLs.value) {
    isbnCache.set(cacheKey, fromLs);
    // Convert OpenLibraryBook to return type format
    const cached = fromLs.value;
    return {
      title: cached.title,
      authors: cached.author, // OpenLibraryBook.author -> authors
      description: undefined,
      isbn13: cached.isbn13,
      isbn10: cached.isbn10,
      openLibraryWorkKey: cached.openLibraryKey,
      coverUrl: cached.coverUrl || undefined,
      cover_i: cached.cover_i,
    };
  }

  try {
    // 3) Fetch metadata from OpenLibrary search API
    const params = new URLSearchParams({
      isbn: cleanIsbn,
      fields: 'title,author_name,isbn,cover_i,number_of_pages_median,key',
      limit: '1',
    });

    const url = `https://openlibrary.org/search.json?${params}`;
    if (isDev) {
      debugLog(`OpenLibrary fetchByIsbn: ${url}`);
    }

    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      fatalError(`OpenLibrary fetchByIsbn error (${res.status}):`, txt);
      const entry: CachedIsbnEntry = { value: null, expiresAt: Date.now() + ISBN_CACHE_TTL_MS };
      isbnCache.set(cacheKey, entry);
      saveIsbnToLocalStorage(cleanIsbn, entry);
      return null;
    }

    const data: OpenLibrarySearchResponse = await res.json();
    if (!data.docs || data.docs.length === 0) {
      const entry: CachedIsbnEntry = { value: null, expiresAt: Date.now() + ISBN_CACHE_TTL_MS };
      isbnCache.set(cacheKey, entry);
      saveIsbnToLocalStorage(cleanIsbn, entry);
      return null;
    }

    const doc = data.docs[0];

    // Normalize basic fields
    const normalized = normalizeBook(doc);
    if (!normalized) {
      const entry: CachedIsbnEntry = { value: null, expiresAt: Date.now() + ISBN_CACHE_TTL_MS };
      isbnCache.set(cacheKey, entry);
      saveIsbnToLocalStorage(cleanIsbn, entry);
      return null;
    }

    const title = normalized.title;
    const authors = normalized.author; // OpenLibraryBook.author -> authors in return type
    const isbn13 = normalized.isbn13;
    const isbn10 = normalized.isbn10;
    const openLibraryWorkKey = normalized.openLibraryKey;
    const cover_i = normalized.cover_i; // Extract cover_i from normalized book

    // 4) Resolve cover URL via Covers API, validating 200 vs 404
    // Note: We prefer cover_i (already in normalized), but we can also try ISBN as fallback
    const tryIsbns: string[] = [];
    // First: original scanned ISBN
    tryIsbns.push(cleanIsbn);
    // Then: isbn13 if different
    if (isbn13 && isbn13 !== cleanIsbn) {
      tryIsbns.push(isbn13);
    }

    let coverUrl: string | undefined;
    // Priority: use cover_i if available (most reliable, avec ?default=false)
    if (cover_i) {
      coverUrl = `https://covers.openlibrary.org/b/id/${cover_i}-L.jpg?default=false`;
    } else {
      // Fallback: try ISBN-based URLs (avec ?default=false)
      for (const candidate of tryIsbns) {
        const urlCover = `https://covers.openlibrary.org/b/isbn/${candidate}-L.jpg?default=false`;
        try {
          const headRes = await fetch(urlCover, { method: 'HEAD' });
          if (headRes.ok) {
            coverUrl = urlCover;
            break;
          }
          // 404 or other status: try next candidate
        } catch {
          // Network error, continue to next
        }
      }
    }

    const result = {
      title,
      authors,
      description: undefined,
      isbn13,
      isbn10,
      openLibraryWorkKey,
      coverUrl,
      cover_i,
    };

    // Store as OpenLibraryBook format in cache (for consistency)
    const cacheEntry: OpenLibraryBook = {
      title,
      author: authors, // Return type has 'authors', but cache uses 'author'
      isbn,
      isbn13,
      isbn10,
      coverUrl: coverUrl || null,
      cover_i,
      openLibraryKey: openLibraryWorkKey,
    };
    
    const entry: CachedIsbnEntry = {
      value: cacheEntry,
      expiresAt: Date.now() + ISBN_CACHE_TTL_MS,
    };
    isbnCache.set(cacheKey, entry);
    saveIsbnToLocalStorage(cleanIsbn, entry);

    return result;
  } catch (error) {
    fatalError('Error in fetchByIsbn (OpenLibrary):', error);
    const entry: CachedIsbnEntry = { value: null, expiresAt: Date.now() + ISBN_CACHE_TTL_MS };
    isbnCache.set(cacheKey, entry);
    saveIsbnToLocalStorage(cleanIsbn, entry);
    return null;
  }
}


