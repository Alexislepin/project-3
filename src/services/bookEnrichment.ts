import { debugLog } from '../utils/logger';
import { getBookById, searchBookByISBN } from '../lib/googleBooks';
import {
  fetchEditionByIsbn,
  fetchPagesFromBooksApi,
  fetchCoverUrlWithFallback,
  fetchWorkDescription,
  fetchEditionDescription,
} from './openLibrary';

/**
 * Cache mémoire pour éviter les re-enrichissements fréquents
 * Key: cacheKey (isbn ou google_books_id), Value: { metadata, ts }
 */
const enrichmentCache = new Map<string, { metadata: EnrichedMetadata; ts: number }>();
const ENRICHMENT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Lock pour éviter les enrichissements en parallèle du même livre
 */
const enrichmentLocks = new Map<string, Promise<EnrichedMetadata | null>>();

interface EnrichmentInput {
  isbn?: string | null;
  google_books_id?: string | null;
  openlibrary_work_key?: string | null;
  openlibrary_edition_key?: string | null;
  openlibrary_cover_id?: number | null;
  title?: string | null;
  author?: string | null;
}

export interface EnrichedMetadata {
  cover_url: string | null;
  total_pages: number | null;
  description: string | null;
  openlibrary_cover_id: number | null;
  openlibrary_work_key: string | null;
  openlibrary_edition_key: string | null;
  google_books_id: string | null;
}

/**
 * Valide qu'une URL de cover existe (HEAD request)
 */
async function validateCoverUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return response.ok && response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Génère une description fallback riche (2-3 phrases)
 */
function generateRichFallbackDescription(input: EnrichmentInput): string {
  const title = input.title || 'Ce livre';
  const author = input.author || 'un auteur';
  const pages = input.total_pages || null;

  const parts: string[] = [];

  // Phrase 1: Présentation
  parts.push(`"${title}" est un ouvrage de ${author}.`);

  // Phrase 2: Contexte (pages si disponible)
  if (pages && pages > 0) {
    parts.push(`Cette œuvre de ${pages} pages invite à la découverte et à la réflexion.`);
  } else {
    parts.push(`Cette œuvre invite à la découverte et à la réflexion.`);
  }

  // Phrase 3: Invitation
  parts.push(`Plongez dans cette lecture pour explorer ses thèmes et son univers.`);

  return parts.join(' ');
}

/**
 * Détecte si une description est "pauvre" (fallback basique)
 */
function isPoorDescription(description: string | null | undefined): boolean {
  if (!description || description.trim().length < 50) return true;
  
  // Détecte les patterns de fallback pauvre
  const poorPatterns = [
    /^Livre de .+ environ \d+ pages\.?$/i,
    /^Roman de .+ environ \d+ pages\.?$/i,
    /^L'ouvrage compte environ \d+ pages\.?$/i,
  ];
  
  return poorPatterns.some(pattern => pattern.test(description));
}

/**
 * Enrichit les métadonnées d'un livre depuis plusieurs sources
 * 
 * Priorités:
 * - cover_url: OpenLibrary cover_id > OpenLibrary ISBN > Google Books > placeholder
 * - total_pages: OpenLibrary Edition > Google Books > OpenLibrary Books API
 * - description: Google Books > OpenLibrary Work > OpenLibrary Edition > fallback riche
 */
export async function enrichBookMetadata(
  input: EnrichmentInput
): Promise<EnrichedMetadata | null> {
  try {
    // 1. Créer une clé de cache
    const cacheKey = input.isbn || input.google_books_id || `title:${input.title}`;
    
    // 2. Vérifier le cache
    const cached = enrichmentCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ENRICHMENT_CACHE_TTL_MS) {
      debugLog(`[enrichBookMetadata] Cache hit for ${cacheKey}`);
      return cached.metadata;
    }

    // 3. Vérifier le lock (éviter enrichissements en parallèle)
    const existingLock = enrichmentLocks.get(cacheKey);
    if (existingLock) {
      debugLog(`[enrichBookMetadata] Waiting for existing enrichment for ${cacheKey}`);
      return await existingLock;
    }

    // 4. Créer le lock
    const enrichmentPromise = (async (): Promise<EnrichedMetadata | null> => {
      try {
        const result: EnrichedMetadata = {
          cover_url: null,
          total_pages: null,
          description: null,
          openlibrary_cover_id: null,
          openlibrary_work_key: null,
          openlibrary_edition_key: null,
          google_books_id: null,
        };

        const cleanIsbn = input.isbn ? String(input.isbn).replace(/[-\s]/g, '') : null;
        const sources: string[] = [];

        // ===== ENRICHISSEMENT COVER =====
        let foundCover: string | null = null;

        // Priority 1: OpenLibrary cover_id
        if (input.openlibrary_cover_id) {
          const coverResult = await fetchCoverUrlWithFallback(input.openlibrary_cover_id, cleanIsbn || undefined);
          if (coverResult.url && await validateCoverUrl(coverResult.url)) {
            foundCover = coverResult.url;
            result.openlibrary_cover_id = input.openlibrary_cover_id;
            sources.push('cover:OL_ID');
          }
        }

        // Priority 2: OpenLibrary by ISBN
        if (!foundCover && cleanIsbn) {
          const coverResult = await fetchCoverUrlWithFallback(undefined, cleanIsbn);
          if (coverResult.url && await validateCoverUrl(coverResult.url)) {
            foundCover = coverResult.url;
            sources.push('cover:OL_ISBN');
          }
        }

        // Priority 3: Google Books
        if (!foundCover && input.google_books_id) {
          try {
            const googleBook = await getBookById(input.google_books_id);
            if (googleBook?.thumbnail) {
              if (await validateCoverUrl(googleBook.thumbnail)) {
                foundCover = googleBook.thumbnail;
                result.google_books_id = input.google_books_id;
                sources.push('cover:Google');
              }
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching Google Books cover:', error);
          }
        }

        // Priority 4: Google Books by ISBN
        if (!foundCover && cleanIsbn) {
          try {
            const googleBook = await searchBookByISBN(cleanIsbn);
            if (googleBook?.thumbnail) {
              if (await validateCoverUrl(googleBook.thumbnail)) {
                foundCover = googleBook.thumbnail;
                if (googleBook.id) {
                  result.google_books_id = googleBook.id;
                }
                sources.push('cover:Google_ISBN');
              }
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching Google Books by ISBN:', error);
          }
        }

        result.cover_url = foundCover;

        // ===== ENRICHISSEMENT PAGES =====
        let foundPages: number | null = null;

        // Priority 1: OpenLibrary Edition API
        if (cleanIsbn) {
          try {
            const editionData = await fetchEditionByIsbn(cleanIsbn);
            if (editionData?.pages && editionData.pages > 0) {
              foundPages = editionData.pages;
              sources.push('pages:OL_edition');
              
              // Bonus: récupérer aussi cover_id et keys si manquants
              if (!result.openlibrary_cover_id && editionData.coverId) {
                result.openlibrary_cover_id = editionData.coverId;
                // Essayer de récupérer la cover avec ce cover_id
                if (!result.cover_url) {
                  const coverResult = await fetchCoverUrlWithFallback(editionData.coverId, cleanIsbn);
                  if (coverResult.url && await validateCoverUrl(coverResult.url)) {
                    result.cover_url = coverResult.url;
                    sources.push('cover:OL_edition');
                  }
                }
              }
              if (!result.openlibrary_edition_key && editionData.editionKey) {
                result.openlibrary_edition_key = editionData.editionKey;
              }
              if (!result.openlibrary_work_key && editionData.workKey) {
                result.openlibrary_work_key = editionData.workKey;
              }
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching OpenLibrary edition:', error);
          }
        }

        // Priority 2: Google Books
        if (!foundPages && result.google_books_id) {
          try {
            const googleBook = await getBookById(result.google_books_id);
            if (googleBook?.pageCount && googleBook.pageCount > 0) {
              foundPages = googleBook.pageCount;
              sources.push('pages:Google');
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching Google Books pages:', error);
          }
        }

        // Priority 3: Google Books by ISBN
        if (!foundPages && cleanIsbn) {
          try {
            const googleBook = await searchBookByISBN(cleanIsbn);
            if (googleBook?.pageCount && googleBook.pageCount > 0) {
              foundPages = googleBook.pageCount;
              sources.push('pages:Google_ISBN');
              if (googleBook.id && !result.google_books_id) {
                result.google_books_id = googleBook.id;
              }
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching Google Books by ISBN pages:', error);
          }
        }

        // Priority 4: OpenLibrary Books API
        if (!foundPages && cleanIsbn) {
          try {
            const pages = await fetchPagesFromBooksApi(cleanIsbn);
            if (pages && pages > 0) {
              foundPages = pages;
              sources.push('pages:OL_books_api');
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching pages from Books API:', error);
          }
        }

        result.total_pages = foundPages;

        // ===== ENRICHISSEMENT DESCRIPTION =====
        let foundDescription: string | null = null;

        // Priority 1: Google Books
        if (result.google_books_id) {
          try {
            const googleBook = await getBookById(result.google_books_id);
            if (googleBook?.description && googleBook.description.trim().length >= 200) {
              foundDescription = googleBook.description.trim();
              sources.push('desc:Google');
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching Google Books description:', error);
          }
        }

        // Priority 2: Google Books by ISBN
        if (!foundDescription && cleanIsbn) {
          try {
            const googleBook = await searchBookByISBN(cleanIsbn);
            if (googleBook?.description && googleBook.description.trim().length >= 200) {
              foundDescription = googleBook.description.trim();
              sources.push('desc:Google_ISBN');
              if (googleBook.id && !result.google_books_id) {
                result.google_books_id = googleBook.id;
              }
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching Google Books by ISBN description:', error);
          }
        }

        // Priority 3: OpenLibrary Work
        if (!foundDescription && result.openlibrary_work_key) {
          try {
            const desc = await fetchWorkDescription(result.openlibrary_work_key);
            if (desc && desc.trim().length >= 200) {
              foundDescription = desc.trim();
              sources.push('desc:OL_work');
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching OpenLibrary work description:', error);
          }
        }

        // Priority 4: OpenLibrary Edition
        if (!foundDescription && result.openlibrary_edition_key) {
          try {
            const desc = await fetchEditionDescription(result.openlibrary_edition_key);
            if (desc && desc.trim().length >= 200) {
              foundDescription = desc.trim();
              sources.push('desc:OL_edition');
            }
          } catch (error) {
            debugLog('[enrichBookMetadata] Error fetching OpenLibrary edition description:', error);
          }
        }

        // Priority 5: Fallback riche
        if (!foundDescription) {
          foundDescription = generateRichFallbackDescription({
            ...input,
            total_pages: result.total_pages,
          });
          sources.push('desc:fallback_rich');
        }

        result.description = foundDescription;

        // Mettre en cache
        enrichmentCache.set(cacheKey, { metadata: result, ts: Date.now() });

        debugLog(`[enrichBookMetadata] Enriched metadata for ${cacheKey}`, { sources });

        return result;
      } finally {
        // Retirer le lock
        enrichmentLocks.delete(cacheKey);
      }
    })();

    enrichmentLocks.set(cacheKey, enrichmentPromise);
    return await enrichmentPromise;
  } catch (error) {
    console.error('[enrichBookMetadata] Unexpected error:', error);
    return null;
  }
}

