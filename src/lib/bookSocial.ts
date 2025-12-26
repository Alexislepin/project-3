import { supabase } from './supabase';

export interface BookSocialCounts {
  [bookKey: string]: {
    likes: number;
    comments: number;
    isLiked?: boolean; // Whether current user has liked this book
  };
}

/**
 * Helper function to get a book_key from a book object or string.
 * Priority:
 * 1) book.id
 * 2) book.key
 * 3) isbn:${book.isbn13 || book.isbn10 || book.isbn}
 * 4) t:${normalize(title)}|a:${normalize(author)}
 * 
 * ALWAYS returns a non-empty string (or 'unknown' as last resort).
 */
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
 * @param bookKeys - Liste de book_keys (peut être UUID, OpenLibrary key, ISBN, ou titre+auteur)
 * @param userId - Optional user ID to check if user has liked each book
 * @returns Objet indexé par book_key avec counts de likes et comments + isLiked si userId fourni
 */
export async function getBookSocialCounts(
  bookKeys: string[],
  userId?: string
): Promise<BookSocialCounts> {
  if (!bookKeys || bookKeys.length === 0) {
    return {};
  }

  // Filtrer les bookKeys invalides
  const validBookKeys = bookKeys.filter(key => key && key !== 'unknown' && typeof key === 'string');

  if (validBookKeys.length === 0) {
    return {};
  }

  try {
    // 1) Charger les counts de likes groupés par book_key (NO book_id, NO join)
    const { data: likesData, error: likesError } = await supabase
      .from('book_likes')
      .select('book_key')
      .in('book_key', validBookKeys);

    // 2) Charger les counts de commentaires groupés par book_key (NO book_id, NO join)
    const { data: commentsData, error: commentsError } = await supabase
      .from('book_comments')
      .select('book_key')
      .in('book_key', validBookKeys);

    // 3) Si userId fourni, charger les likes de l'utilisateur pour ces book_keys
    let userLikedKeys: Set<string> = new Set();
    if (userId) {
      const { data: userLikesData, error: userLikesError } = await supabase
        .from('book_likes')
        .select('book_key')
        .eq('user_id', userId)
        .in('book_key', validBookKeys);

      if (!userLikesError && userLikesData) {
        userLikedKeys = new Set(userLikesData.map((like: any) => like.book_key).filter(Boolean));
      }
    }

    // En cas d'erreur, retourner un objet vide (silencieux)
    if (likesError || commentsError) {
      console.warn('Error loading social counts:', { likesError, commentsError });
      return {};
    }

    // 4) Compter côté JS
    const likesCount: { [bookKey: string]: number } = {};
    const commentsCount: { [bookKey: string]: number } = {};

    (likesData || []).forEach((like: any) => {
      const bookKey = like.book_key;
      if (bookKey) {
        likesCount[bookKey] = (likesCount[bookKey] || 0) + 1;
      }
    });

    (commentsData || []).forEach((comment: any) => {
      const bookKey = comment.book_key;
      if (bookKey) {
        commentsCount[bookKey] = (commentsCount[bookKey] || 0) + 1;
      }
    });

    // 5) Construire le résultat
    const result: BookSocialCounts = {};
    validBookKeys.forEach(bookKey => {
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
