import { supabase } from './supabase';

export interface BookSocialCounts {
  [bookKey: string]: {
    likes: number;
    comments: number;
    isLiked?: boolean; // Whether current user has liked this book
  };
}

/**
 * Normalizes book_key to ensure consistent format.
 * Unifies OpenLibrary work keys to format: ol:/works/OL123W
 * 
 * Accepts:
 * - "ol:works/OL123W"
 * - "ol:/works/OL123W"
 * - "/works/OL123W"
 * - "works/OL123W"
 * 
 * Returns normalized key or null if invalid.
 */
export function normalizeBookKey(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === 'unknown') return null;

  // Already normalized
  if (s.startsWith("ol:/works/OL") && s.endsWith("W")) return s;

  // Accept variants
  // ol:works/OL123W
  // ol:/works/OL123W
  // /works/OL123W
  // works/OL123W
  const m = s.match(/OL\d+W/);
  if (m) return `ol:/works/${m[0]}`;

  // ISBN
  const clean = s.replace(/[-\s]/g, "");
  if (/^\d{10}$/.test(clean) || /^\d{13}$/.test(clean)) return `isbn:${clean}`;

  return null;
}

/**
 * Checks if a string is a UUID (database ID).
 */
function isUuid(v?: string | null): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
}

/**
 * Normalizes OpenLibrary work key to canonical format.
 * Accepts: "ol:/works/OL2775807W", "/works/OL2775807W", "works/OL2775807W", "OL2775807W"
 * 
 * @param raw - Raw OpenLibrary work key
 * @returns Object with canonical, legacy, and bare formats, or null if invalid
 */
function normalizeOlWorkKey(raw?: string | null): { canonical: string; legacy: string; bare: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  
  const trimmed = raw.trim();
  if (!trimmed) return null;
  
  // Extract OL...W pattern
  const match = trimmed.match(/OL\d+W/);
  if (!match) return null;
  
  const workId = match[0]; // e.g., "OL2775807W"
  const canonical = `ol:/works/${workId}`;
  const legacy = `/works/${workId}`;
  const bare = workId;
  
  return { canonical, legacy, bare };
}

/**
 * Generate candidate book keys for querying likes/comments.
 * Supports both canonical format and legacy formats to retrieve existing likes/comments.
 * 
 * This function generates ALL possible variants of a book key to ensure we can retrieve
 * historical likes/comments that may have been stored with different key formats.
 * 
 * @param bookOrKey - Book object OR canonical book key string
 * @param bookId - Optional book ID (for UUID fallback)
 * @returns Array of candidate keys to search for (includes canonical + all variants)
 */
export function candidateBookKeysFromBook(bookOrKey: any, bookId?: string): string[] {
  const keys = new Set<string>();

  // Helper to add string variants (removes prefix to get bare value)
  const addStringVariants = (k?: string) => {
    if (!k || k === 'unknown') return;
    keys.add(k);
    if (k.startsWith('isbn:')) keys.add(k.slice(5)); // "9781234567890"
    if (k.startsWith('google:')) keys.add(k.slice(7)); // "google_id"
    if (k.startsWith('uuid:')) keys.add(k.slice(5)); // "uuid_value"
    if (k.startsWith('ol:')) keys.add(k.slice(3)); // "/works/OL..."
  };

  // 1) If input is a string, add its variants
  if (typeof bookOrKey === 'string') {
    addStringVariants(bookOrKey);
  }

  // 2) ISBN variants from book (highest priority for canonical, but include all variants)
  const isbnRaw = bookOrKey?.isbn13 || bookOrKey?.isbn10 || bookOrKey?.isbn;
  if (isbnRaw) {
    const clean = String(isbnRaw).replace(/[^0-9Xx]/g, '');
    if (clean.length >= 10) {
      keys.add(`isbn:${clean}`);
      keys.add(clean); // Bare ISBN without prefix
    }
  }

  // 3) OpenLibrary variants from book fields (include all possible formats)
  const olRaw =
    bookOrKey?.openlibrary_work_key ||
    bookOrKey?.openLibraryKey ||
    bookOrKey?.openlibraryWorkKey ||
    bookOrKey?.key ||
    null;

  const ol = normalizeOlWorkKey(olRaw);
  if (ol) {
    keys.add(ol.canonical); // "ol:/works/OL2775807W"
    keys.add(ol.legacy);    // "/works/OL2775807W"
    keys.add(ol.bare);      // "OL2775807W"
    // Also add variant without trailing slash (if present)
    if (ol.canonical.endsWith('/')) {
      keys.add(ol.canonical.slice(0, -1));
    }
    // Also add variant with "ol:" prefix on legacy
    if (ol.legacy && !ol.legacy.startsWith('ol:')) {
      keys.add(`ol:${ol.legacy}`);
    }
  }

  // 4) Google variants from book
  const gid = bookOrKey?.google_books_id || 
              (typeof bookOrKey?.id === 'string' && !bookOrKey?.id?.includes('/') && !isUuid(bookOrKey.id) ? bookOrKey.id : null);
  if (gid) {
    keys.add(`google:${String(gid)}`);
    keys.add(String(gid)); // Bare Google ID
  }

  // 5) UUID variant (only if it's a real UUID)
  const uid = bookOrKey?.id || bookId;
  if (uid && typeof uid === 'string' && uid.length > 20 && !uid.includes('/')) {
    if (isUuid(uid)) {
      keys.add(`uuid:${uid}`);
      keys.add(uid); // Bare UUID
    }
  }

  // 6) Also add canonicalBookKey(book) if we have a book object
  // This ensures we always include the canonical key in the candidate list
  if (typeof bookOrKey === 'object' && bookOrKey !== null) {
    const canon = canonicalBookKey(bookOrKey);
    addStringVariants(canon);
  }

  return Array.from(keys).filter(Boolean);
}

/**
 * Normalizes OpenLibrary work key to canonical format.
 * Accepts: "ol:/works/OL...W", "/works/OL...W", "works/OL...W", "OL...W"
 * Always returns: "ol:/works/OL...W" (canonical format)
 */
function normalizeOlKeyForCanonical(input?: any): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Already normalized
  if (s.startsWith("ol:/works/")) return s;
  
  // Normalize variants
  if (s.startsWith("/works/")) return `ol:${s}`;
  if (s.startsWith("works/")) return `ol:/${s}`;
  if (s.includes("/works/")) {
    const idx = s.indexOf("/works/");
    return `ol:${s.slice(idx)}`;
  }
  
  // Extract OL...W pattern if present
  const match = s.match(/OL\d+W/);
  if (match) {
    return `ol:/works/${match[0]}`;
  }
  
  return null;
}

/**
 * Extracts first valid ISBN from string or array, cleaned.
 */
function firstIsbn(raw: any): string | null {
  if (!raw) return null;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const clean = String(v).replace(/[-\s]/g, "").trim();
  return clean.length >= 10 ? clean : null;
}

/**
 * Canonical book key function - returns the same key for the same book everywhere.
 * This ensures consistency between Explorer, Modal, and all social features.
 * 
 * Priority order:
 * 1) OpenLibrary work key -> "ol:/works/OLxxxxW" (normalized) - PRIORITY for Explorer stability
 * 2) ISBN (cleaned) -> "isbn:XXXXXXXXXX"
 * 3) Google Books ID -> "google:..."
 * 4) UUID DB -> "uuid:..."
 * 5) "unknown"
 * 
 * Rules:
 * - If book comes from OpenLibrary -> returns "ol:/works/OL...W" (canonical format) - PRIORITY
 * - If book has reliable ISBN -> returns "isbn:${digits}" (cleaned digits)
 * - If book is in books table -> returns "uuid:${books.id}" (UUID format)
 * - Handles ISBN as string or array (OpenLibrary often returns array)
 * 
 * @param book - Book object (can be DB book, GoogleBook, OpenLibraryDoc, etc.)
 * @returns Canonical book key string
 */
export function canonicalBookKey(book: any): string {
  if (!book) return 'unknown';

  // 1) OpenLibrary work key FIRST (Explorer stability - most stable identifier)
  const ol =
    normalizeOlKeyForCanonical(book?.openLibraryKey) ||
    normalizeOlKeyForCanonical(book?.openlibrary_work_key) ||
    normalizeOlKeyForCanonical(book?.key) ||
    normalizeOlKeyForCanonical(book?.openLibraryWorkKey) ||
    normalizeOlKeyForCanonical(book?.openlibraryKey) ||
    normalizeOlKeyForCanonical(book?.open_library_key);
  
  if (ol) return ol;

  // 2) ISBN (handles string or array)
  const isbn =
    firstIsbn(book?.isbn13) ||
    firstIsbn(book?.isbn10) ||
    firstIsbn(book?.isbn);
  if (isbn) return `isbn:${isbn}`;

  // 3) Google Books ID
  const gid = book?.google_books_id || book?.googleBooksId;
  if (gid && typeof gid === 'string' && gid.trim()) {
    return gid.startsWith('google:') ? gid : `google:${gid.trim()}`;
  }

  // 4) UUID DB
  if (book?.id && typeof book.id === 'string') {
    if (isUuid(book.id)) {
      return `uuid:${book.id}`;
    }
    // If id is long enough and not a UUID, might be an external ID
    if (book.id.length >= 16 && !book.id.startsWith('google:') && !book.id.startsWith('isbn:') && !book.id.startsWith('ol:') && !book.id.includes('/')) {
      return `uuid:${book.id}`;
    }
  }

  return 'unknown';
}

/**
 * Helper to get canonical key from OpenLibraryDoc.
 * Handles ISBN as array and ensures openLibraryKey is properly set.
 * Use this helper to avoid duplicating the conversion logic in multiple places.
 * 
 * @param doc - OpenLibraryDoc object
 * @returns Canonical book key string
 */
export function getCanonicalKeyFromOpenLibraryDoc(doc: any): string {
  if (!doc) return 'unknown';
  
  // Handle ISBN as string or array (OpenLibrary often returns array)
  const isbn = Array.isArray(doc.isbn) ? doc.isbn[0] : doc.isbn;
  
  const bookForCanonical = {
    id: doc.key || doc.id,
    key: doc.key,
    isbn: isbn,
    isbn13: isbn,
    isbn10: isbn,
    openLibraryKey: doc.key,
  };
  
  return canonicalBookKey(bookForCanonical);
}

/**
 * @deprecated Use canonicalBookKey() instead. This alias exists for backward compatibility only.
 * 
 * Alias for canonicalBookKey - ensures consistent book key format.
 * Use canonicalBookKey() everywhere to get a stable, unique identifier for a book.
 * 
 * @param book - Book object (can be DB book, GoogleBook, OpenLibraryDoc, etc.)
 * @returns Canonical book key string
 */
export const canonicalizeBookKey = canonicalBookKey;

/**
 * Normalizes OpenLibrary work key to canonical format.
 * Accepts: "ol:/works/OL2775807W", "/works/OL2775807W", "works/OL2775807W", "OL2775807W"
 * Always returns: "ol:/works/OL2775807W" (canonical format)
 * 
 * @param input - Raw OpenLibrary work key
 * @returns Canonical format "ol:/works/OLxxxxW" or null if invalid
 */
export function normalizeOpenLibraryWorkKey(input?: string | null): string | null {
  const normalized = normalizeOlWorkKey(input);
  return normalized ? normalized.canonical : null;
}

/**
 * Generate a stable book key from a book object.
 * Uses normalizeBookKey() to ensure consistent format.
 * 
 * Handles multiple object types:
 * - GoogleBook (google_books_id)
 * - DB book (openlibrary_work_key, isbn)
 * - OpenLibraryDoc (key, isbn)
 * 
 * Priority:
 * 1) OpenLibrary work key (multiple property names)
 * 2) ISBN (isbn13, isbn10, isbn)
 * 3) Google Books ID
 * 4) External ID (if not UUID)
 * 
 * Returns normalized key or null if no valid identifier found.
 */
export function getStableBookKey(book: any): string | null {
  if (!book) return null;

  // 1) OpenLibrary work key (toutes les variantes possibles)
  const rawOl =
    book.openlibrary_work_key ||
    book.openLibraryKey ||
    book.key ||
    book.openlibraryKey ||
    book.open_library_key;

  const ol = normalizeBookKey(rawOl);
  if (ol) return ol; // ex: "ol:/works/OL123W"

  // 2) ISBN
  const rawIsbn = book.isbn13 || book.isbn10 || book.isbn;
  if (rawIsbn) {
    const clean = String(rawIsbn).replace(/[-\s]/g, '');
    if (clean.length >= 10) return `isbn:${clean}`;
  }

  // 3) Google Books id
  const gbid = book.google_books_id || book.googleBooksId;
  if (gbid) return `google:${String(gbid).trim()}`;

  // 4) id si ce n'est PAS un UUID (sinon ça casse la cohérence)
  if (book.id && typeof book.id === 'string' && !isUuid(book.id)) {
    return `id:${String(book.id).trim()}`;
  }

  return null;
}

export function getBookKey(book: any): string {
  // Si c'est déjà une string, la retourner directement
  if (typeof book === 'string') {
    return book.trim() || 'unknown';
  }

  // Si book est null/undefined, retourner 'unknown'
  if (!book) {
    return 'unknown';
  }

  // 1) Priorité: book.book_key (explicit book_key field)
  if (book.book_key && typeof book.book_key === 'string' && book.book_key.trim()) {
    return book.book_key.trim();
  }

  // 2) Priorité: book.id (but only if it's not a UUID - UUIDs are for database, not for book_key)
  // Skip UUIDs as they are database IDs, not book identifiers
  const isUuid = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };
  if (book.id && typeof book.id === 'string' && book.id.trim() && !isUuid(book.id.trim())) {
    return book.id.trim();
  }

  // 3) Priorité: book.key
  if (book.key && typeof book.key === 'string' && book.key.trim()) {
    return book.key.trim();
  }

  // 3) Priorité: ISBN
  const isbn = book.isbn13 || book.isbn10 || book.isbn;
  if (isbn && typeof isbn === 'string' && isbn.trim()) {
    return `isbn:${isbn.trim()}`;
  }

  // 4) Fallback: titre + auteur normalisés
  const normalize = (str: string | null | undefined): string => {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
      .replace(/[^a-z0-9]/g, '') // Garder uniquement alphanumérique
      .substring(0, 50); // Limiter la longueur
  };

  const title = normalize(book.title);
  const author = normalize(book.author || book.authors);

  if (title || author) {
    return `t:${title}|a:${author}`;
  }

  // Dernier recours
  return 'unknown';
}

/**
 * Charge les counts de likes et commentaires pour une liste de book_keys
 * Ultra léger : requêtes groupées sans join user_profiles
 * Batch query by book_key (no join)
 * 
 * TOLÉRANT aux variantes de clés historiques :
 * - Normalise les clés demandées
 * - Construit toutes les variantes possibles (ol:/works/OL123W, /works/OL123W, etc.)
 * - Normalise les résultats avant agrégation
 * 
 * @param bookKeys - Liste de book_keys (peut être UUID, OpenLibrary key, ISBN, ou titre+auteur)
 * @param userId - Optional user ID to check if user has liked each book
 * @returns Objet indexé par book_key normalisé avec counts de likes et comments + isLiked si userId fourni
 */
export async function getBookSocialCounts(
  bookKeys: string[],
  userId?: string
): Promise<BookSocialCounts> {
  if (!bookKeys || bookKeys.length === 0) {
    return {};
  }

  // 1) Normaliser les clés demandées (canonical keys)
  const requested = bookKeys
    .map(k => k.trim())
    .filter((x): x is string => !!x && x !== 'unknown');

  if (requested.length === 0) {
    return {};
  }

  // 2) Construire toutes les variantes possibles pour chaque clé demandée
  // Utilise candidateBookKeysFromBook pour générer toutes les variantes (supports legacy formats)
  const allVariants = new Set<string>();
  for (const key of requested) {
    // Generate candidate keys for this key (treating it as a string)
    const candidates = candidateBookKeysFromBook(key);
    candidates.forEach(c => allVariants.add(c));
  }

  const variantArray = Array.from(allVariants);

  try {
    // 2) Charger les counts de likes groupés par UNE SEULE clé normalisée
    // Use COALESCE(book_key, book_id::text) to avoid double counting
    // This ensures we count each like only once, even if book_id contains a string (legacy bug)
    console.debug('[getBookSocialCounts] Counting likes/comments with variants:', {
      requested_keys: requested,
      variant_count: variantArray.length,
      variants_sample: variantArray.slice(0, 5),
    });
    
    // CRITICAL: Select id and user_id for likes to enable proper deduplication
    const { data: likesData, error: likesError } = await supabase
      .from('book_likes')
      .select('id, user_id, book_key, book_id')
      .in('book_key', variantArray);

    // 3) Charger les counts de commentaires groupés par UNE SEULE clé normalisée
    // CRITICAL: Select id for comments to enable proper deduplication
    const { data: commentsData, error: commentsError } = await supabase
      .from('book_comments')
      .select('id, book_key, book_id')
      .in('book_key', variantArray);

    // 4) Si userId fourni, charger les likes de l'utilisateur pour ces book_keys
    // Use candidate keys to find likes with any variant
    // CRITICAL: Use COALESCE(book_key, book_id::text) to avoid false positives
    let userLikedKeys: Set<string> = new Set();
    if (userId) {
      const { data: userLikesData, error: userLikesError } = await supabase
        .from('book_likes')
        .select('id, user_id, book_key, book_id')
        .eq('user_id', userId)
        .in('book_key', variantArray);

      if (!userLikesError && userLikesData) {
        // Map each found like back to its canonical key
        // Use COALESCE(book_key, book_id::text) as the normalized key
        requested.forEach(canonicalKey => {
          const candidates = candidateBookKeysFromBook(canonicalKey);
          const hasLike = userLikesData.some((like: any) => {
            const normalizedKey = like.book_key || (like.book_id ? String(like.book_id) : null);
            return normalizedKey && candidates.includes(normalizedKey);
          });
          if (hasLike) {
            userLikedKeys.add(canonicalKey);
          }
        });
      }
    }

    // En cas d'erreur, retourner un objet vide (silencieux)
    if (likesError || commentsError) {
      console.warn('Error loading social counts:', { likesError, commentsError });
      return {};
    }

    // 5) Compter côté JS en utilisant UNE SEULE clé normalisée par row
    // CRITICAL: Use COALESCE(book_key, book_id::text) to avoid double counting
    // This ensures we count each like/comment only once, even if book_id contains a string (legacy bug)
    const likesCount: { [bookKey: string]: number } = {};
    const commentsCount: { [bookKey: string]: number } = {};
    const processedLikes = new Set<string>(); // Track processed likes to avoid duplicates
    const processedComments = new Set<string>(); // Track processed comments to avoid duplicates

    (likesData || []).forEach((like: any) => {
      // Use COALESCE(book_key, book_id::text) as the unique identifier
      const normalizedKey = like.book_key || (like.book_id ? String(like.book_id) : null);
      if (!normalizedKey) return;
      
      // Create a unique identifier for this like
      // Use like.id if available (primary key), otherwise use user_id + normalized_key
      // CRITICAL: user_id is now selected, so it's available
      // Note: book_likes table may not have an 'id' column, so we use user_id + book_key as unique key
      const uniqueLikeId = like.id || (like.user_id ? `${like.user_id}:${normalizedKey}` : null);
      
      if (!uniqueLikeId) {
        // Skip if we can't create a unique identifier (shouldn't happen with proper data)
        console.warn('[getBookSocialCounts] Like missing id and user_id, skipping:', like);
        return;
      }
      
      if (processedLikes.has(uniqueLikeId)) {
        console.debug('[getBookSocialCounts] Skipping duplicate like:', uniqueLikeId);
        return; // Already counted this like
      }
      processedLikes.add(uniqueLikeId);
      
      // Map this like's normalized key to its canonical key
      // Find which requested canonical key this like belongs to
      for (const canonicalKey of requested) {
        const candidates = candidateBookKeysFromBook(canonicalKey);
        if (candidates.includes(normalizedKey)) {
          likesCount[canonicalKey] = (likesCount[canonicalKey] || 0) + 1;
          break; // Found the canonical key, move to next like
        }
      }
    });

    (commentsData || []).forEach((comment: any) => {
      // Use COALESCE(book_key, book_id::text) as the unique identifier
      const normalizedKey = comment.book_key || (comment.book_id ? String(comment.book_id) : null);
      if (!normalizedKey) return;
      
      // Create a unique identifier for this comment
      // CRITICAL: comment.id is now selected and is the primary key, so it's always unique
      const uniqueCommentId = comment.id;
      if (!uniqueCommentId) {
        console.warn('[getBookSocialCounts] Comment missing id:', comment);
        // Skip this comment if no id (shouldn't happen, but safety check)
        return;
      }
      if (processedComments.has(uniqueCommentId)) {
        console.debug('[getBookSocialCounts] Skipping duplicate comment:', uniqueCommentId);
        return; // Already counted this comment
      }
      processedComments.add(uniqueCommentId);
      
      // Map this comment's normalized key to its canonical key
      for (const canonicalKey of requested) {
        const candidates = candidateBookKeysFromBook(canonicalKey);
        if (candidates.includes(normalizedKey)) {
          commentsCount[canonicalKey] = (commentsCount[canonicalKey] || 0) + 1;
          break; // Found the canonical key, move to next comment
        }
      }
    });
    
    // Debug log (temporary) - verify counts match
    console.debug('[getBookSocialCounts] Final counts:', {
      requested_keys: requested,
      likes_data_length: (likesData || []).length,
      processed_likes_size: processedLikes.size,
      comments_data_length: (commentsData || []).length,
      processed_comments_size: processedComments.size,
      likes_count_keys: Object.keys(likesCount).length,
      comments_count_keys: Object.keys(commentsCount).length,
      likes_count_by_key: Object.fromEntries(
        requested.map(key => [key, likesCount[key] || 0])
      ),
      comments_count_by_key: Object.fromEntries(
        requested.map(key => [key, commentsCount[key] || 0])
      ),
    });

    // 6) Construire le résultat avec les clés normalisées
    const result: BookSocialCounts = {};
    requested.forEach(bookKey => {
      const likes = likesCount[bookKey] || 0;
      const comments = commentsCount[bookKey] || 0;
      const isLiked = userId ? userLikedKeys.has(bookKey) : undefined;
      
      // Inclure même si counts sont 0, pour avoir isLiked
      if (likes > 0 || comments > 0 || isLiked !== undefined) {
        result[bookKey] = { likes, comments, ...(isLiked !== undefined && { isLiked }) };
      }
    });

    return result;
  } catch (error) {
    console.warn('Exception loading social counts:', error);
    return {};
  }
}
