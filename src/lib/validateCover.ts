/**
 * Validation de cover URL avant d'afficher un livre
 * Vérifie que l'URL retourne une vraie image (pas 404, pas placeholder)
 */
export async function validateCoverUrl(url: string | null | undefined, timeoutMs: number = 2500): Promise<boolean> {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return false;
  }

  // Rejeter immédiatement les URLs archive.org (instables)
  if (url.includes('archive.org')) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Essayer HEAD d'abord (plus léger)
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });
    } catch (headError: any) {
      // Si HEAD échoue (CORS ou autre), essayer GET
      if (headError?.name === 'AbortError') {
        clearTimeout(timeoutId);
        return false;
      }
      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache',
        headers: {
          'Range': 'bytes=0-5000', // Lire seulement les premiers 5KB pour valider
        },
      });
    }

    clearTimeout(timeoutId);

    // Vérifier status HTTP
    if (!response.ok || response.status !== 200) {
      return false;
    }

    // Vérifier content-type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return false;
    }

    // Optionnel: vérifier content-length (rejeter si trop petit = placeholder text-only)
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size < 5000) {
        // Trop petit, probablement un placeholder
        return false;
      }
    }

    return true;
  } catch (error: any) {
    // Timeout, CORS, réseau => considérer comme invalide
    if (error?.name === 'AbortError') {
      return false;
    }
    return false;
  }
}

/**
 * Obtient le meilleur candidat cover URL pour un livre
 * Retourne null si aucun cover valide trouvé
 */
export function getCoverCandidate(book: {
  cover_i?: number | null;
  isbn13?: string | null;
  isbn10?: string | null;
  isbn?: string | null;
  googleCoverUrl?: string | null;
  coverUrl?: string | null;
  thumbnail?: string | null;
}): string | null {
  // Priority 1: OpenLibrary cover by cover_i (le plus fiable)
  if (typeof book.cover_i === 'number' && book.cover_i > 0) {
    return `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg?default=false`;
  }

  // Priority 2: OpenLibrary cover by ISBN (isbn13 prioritaire)
  const isbn = book.isbn13 || book.isbn10 || book.isbn;
  if (isbn) {
    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    if (cleanIsbn.length >= 10) {
      return `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
    }
  }

  // Priority 3: Google Books cover (si présent)
  if (book.googleCoverUrl) {
    return book.googleCoverUrl;
  }

  // Priority 4: coverUrl/thumbnail existant (si pas archive.org)
  const existingUrl = book.coverUrl || book.thumbnail;
  if (existingUrl && !existingUrl.includes('archive.org')) {
    return existingUrl;
  }

  return null;
}

