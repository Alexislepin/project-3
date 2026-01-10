/**
 * Compute cover URL with robust fallback strategy
 * Priority:
 * 1) cover_url direct (best case)
 * 2) OpenLibrary cover id
 * 3) ISBN (from books.isbn or from book_key)
 * 4) book_cover_url fallback
 * 
 * @param book - Book object with cover-related fields
 * @param fallbackBookKey - Optional book_key to extract ISBN from (e.g., "isbn:9781234567890" or "ol:/works/OL123W")
 * @returns Cover URL string or null if no cover available
 * @deprecated Use computeDisplayCoverUrl() instead for better support of custom covers
 */
export function computeCoverUrl(book: any, fallbackBookKey?: string): string | null {
  // 1) cover_url direct (meilleur cas)
  if (book?.cover_url) return book.cover_url;

  // 2) OpenLibrary cover id
  const olid = book?.openlibrary_cover_id;
  if (olid) return `https://covers.openlibrary.org/b/id/${olid}-L.jpg`;

  // 3) ISBN (depuis books.isbn ou depuis book_key)
  const rawIsbn =
    (book?.isbn || '')
      .replace(/[-\s]/g, '')
      .trim();

  const key = (fallbackBookKey || book?.book_key || '').trim();

  const isbnFromKey = key.startsWith('isbn:')
    ? key.replace(/^isbn:/, '').replace(/[-\s]/g, '').trim()
    : '';

  const isbn = rawIsbn || isbnFromKey;
  if (isbn) return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

  // 4) Si tu as déjà un cover_url "book_cover_url" (selon tes objets)
  if (book?.book_cover_url) return book.book_cover_url;

  // Sinon rien
  return null;
}

/**
 * Compute display cover URL with custom cover support.
 * This is the UNIFIED function used everywhere in the app.
 * 
 * Priority:
 * 1) actorCustomCoverUrl (cover custom de l'utilisateur qui like/post) - PRIORITÉ ABSOLUE
 * 2) book.cover_url (cover stockée dans books table)
 * 3) OpenLibrary cover ID
 * 4) Google Books cover URL
 * 5) Fallback depuis bookKey (ISBN / OL work)
 * 
 * @param params - Parameters object
 * @param params.book - Book object with cover-related fields
 * @param params.bookKey - Optional book_key to extract ISBN from (e.g., "isbn:9781234567890" or "ol:/works/OL123W")
 * @param params.actorCustomCoverUrl - Optional custom cover URL from the user who liked/posted (highest priority)
 * @returns Cover URL string or null if no cover available
 */
export function computeDisplayCoverUrl(params: {
  book: any;
  bookKey?: string | null;
  actorCustomCoverUrl?: string | null; // cover perso de l'utilisateur qui like/post
}): string | null {
  const { book, bookKey, actorCustomCoverUrl } = params;

  // 1) Cover custom (priorité absolue)
  if (actorCustomCoverUrl && actorCustomCoverUrl.trim().length > 0) {
    return actorCustomCoverUrl.trim();
  }

  // 2) Cover stockée dans books (si tu en as une)
  if (book?.cover_url && book.cover_url.trim().length > 0) {
    return book.cover_url;
  }

  // 3) OpenLibrary cover ID
  const olid = book?.openlibrary_cover_id;
  if (typeof olid === 'number' && olid > 0) {
    return `https://covers.openlibrary.org/b/id/${olid}-L.jpg`;
  }

  // 4) Google Books ID
  if (book?.google_books_id && book.google_books_id.trim().length > 0) {
    return `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
  }

  // 5) Fallback depuis bookKey (ISBN / OL work) - utilise la logique existante
  const fallbackUrl = computeCoverUrl(book, bookKey || undefined);
  if (fallbackUrl) {
    return fallbackUrl;
  }

  // 6) Si tu as déjà un cover_url "book_cover_url" (selon tes objets)
  if (book?.book_cover_url && book.book_cover_url.trim().length > 0) {
    return book.book_cover_url;
  }

  // Pas de cover disponible
  return null;
}

