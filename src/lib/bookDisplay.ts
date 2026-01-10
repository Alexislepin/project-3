/**
 * Helpers for safe book display (prevents showing placeholders)
 */

/**
 * Check if a title is invalid/placeholder
 */
export function isBadTitle(t?: string | null): boolean {
  const s = (t || '').trim();
  if (!s) return true;
  if (s === '(OpenLibrary book)') return true;
  if (s.toLowerCase().includes('openlibrary book')) return true;
  if (s.toLowerCase() === 'métadonnées en cours…') return true;
  if (s.toLowerCase() === 'metadonnees en cours') return true;
  return false;
}

/**
 * Check if an author is invalid/placeholder
 */
export function isBadAuthor(a?: string | null): boolean {
  const s = (a || '').trim();
  if (!s) return true;
  if (s === 'Auteur inconnu') return true;
  return false;
}

/**
 * Get safe title for display (with fallback)
 * @param book - Book object
 * @param fallback - Fallback text (default: 'Livre')
 * @returns Safe title string
 */
export function safeTitle(book: any, fallback: string = 'Livre'): string {
  if (!book) return fallback;
  
  // Check title
  if (!isBadTitle(book.title)) {
    return book.title.trim();
  }
  
  // Try custom_title (from user_books)
  if (book.custom_title && String(book.custom_title).trim()) {
    const custom = String(book.custom_title).trim();
    if (!isBadTitle(custom)) {
      return custom;
    }
  }
  
  return fallback;
}

/**
 * Get safe author for display
 * @param book - Book object
 * @returns Safe author string or undefined
 */
export function safeAuthor(book: any): string | undefined {
  if (!book) return undefined;
  
  // Check author
  if (!isBadAuthor(book.author)) {
    return book.author.trim();
  }
  
  // Try custom_author (from user_books)
  if (book.custom_author && String(book.custom_author).trim()) {
    const custom = String(book.custom_author).trim();
    if (!isBadAuthor(custom)) {
      return custom;
    }
  }
  
  return undefined;
}

