/**
 * Centralized cover URL resolution with priority order
 * 
 * Priority:
 * 1. custom_cover_url (user-specific manual cover)
 * 2. cover_url (from books table - OpenLibrary/external URL)
 * 3. cover_i (OpenLibrary cover ID -> construct URL)
 * 4. ISBN-based OpenLibrary URL (isbn13, isbn10, isbn)
 * 5. googleCoverUrl (Google Books)
 * 6. null (will use placeholder in BookCover component)
 */

export interface CoverResolverOptions {
  custom_cover_url?: string | null;
  cover_url?: string | null;
  cover_i?: number | null;
  openlibrary_cover_id?: number | null; // Alias for cover_i
  isbn?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  googleCoverUrl?: string | null;
}

/**
 * Get the best cover URL based on priority
 * Returns the URL string or null if no cover available
 */
export function getBestCoverUrl(options: CoverResolverOptions): string | null {
  const {
    custom_cover_url,
    cover_url,
    cover_i,
    openlibrary_cover_id,
    isbn,
    isbn13,
    isbn10,
    googleCoverUrl,
  } = options;

  // Priority 1: Custom cover URL (user-specific manual cover)
  if (custom_cover_url && custom_cover_url.trim().length > 0) {
    return custom_cover_url.trim();
  }

  // Priority 2: Cover URL from books table
  if (cover_url && cover_url.trim().length > 0) {
    return cover_url.trim();
  }

  // Priority 3: OpenLibrary cover ID (cover_i or openlibrary_cover_id)
  const coverId = cover_i || openlibrary_cover_id;
  if (coverId && typeof coverId === 'number' && coverId > 0) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`;
  }

  // Priority 4: ISBN-based OpenLibrary URL (prefer ISBN13, then ISBN10, then ISBN)
  const isbnToUse = isbn13 || isbn10 || isbn;
  if (isbnToUse) {
    const cleanIsbn = String(isbnToUse).replace(/[-\s]/g, '');
    if (cleanIsbn.length >= 10) {
      return `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
    }
  }

  // Priority 5: Google Books cover URL
  if (googleCoverUrl && googleCoverUrl.trim().length > 0) {
    return googleCoverUrl.trim();
  }

  // No cover available - return null (BookCover will show placeholder)
  return null;
}

/**
 * Get all cover sources in priority order for BookCover component
 * This is used by BookCover to try multiple sources with fallback
 */
export function getCoverSources(options: CoverResolverOptions): Array<{ type: string; url: string }> {
  const {
    custom_cover_url,
    cover_url,
    cover_i,
    openlibrary_cover_id,
    isbn,
    isbn13,
    isbn10,
    googleCoverUrl,
  } = options;

  const sources: Array<{ type: string; url: string }> = [];

  // Priority 1: Custom cover URL
  if (custom_cover_url && custom_cover_url.trim().length > 0) {
    sources.push({ type: 'custom', url: custom_cover_url.trim() });
  }

  // Priority 2: Cover URL from books table
  if (cover_url && cover_url.trim().length > 0) {
    sources.push({ type: 'initial', url: cover_url.trim() });
  }

  // Priority 3: OpenLibrary cover ID
  const coverId = cover_i || openlibrary_cover_id;
  if (coverId && typeof coverId === 'number' && coverId > 0) {
    sources.push({
      type: 'openlibrary_id',
      url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`,
    });
  }

  // Priority 4: ISBN-based OpenLibrary
  const isbnToUse = isbn13 || isbn10 || isbn;
  if (isbnToUse) {
    const cleanIsbn = String(isbnToUse).replace(/[-\s]/g, '');
    if (cleanIsbn.length >= 10) {
      sources.push({
        type: 'openlibrary_isbn',
        url: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`,
      });
    }
  }

  // Priority 5: Google Books
  if (googleCoverUrl && googleCoverUrl.trim().length > 0) {
    sources.push({ type: 'google', url: googleCoverUrl.trim() });
  }

  return sources;
}

