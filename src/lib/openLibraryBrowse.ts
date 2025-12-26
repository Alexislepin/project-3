/**
 * OpenLibrary Browse - Simple search-based explorer
 * Uses OpenLibrary search.json API with rotating queries for variety
 */

const OPEN_LIBRARY_QUERIES = [
  'classics',
  'roman',
  'bestseller',
  'thriller',
  'philosophie',
  'manga',
  'romance',
  'science',
  'business',
  'biography',
  'fantasy',
  'history',
  'mystery',
  'adventure',
  'poetry',
];

export interface OpenLibraryDoc {
  id: string;
  title: string;
  authors: string;
  cover_i?: number;
  key?: string;
  isbn?: string;
  number_of_pages_median?: number;
}

/**
 * Fetch books from OpenLibrary search API with rotating queries
 * @param page Page number (0-indexed)
 * @param limit Number of books per page (default: 20)
 * @returns Array of books with id, title, authors, cover_i, key, isbn
 */
export async function fetchOpenLibraryBrowse(
  page: number,
  limit: number = 20
): Promise<OpenLibraryDoc[]> {
  try {
    // Rotate queries based on page number
    const queryIndex = page % OPEN_LIBRARY_QUERIES.length;
    const query = OPEN_LIBRARY_QUERIES[queryIndex];
    
    // Calculate page number for OpenLibrary API (1-indexed)
    const openLibraryPage = Math.floor(page / OPEN_LIBRARY_QUERIES.length) + 1;

    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&page=${openLibraryPage}&limit=${limit}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[OpenLibrary Browse] Error fetching ${query}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (!data?.docs || !Array.isArray(data.docs)) {
      return [];
    }

    // Map docs to OpenLibraryDoc format
    const books: OpenLibraryDoc[] = [];
    const seenKeys = new Set<string>();
    
    for (const doc of data.docs) {
      // Extract title
      const title = doc.title?.trim();
      if (!title) continue;

      // Extract authors
      const authors = Array.isArray(doc.author_name) && doc.author_name.length > 0
        ? doc.author_name.join(', ')
        : 'Auteur inconnu';

      // Extract cover_i
      const cover_i = typeof doc.cover_i === 'number' ? doc.cover_i : undefined;

      // Extract key (work key)
      const key = doc.key?.trim();

      // Extract ISBN (first available)
      const isbn = Array.isArray(doc.isbn) && doc.isbn.length > 0
        ? doc.isbn[0]
        : undefined;

      // Extract number_of_pages_median
      const number_of_pages_median = typeof doc.number_of_pages_median === 'number' && doc.number_of_pages_median > 0
        ? doc.number_of_pages_median
        : undefined;

      // Generate stable ID from key or fallback
      const id = key || (isbn ? `isbn:${isbn}` : `ol-${title.toLowerCase().replace(/\s+/g, '-')}`);

      // Deduplicate by key (if available) or id
      const dedupeKey = key || id;
      if (seenKeys.has(dedupeKey)) {
        continue;
      }
      seenKeys.add(dedupeKey);

      books.push({
        id,
        title,
        authors,
        cover_i,
        key,
        isbn,
        number_of_pages_median,
      });
    }

    return books;
  } catch (error) {
    console.warn('[OpenLibrary Browse] Error:', error);
    return [];
  }
}

