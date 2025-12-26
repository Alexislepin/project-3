/**
 * Resolves the best cover URL for a book
 * Priority: OpenLibrary (if ISBN exists) > Google Books cover > null
 */
export interface CoverResolverOptions {
  isbn?: string | null;
  googleCoverUrl?: string | null;
}

export function getBestCoverUrl({ isbn, googleCoverUrl }: CoverResolverOptions): string | null {
  // Priority 1: Google Books cover if available (better quality)
  if (googleCoverUrl) {
    return googleCoverUrl;
  }

  // Priority 2: OpenLibrary if ISBN exists (avec ?default=false pour éviter redirection archive.org)
  if (isbn) {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    if (cleanIsbn.length >= 10) {
      return `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
    }
  }

  // No cover available
  return null;
}

