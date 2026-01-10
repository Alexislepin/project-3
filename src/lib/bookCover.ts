/**
 * Fonction unique et canonique pour déterminer la couverture d'un livre.
 * Utilisée partout dans l'application (Bibliothèque, Profil, Likes, Feed, Modals).
 * 
 * Règles STRICTES:
 * 1. Si custom_cover_url existe → l'utiliser
 * 2. Sinon si cover_url existe → l'utiliser
 * 3. Sinon → utiliser /covers/placeholder-book.png
 * 
 * ❌ Ne JAMAIS tenter:
 * - OpenLibrary
 * - Google Books
 * - ISBN fallback
 * - logique conditionnelle par écran
 */

export interface BookCoverInput {
  customCoverUrl?: string | null;
  coverUrl?: string | null;
}

export function resolveBookCover(input: BookCoverInput): string {
  if (input.customCoverUrl && input.customCoverUrl.trim() !== '') {
    return input.customCoverUrl;
  }

  if (input.coverUrl && input.coverUrl.trim() !== '') {
    return input.coverUrl;
  }

  return '/covers/placeholder-book.png';
}

