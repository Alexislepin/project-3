import { SupabaseClient } from '@supabase/supabase-js';
import { debugLog } from '../utils/logger';
import { getBookById, searchBookByISBN, searchBooks } from './googleBooks';
import {
  fetchEditionByIsbn,
  fetchPagesFromBooksApi,
  fetchCoverUrlWithFallback,
  fetchWorkDescription,
  fetchEditionDescription,
  generateFallbackSummary,
} from '../services/openLibrary';

/**
 * Cache mémoire pour éviter les re-hydratations fréquentes
 * Key: bookId, Value: { hydratedAt: timestamp }
 */
const hydrationCache = new Map<string, number>();
const HYDRATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

/**
 * Cache pour les descriptions (réutilise le cache existant si possible)
 */
const descriptionCache = new Map<string, { value: string | null; expiresAt: number }>();
const DESCRIPTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

interface HydrateBookMetaOptions {
  /**
   * Si true, force la ré-hydratation même si déjà hydraté récemment
   */
  force?: boolean;
  /**
   * Si true, ne met pas à jour la DB, retourne seulement les valeurs hydratées
   */
  dryRun?: boolean;
}

interface HydratedBookMeta {
  cover_url: string | null;
  total_pages: number | null;
  description: string | null;
  openlibrary_cover_id: number | null;
  openlibrary_work_key: string | null;
  openlibrary_edition_key: string | null;
}

/**
 * Vérifie si un livre a déjà été hydraté récemment
 */
function wasRecentlyHydrated(bookId: string): boolean {
  const cached = hydrationCache.get(bookId);
  if (!cached) return false;
  return Date.now() - cached < HYDRATION_CACHE_TTL_MS;
}

/**
 * Marque un livre comme hydraté
 */
function markAsHydrated(bookId: string): void {
  hydrationCache.set(bookId, Date.now());
}

/**
 * Récupère un livre depuis la DB (par ID ou row)
 */
async function getBookFromDB(
  supabase: SupabaseClient,
  bookIdOrRow: string | any
): Promise<any | null> {
  if (typeof bookIdOrRow === 'string') {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookIdOrRow)
      .single();
    if (error) {
      console.error('[hydrateBookMeta] Error fetching book:', error);
      return null;
    }
    return data;
  }
  return bookIdOrRow;
}

/**
 * Récupère la description depuis le cache ou OpenLibrary
 */
async function getDescriptionFromCacheOrOpenLibrary(
  workKey: string | null,
  editionKey: string | null
): Promise<string | null> {
  // Vérifier le cache
  const cacheKey = workKey || editionKey || '';
  if (cacheKey) {
    const cached = descriptionCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }
  }

  // Essayer work description
  if (workKey) {
    try {
      const desc = await fetchWorkDescription(workKey);
      if (desc && desc.trim().length > 0) {
        if (cacheKey) {
          descriptionCache.set(cacheKey, {
            value: desc,
            expiresAt: Date.now() + DESCRIPTION_CACHE_TTL_MS,
          });
        }
        return desc;
      }
    } catch (error) {
      debugLog('[hydrateBookMeta] Error fetching work description:', error);
    }
  }

  // Essayer edition description
  if (editionKey) {
    try {
      const desc = await fetchEditionDescription(editionKey);
      if (desc && desc.trim().length > 0) {
        if (cacheKey) {
          descriptionCache.set(cacheKey, {
            value: desc,
            expiresAt: Date.now() + DESCRIPTION_CACHE_TTL_MS,
          });
        }
        return desc;
      }
    } catch (error) {
      debugLog('[hydrateBookMeta] Error fetching edition description:', error);
    }
  }

  // Cache l'échec
  if (cacheKey) {
    descriptionCache.set(cacheKey, {
      value: null,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1h pour les échecs
    });
  }

  return null;
}

/**
 * Hydrate les métadonnées d'un livre depuis plusieurs sources
 * 
 * Priorités:
 * - total_pages: editionData.pages > Google pageCount > booksApi pages > keep existing
 * - cover_url: OpenLibrary cover_id > ISBN cover > Google thumbnail > placeholder
 * - description: DB non-vide > Google description > OpenLibrary work description > OpenLibrary edition description > fallback généré
 */
export async function hydrateBookMeta(
  supabase: SupabaseClient,
  bookIdOrRow: string | any,
  options: HydrateBookMetaOptions = {}
): Promise<HydratedBookMeta | null> {
  const { force = false, dryRun = false } = options;

  try {
    // 1. Récupérer le livre depuis la DB
    const dbBook = await getBookFromDB(supabase, bookIdOrRow);
    if (!dbBook || !dbBook.id) {
      console.error('[hydrateBookMeta] Book not found');
      return null;
    }

    const bookId = dbBook.id;

    // 2. Vérifier si déjà hydraté récemment (sauf si force)
    if (!force && wasRecentlyHydrated(bookId)) {
      debugLog(`[hydrateBookMeta] Book ${bookId} was recently hydrated, skipping`);
      return {
        cover_url: dbBook.cover_url || null,
        total_pages: dbBook.total_pages || null,
        description: dbBook.description || null,
        openlibrary_cover_id: dbBook.openlibrary_cover_id || null,
        openlibrary_work_key: dbBook.openlibrary_work_key || null,
        openlibrary_edition_key: dbBook.openlibrary_edition_key || null,
      };
    }

    // 3. Vérifier si déjà complet (idempotent)
    const hasCover = dbBook.cover_url && dbBook.cover_url.trim().length > 0;
    const hasPages = dbBook.total_pages && dbBook.total_pages > 0;
    const hasDescription = dbBook.description && dbBook.description.trim().length > 0;

    if (!force && hasCover && hasPages && hasDescription) {
      debugLog(`[hydrateBookMeta] Book ${bookId} already complete, skipping`);
      markAsHydrated(bookId);
      return {
        cover_url: dbBook.cover_url,
        total_pages: dbBook.total_pages,
        description: dbBook.description,
        openlibrary_cover_id: dbBook.openlibrary_cover_id || null,
        openlibrary_work_key: dbBook.openlibrary_work_key || null,
        openlibrary_edition_key: dbBook.openlibrary_edition_key || null,
      };
    }

    debugLog(`[hydrateBookMeta] Starting hydration for book ${bookId}`, {
      hasCover,
      hasPages,
      hasDescription,
    });

    // 4. Collecter les identifiants disponibles
    const isbn = dbBook.isbn || dbBook.isbn13 || dbBook.isbn10 || null;
    const googleBooksId = dbBook.google_books_id || null;
    const openlibraryWorkKey = dbBook.openlibrary_work_key || null;
    const openlibraryEditionKey = dbBook.openlibrary_edition_key || null;
    const openlibraryCoverId = dbBook.openlibrary_cover_id || null;

    // 5. Initialiser les résultats avec les valeurs existantes
    const result: HydratedBookMeta = {
      cover_url: dbBook.cover_url || null,
      total_pages: dbBook.total_pages || null,
      description: dbBook.description || null,
      openlibrary_cover_id: openlibraryCoverId,
      openlibrary_work_key: openlibraryWorkKey,
      openlibrary_edition_key: openlibraryEditionKey,
    };

    const sources: string[] = [];

    // 6. HYDRO total_pages
    if (!hasPages) {
      let foundPages: number | null = null;

      // Priority 1: OpenLibrary Edition API (via ISBN)
      if (isbn) {
        try {
          const editionData = await fetchEditionByIsbn(isbn);
          if (editionData?.pages && editionData.pages > 0) {
            foundPages = editionData.pages;
            sources.push('pages:OL_edition');
            
            // Bonus: récupérer aussi cover_id et keys si manquants
            if (!result.openlibrary_cover_id && editionData.coverId) {
              result.openlibrary_cover_id = editionData.coverId;
            }
            if (!result.openlibrary_edition_key && editionData.editionKey) {
              result.openlibrary_edition_key = editionData.editionKey;
            }
            if (!result.openlibrary_work_key && editionData.workKey) {
              result.openlibrary_work_key = editionData.workKey;
            }
          }
        } catch (error) {
          debugLog('[hydrateBookMeta] Error fetching edition by ISBN:', error);
        }
      }

      // Priority 2: Google Books API
      if (!foundPages && googleBooksId) {
        try {
          const googleBook = await getBookById(googleBooksId);
          if (googleBook?.pageCount && googleBook.pageCount > 0) {
            foundPages = googleBook.pageCount;
            sources.push('pages:Google');
          }
        } catch (error) {
          debugLog('[hydrateBookMeta] Error fetching Google Books:', error);
        }
      }

      // Priority 3: OpenLibrary Books API (fallback)
      if (!foundPages && isbn) {
        try {
          const pages = await fetchPagesFromBooksApi(isbn);
          if (pages && pages > 0) {
            foundPages = pages;
            sources.push('pages:OL_books_api');
          }
        } catch (error) {
          debugLog('[hydrateBookMeta] Error fetching pages from Books API:', error);
        }
      }

      if (foundPages) {
        result.total_pages = foundPages;
      }
    }

    // 7. HYDRO cover_url
    if (!hasCover) {
      let foundCover: string | null = null;

      // Priority 1: OpenLibrary cover_id
      if (result.openlibrary_cover_id) {
        const coverResult = await fetchCoverUrlWithFallback(result.openlibrary_cover_id, isbn || undefined);
        if (coverResult.url) {
          foundCover = coverResult.url;
          sources.push(`cover:${coverResult.source}`);
        }
      }

      // Priority 2: OpenLibrary ISBN
      if (!foundCover && isbn) {
        const coverResult = await fetchCoverUrlWithFallback(undefined, isbn);
        if (coverResult.url) {
          foundCover = coverResult.url;
          sources.push(`cover:${coverResult.source}`);
          
          // Si on a trouvé via ISBN, on peut aussi avoir le cover_id depuis editionData
          if (!result.openlibrary_cover_id && isbn) {
            try {
              const editionData = await fetchEditionByIsbn(isbn);
              if (editionData?.coverId) {
                result.openlibrary_cover_id = editionData.coverId;
              }
            } catch (error) {
              // Ignore
            }
          }
        }
      }

      // Priority 3: Google Books thumbnail
      if (!foundCover && googleBooksId) {
        try {
          const googleBook = await getBookById(googleBooksId);
          if (googleBook?.thumbnail) {
            foundCover = googleBook.thumbnail;
            sources.push('cover:Google');
          }
        } catch (error) {
          debugLog('[hydrateBookMeta] Error fetching Google Books cover:', error);
        }
      }

      if (foundCover) {
        result.cover_url = foundCover;
      }
    }

    // 8. HYDRO description
    if (!hasDescription) {
      let foundDescription: string | null = null;

      // Priority 1: Google Books description
      if (googleBooksId) {
        try {
          const googleBook = await getBookById(googleBooksId);
          if (googleBook?.description && googleBook.description.trim().length > 0) {
            foundDescription = googleBook.description.trim();
            sources.push('desc:Google');
          }
        } catch (error) {
          debugLog('[hydrateBookMeta] Error fetching Google Books description:', error);
        }
      }

      // Priority 2: OpenLibrary work description
      if (!foundDescription && result.openlibrary_work_key) {
        foundDescription = await getDescriptionFromCacheOrOpenLibrary(
          result.openlibrary_work_key,
          null
        );
        if (foundDescription) {
          sources.push('desc:OL_work');
        }
      }

      // Priority 3: OpenLibrary edition description
      if (!foundDescription && result.openlibrary_edition_key) {
        foundDescription = await getDescriptionFromCacheOrOpenLibrary(
          null,
          result.openlibrary_edition_key
        );
        if (foundDescription) {
          sources.push('desc:OL_edition');
        }
      }

      // Priority 4: Fallback généré
      if (!foundDescription) {
        foundDescription = generateFallbackSummary({
          title: dbBook.title,
          author: dbBook.author,
          total_pages: result.total_pages || dbBook.total_pages,
        });
        if (foundDescription) {
          sources.push('desc:fallback');
        }
      }

      if (foundDescription) {
        result.description = foundDescription;
      }
    }

    // 9. Mettre à jour la DB si des valeurs ont été trouvées
    const updates: any = {};
    let hasUpdates = false;

    if (result.cover_url && result.cover_url !== dbBook.cover_url) {
      updates.cover_url = result.cover_url;
      hasUpdates = true;
    }

    if (result.total_pages && result.total_pages !== dbBook.total_pages) {
      updates.total_pages = result.total_pages;
      hasUpdates = true;
    }

    if (result.description && result.description !== dbBook.description) {
      updates.description = result.description;
      hasUpdates = true;
    }

    if (result.openlibrary_cover_id && result.openlibrary_cover_id !== dbBook.openlibrary_cover_id) {
      updates.openlibrary_cover_id = result.openlibrary_cover_id;
      hasUpdates = true;
    }

    if (result.openlibrary_work_key && result.openlibrary_work_key !== dbBook.openlibrary_work_key) {
      updates.openlibrary_work_key = result.openlibrary_work_key;
      hasUpdates = true;
    }

    if (result.openlibrary_edition_key && result.openlibrary_edition_key !== dbBook.openlibrary_edition_key) {
      updates.openlibrary_edition_key = result.openlibrary_edition_key;
      hasUpdates = true;
    }

    if (hasUpdates && !dryRun) {
      const { error: updateError } = await supabase
        .from('books')
        .update(updates)
        .eq('id', bookId);

      if (updateError) {
        console.error('[hydrateBookMeta] Error updating book:', updateError);
      } else {
        debugLog(`[hydrateBookMeta] Updated book ${bookId}`, { updates, sources });
      }
    }

    // 10. Marquer comme hydraté
    markAsHydrated(bookId);

    debugLog(`[hydrateBookMeta] Completed for book ${bookId}`, {
      found: {
        cover: !!result.cover_url,
        pages: !!result.total_pages,
        desc: !!result.description,
      },
      sources,
    });

    return result;
  } catch (error) {
    console.error('[hydrateBookMeta] Unexpected error:', error);
    return null;
  }
}

