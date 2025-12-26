import { debugLog } from '../utils/logger';

const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes';

// Cache for search results (query -> results)
const searchCache = new Map<string, Book[]>();

// Read API key directly - REQUIRED, no fallback
// TEMPORARY DEBUG: Log env to verify key is loaded
console.log("ENV KEY:", import.meta.env.VITE_GOOGLE_BOOKS_API_KEY);
console.log("ALL ENV:", import.meta.env);

const API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;

// Explorer seeds: curated list of popular French books
export const EXPLORER_SEEDS = [
  { title: "L'Étranger", author: "Albert Camus" },
  { title: "La Peste", author: "Albert Camus" },
  { title: "La Chute", author: "Albert Camus" },
  { title: "Les Misérables", author: "Victor Hugo" },
  { title: "Notre-Dame de Paris", author: "Victor Hugo" },
  { title: "Le Petit Prince", author: "Antoine de Saint-Exupéry" },
  { title: "Madame Bovary", author: "Gustave Flaubert" },
  { title: "Germinal", author: "Émile Zola" },
  { title: "Le Rouge et le Noir", author: "Stendhal" },
  { title: "L'Écume des jours", author: "Boris Vian" },
  { title: "La Tresse", author: "Laetitia Colombani" },
  { title: "L'Anomalie", author: "Hervé Le Tellier" },
  { title: "Changer l'eau des fleurs", author: "Valérie Perrin" },
  { title: "Les Enfants sont rois", author: "Delphine de Vigan" },
  { title: "Le Labyrinthe des esprits", author: "Carlos Ruiz Zafón" },
];

// Cache for explorer books (to avoid refetching on every render)
const explorerBooksCache = new Map<string, Book[]>();

// Cache for explorer pages (page -> books)
const explorerPageCache = new Map<number, Book[]>();

export interface Book {
  id: string;
  title: string;
  authors: string;
  category?: string;
  pageCount?: number;
  publisher?: string;
  isbn?: string;
  isbn13?: string | null;
  isbn10?: string | null;
  description?: string;
  thumbnail?: string;
  cover_i?: number; // OpenLibrary cover ID (for fallback)
  googleCoverUrl?: string; // Google Books thumbnail/smallThumbnail (for fallback)
}

function normalizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http://') ? url.replace('http://', 'https://') : url;
}

/**
 * Extract ISBN_13 and ISBN_10 from a Google Books volume
 * Returns { isbn13: string | null, isbn10: string | null }
 */
export function getIsbns(volume: any): { isbn13: string | null; isbn10: string | null } {
  if (!volume?.volumeInfo?.industryIdentifiers) {
    return { isbn13: null, isbn10: null };
  }
  
  const identifiers = volume.volumeInfo.industryIdentifiers;
  if (!Array.isArray(identifiers)) {
    return { isbn13: null, isbn10: null };
  }
  
  const isbn13 = identifiers.find((i: any) => i?.type === 'ISBN_13')?.identifier || null;
  const isbn10 = identifiers.find((i: any) => i?.type === 'ISBN_10')?.identifier || null;
  
  return { isbn13, isbn10 };
}

// Cache for resolved cover URLs (by isbn/id to avoid network spam)
const coverUrlCache = new Map<string, string>();

/**
 * Resolve cover URL with robust fallback strategy
 * Priority:
 * 1) Google Books thumbnail/smallThumbnail (improve quality: zoom=1->zoom=0, remove &edge=curl)
 * 2) OpenLibrary with ISBN (prefer ISBN13, then ISBN10)
 * 3) Placeholder SVG
 */
export function resolveCoverUrl({
  volumeInfo,
  isbn13,
  isbn10,
}: {
  volumeInfo?: any;
  isbn13?: string | null;
  isbn10?: string | null;
}): string {
  // Create cache key from ISBN (prefer ISBN13)
  const cacheKey = isbn13 || isbn10 || null;
  if (cacheKey) {
    const cleanIsbn = cacheKey.replace(/[-\s]/g, '');
    if (coverUrlCache.has(cleanIsbn)) {
      return coverUrlCache.get(cleanIsbn)!;
    }
  }

  let resolvedUrl: string;

  // Priority 1: Google Books thumbnail or smallThumbnail
  if (volumeInfo?.imageLinks) {
    const imageLinks = volumeInfo.imageLinks;
    
    // Try thumbnail first (better quality)
    if (imageLinks.thumbnail && typeof imageLinks.thumbnail === 'string') {
      const url = normalizeImageUrl(imageLinks.thumbnail);
      if (url) {
        // Improve quality: replace zoom=1->zoom=0 and remove &edge=curl
        resolvedUrl = url.replace('zoom=1', 'zoom=0').replace('&edge=curl', '');
        if (cacheKey) {
          coverUrlCache.set(cacheKey.replace(/[-\s]/g, ''), resolvedUrl);
        }
        return resolvedUrl;
      }
    }
    
    // Try smallThumbnail as fallback
    if (imageLinks.smallThumbnail && typeof imageLinks.smallThumbnail === 'string') {
      const url = normalizeImageUrl(imageLinks.smallThumbnail);
      if (url) {
        // Improve quality: replace zoom=5->zoom=0 and remove &edge=curl
        resolvedUrl = url.replace('zoom=5', 'zoom=0').replace('&edge=curl', '');
        if (cacheKey) {
          coverUrlCache.set(cacheKey.replace(/[-\s]/g, ''), resolvedUrl);
        }
        return resolvedUrl;
      }
    }
  }

  // Priority 2: OpenLibrary with ISBN (prefer ISBN13, then ISBN10)
    const isbn = isbn13 || isbn10;
    if (isbn) {
      const cleanIsbn = isbn.replace(/[-\s]/g, '');
      if (cleanIsbn.length >= 10) {
        // Avec ?default=false pour éviter redirection archive.org
        resolvedUrl = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
        coverUrlCache.set(cleanIsbn, resolvedUrl);
        return resolvedUrl;
      }
    }

  // Priority 3: Placeholder SVG
  resolvedUrl = '/placeholder-cover.svg';
  if (cacheKey) {
    coverUrlCache.set(cacheKey.replace(/[-\s]/g, ''), resolvedUrl);
  }
  return resolvedUrl;
}

/**
 * Convert ISBN13 to ISBN10 if possible
 * ISBN13 must start with 978 or 979
 */
export function convertIsbn13ToIsbn10(isbn13: string): string | null {
  if (!isbn13 || typeof isbn13 !== 'string') {
    return null;
  }
  
  const cleanIsbn13 = isbn13.replace(/[-\s]/g, '');
  
  // ISBN13 must be 13 digits and start with 978 or 979
  if (cleanIsbn13.length !== 13 || (!cleanIsbn13.startsWith('978') && !cleanIsbn13.startsWith('979'))) {
    return null;
  }
  
  // Extract ISBN10 (remove first 3 digits and last check digit)
  const isbn10Base = cleanIsbn13.slice(3, 12); // 9 digits
  
  // Calculate ISBN10 check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(isbn10Base[i]) * (10 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 11;
  const checkDigitChar = checkDigit === 10 ? 'X' : checkDigit.toString();
  
  return isbn10Base + checkDigitChar;
}


function normalizeBook(item: any): Book | null {
  // CRITICAL: Null safety - treat Google Books responses as untrusted
  // Mandatory pattern: check item, volumeInfo, and title before using
  if (!item?.volumeInfo?.title) {
    return null;
  }

  const volumeInfo = item.volumeInfo;
  const title = volumeInfo.title;

  // Safely extract authors - guard against null/undefined
  const authors = Array.isArray(volumeInfo.authors) ? volumeInfo.authors : [];
  const authorsString = authors.length > 0 ? authors.join(', ') : 'Auteur inconnu';

  // Safely extract ISBN_13 and ISBN_10 from industryIdentifiers using getIsbns
  const { isbn13, isbn10 } = getIsbns(item);
  const isbn = isbn13 || isbn10 || null;

  // Resolve cover URL with robust fallback strategy
  const thumbnail = resolveCoverUrl({
    volumeInfo,
    isbn13,
    isbn10,
  });

  // Extract Google Books cover URL (for fallback in BookCover)
  const googleCoverUrl = volumeInfo?.imageLinks?.thumbnail || volumeInfo?.imageLinks?.smallThumbnail || null;

  // Safely extract category
  const categories = Array.isArray(volumeInfo.categories) ? volumeInfo.categories : [];
  const category = categories.length > 0 ? categories[0] : undefined;

  // Safely extract optional fields
  const description = volumeInfo.description || undefined;
  const pageCount = typeof volumeInfo.pageCount === 'number' ? volumeInfo.pageCount : undefined;
  const publisher = volumeInfo.publisher || undefined;

  // Safely extract id
  const id = item.id || '';

  return {
    id,
    title,
    authors: authorsString,
    category,
    pageCount,
    publisher,
    isbn: isbn || undefined,
    isbn13: isbn13 || undefined,
    isbn10: isbn10 || undefined,
    description,
    thumbnail,
    googleCoverUrl: googleCoverUrl ? normalizeImageUrl(googleCoverUrl) || undefined : undefined,
  };
}

export async function searchBooks(query: string, signal?: AbortSignal, startIndex: number = 0, maxResults: number = 10): Promise<Book[]> {
  // CRITICAL: API key is REQUIRED - throw immediately if missing
  if (!API_KEY) {
    throw new Error("Google Books API key missing");
  }

  // MANDATORY: Return immediately if query length < 3 to prevent spam
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 3) {
    return [];
  }

  // Clamp maxResults to 40
  const clampedMaxResults = Math.min(Math.max(1, maxResults), 40);

  try {
    // Check cache first
    const cacheKey = `${trimmedQuery.toLowerCase()}_${startIndex}_${clampedMaxResults}`;
    if (searchCache.has(cacheKey)) {
      return searchCache.get(cacheKey)!;
    }
    
    // 🔥 Hard-sanitize : enlève intitle:, guillemets, points d'interrogation
    const cleanQuery = trimmedQuery
      .replace(/^intitle:/i, "")  // enlève intitle: au début (case-insensitive)
      .replace(/intitle:/gi, "")  // enlève intitle: partout (sécurité supplémentaire)
      .replace(/["']/g, "")       // enlève guillemets
      .replace(/\?/g, "")         // enlève ?
      .replace(/\blang:fr\b/gi, "") // enlève lang:fr (géré par langRestrict)
      .trim();

    // Build URL with URLSearchParams - ALWAYS include key (no conditional logic)
    const params = new URLSearchParams({
      q: cleanQuery,          // ❌ PAS de intitle: - Google se débrouille très bien avec le texte brut
      langRestrict: "fr",
      printType: "books",
      maxResults: clampedMaxResults.toString(),
      key: API_KEY,           // ALWAYS include key
    });

    // Add startIndex if > 0
    if (startIndex > 0) {
      params.append('startIndex', startIndex.toString());
    }

    const url = `${GOOGLE_BOOKS_API_URL}?${params.toString()}`;
    
    // Log URL for debug (without key)
    const urlWithoutKey = url.replace(/[?&]key=[^&]*/, '');
    debugLog('[Google Books] Search URL:', urlWithoutKey);

    const response = await fetch(url, { signal });

    // Handle abort silently
    if (signal?.aborted) {
      return [];
    }

    if (!response.ok) {
      // Handle 429 (rate limit) - return empty array, do NOT throw
      if (response.status === 429) {
        // Don't cache 429 errors
        return [];
      }
      // Other errors: log and return empty array (silent)
      const txt = await response.text().catch(() => '');
      debugLog('[Google Books] Error:', response.status, txt);
      return [];
    }

    const data = await response.json();

    // Null safety: check data structure
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      return [];
    }

    // CRITICAL: DO NOT call getBookById in Explorer
    // Only use searchBooks results directly
    // Mandatory pattern: 100% null-safe parsing
    const safeItems = data.items
      .map((item: any) => {
        // Mandatory pattern: check item, volumeInfo, title before using
        if (!item?.volumeInfo?.title) return null;
        
        const volumeInfo = item.volumeInfo;
        const title = volumeInfo.title;
        const authors = Array.isArray(volumeInfo.authors) ? volumeInfo.authors : [];
        const authorsString = authors.length > 0 ? authors.join(', ') : 'Auteur inconnu';
        
        // Safely extract ISBN_13 and ISBN_10 from industryIdentifiers
        const { isbn13, isbn10 } = getIsbns(item);
        
        // Use ISBN_13 in priority, else ISBN_10, else null
        const isbn = isbn13 || isbn10 || null;
        
        // Resolve cover URL with robust fallback strategy
        const thumbnail = resolveCoverUrl({
          volumeInfo,
          isbn13,
          isbn10,
        });
        
        // Safely extract category
        const categories = Array.isArray(volumeInfo.categories) ? volumeInfo.categories : [];
        const category = categories.length > 0 ? categories[0] : undefined;
        
        // Safely extract optional fields
        const description = volumeInfo.description || undefined;
        const pageCount = typeof volumeInfo.pageCount === 'number' ? volumeInfo.pageCount : undefined;
        const publisher = volumeInfo.publisher || undefined;
        const id = item.id || '';
        
        return {
          id,
          title,
          authors: authorsString,
          category,
          pageCount,
          publisher,
          isbn,
          isbn13,
          isbn10,
          description,
          thumbnail,
        };
      })
      .filter(Boolean) as Book[];
    
    const books = safeItems;

    // Filtrer STRICTEMENT : exclure seulement les extraits/summaries
    // All filters must guard against null
    // Note: thumbnail can be null (OpenLibrary URL or null) - that's OK, BookCover will show placeholder
    return books.filter((book: Book | null): book is Book => {
      // Null safety: ensure book exists and has required fields
      if (!book || !book.title || !book.authors || book.authors === 'Auteur inconnu') {
        return false;
      }
      
      // Null safety: ensure title is string before toLowerCase
      // NEVER call .includes on possibly null values
      if (!book.title || typeof book.title !== 'string') {
        return false;
      }
      
      const title = book.title.toLowerCase();
      
      // EXCLURE les extraits, summaries, analyses, versions gratuites
      const excludePatterns = [
        'summary of',
        'résumé de',
        'book summary',
        'chapter summary',
        'study guide',
        'cliff notes',
        'extrait gratuit',
        'extrait',
        'fichier de lecture',
        'lepetitlitteraire',
        'analyse',
        'résumé',
        'résumé détaillé',
        'fiche de lecture',
        'commentaire',
        'collection',
        'boxed set',
        'box set',
        'bundle',
        'ebook gratuit'
      ];
      
      // Guard: title is guaranteed to be string here
      if (excludePatterns.some(pattern => title.includes(pattern))) {
        return false;
      }
      
      return true;
    });
    
    // Cache the filtered results
    searchCache.set(cacheKey, books);
    
    return books;
  } catch (error: any) {
    // Handle abort errors silently
    if (error?.name === 'AbortError' || signal?.aborted) {
      return [];
    }
    // All other errors: silently return empty array
    return [];
  }
}

export async function getBookById(volumeId: string, signal?: AbortSignal): Promise<Book | null> {
  // CRITICAL: API key is REQUIRED - throw immediately if missing
  if (!API_KEY) {
    throw new Error("Google Books API key missing");
  }

  try {
    // Null safety: ensure volumeId exists
    if (!volumeId || typeof volumeId !== 'string') {
      return null;
    }

    const url = `${GOOGLE_BOOKS_API_URL}/${volumeId}?key=${API_KEY}`;

    const response = await fetch(url, { signal });

    // Handle abort silently
    if (signal?.aborted) {
      return null;
    }

    if (!response.ok) {
      // Silently return null for errors
      return null;
    }

    const data = await response.json();

    // Null safety: normalizeBook already handles null checks
    return normalizeBook(data);
  } catch (error: any) {
    // Handle abort errors silently
    if (error?.name === 'AbortError' || signal?.aborted) {
      return null;
    }
    // All other errors: silently return null
    return null;
  }
}

export async function searchBookByISBN(isbn: string): Promise<Book | null> {
  // CRITICAL: API key is REQUIRED - throw immediately if missing
  if (!API_KEY) {
    throw new Error("Google Books API key missing");
  }

  try {
    // Null safety: ensure isbn exists
    if (!isbn || typeof isbn !== 'string') {
      return null;
    }

    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    
    // Ensure clean ISBN is valid
    if (cleanIsbn.length < 10) {
      return null;
    }

    const url = `${GOOGLE_BOOKS_API_URL}?q=isbn:${cleanIsbn}&key=${API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Null safety: check data structure
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      return null;
    }

    // Normalize directly from data.items[0] (1 seul fetch)
    return normalizeBook(data.items[0]);
  } catch (error: any) {
    // Handle abort errors silently
    if (error?.name === 'AbortError') {
      return null;
    }
    // All other errors: silently return null
    return null;
  }
}

/**
 * Fetch explorer batch for a specific page
 * Uses EXPLORER_SEEDS rotation to fetch different books on each page
 * Returns deduplicated books for the page
 */
export async function fetchExplorerBatch(page: number, pageSize: number, signal?: AbortSignal): Promise<Book[]> {
  // CRITICAL: API key is REQUIRED - throw immediately if missing
  if (!API_KEY) {
    throw new Error("Google Books API key missing");
  }

  // Check page cache first
  if (explorerPageCache.has(page)) {
    return explorerPageCache.get(page)!;
  }

  try {
    // Calculate seed rotation
    const seedIndex = page % EXPLORER_SEEDS.length;
    const rotation = Math.floor(page / EXPLORER_SEEDS.length);
    const startIndex = rotation * pageSize;
    const seed = EXPLORER_SEEDS[seedIndex];

    // Build query: title + author
    const query = `${seed.title} ${seed.author}`;

    // Fetch books using searchBooks with pagination
    const results = await searchBooks(query, signal, startIndex, pageSize);

    // Dedupe results by id or isbn
    const seenIds = new Set<string>();
    const seenIsbns = new Set<string>();
    const deduped: Book[] = [];

    for (const book of results) {
      if (!book) continue;

      // Check if already seen by id
      if (book.id && seenIds.has(book.id)) {
        continue;
      }

      // Check if already seen by isbn
      const isbn = book.isbn13 || book.isbn10 || book.isbn;
      if (isbn && seenIsbns.has(isbn)) {
        continue;
      }

      // Add to seen sets and deduped
      if (book.id) seenIds.add(book.id);
      if (isbn) seenIsbns.add(isbn);
      deduped.push(book);
    }

    // Cache the results
    explorerPageCache.set(page, deduped);

    return deduped;
  } catch (error: any) {
    // Handle abort errors silently
    if (error?.name === 'AbortError' || signal?.aborted) {
      return [];
    }
    // All other errors: silently return empty array
    debugLog('Error fetching explorer batch:', error);
    return [];
  }
}

/**
 * Fetch explorer books from seeds with concurrency limit
 * Returns merged unique books (dedupe by id or isbn)
 * Uses caching to avoid refetching on every render
 * @deprecated Use fetchExplorerBatch instead
 */
export async function fetchExplorerBooks(seeds: Array<{ title: string; author: string }>): Promise<Book[]> {
  // CRITICAL: API key is REQUIRED - throw immediately if missing
  if (!API_KEY) {
    throw new Error("Google Books API key missing");
  }

  // Check cache first (use a stable cache key)
  const cacheKey = 'explorer_seeds';
  if (explorerBooksCache.has(cacheKey)) {
    return explorerBooksCache.get(cacheKey)!;
  }

  try {
    // Limit concurrency: max 3 requests at a time
    const concurrencyLimit = 3;
    const allBooks: Book[] = [];
    const seenIds = new Set<string>();
    const seenIsbns = new Set<string>();

    // Process seeds in batches of 3
    for (let i = 0; i < seeds.length; i += concurrencyLimit) {
      const batch = seeds.slice(i, i + concurrencyLimit);
      
      // Fetch books for this batch in parallel
      const batchPromises = batch.map(async (seed) => {
        try {
          // Build search query: title + author
          const query = `${seed.title} ${seed.author}`;
          const results = await searchBooks(query);
          
          // Return first result (best match)
          if (results && results.length > 0) {
            return results[0];
          }
          return null;
        } catch (error) {
          // Skip failed seeds silently - do not block the whole page
          debugLog(`Failed to fetch book for seed "${seed.title}":`, error);
          return null;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Add unique books to allBooks (dedupe by id or isbn)
      for (const book of batchResults) {
        if (!book) continue;
        
        // Check if already seen by id
        if (book.id && seenIds.has(book.id)) {
          continue;
        }
        
        // Check if already seen by isbn
        const isbn = book.isbn13 || book.isbn10 || book.isbn;
        if (isbn && seenIsbns.has(isbn)) {
          continue;
        }
        
        // Add to seen sets and allBooks
        if (book.id) seenIds.add(book.id);
        if (isbn) seenIsbns.add(isbn);
        allBooks.push(book);
      }
    }

    // Cache the results
    explorerBooksCache.set(cacheKey, allBooks);
    
    return allBooks;
  } catch (error: any) {
    // If error occurs, return empty array (do not block the page)
    debugLog('Error fetching explorer books:', error);
    return [];
  }
}
