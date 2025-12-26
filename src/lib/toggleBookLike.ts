import { supabase } from './supabase';
import { getBookKey } from './bookSocial';
import { socialEvents } from './events';

// Throttle anti-spam pour activity_events (évite inserts multiples < 400ms)
const activityEventsThrottle = new Map<string, number>();
const ACTIVITY_EVENTS_THROTTLE_MS = 400;

interface ToggleBookLikeOptions {
  book: any; // Book object (id/key/isbn/title/authors/coverUrl etc)
  userId: string;
  currentLikesCount: number;
  currentCommentsCount: number;
  currentlyLiked: boolean;
  onSuccess?: (newLikesCount: number, newCommentsCount: number, newLiked: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Fonction partagée pour toggle like/unlike d'un livre
 * Réutilise la même logique que BookQuickActions
 * 
 * @returns Promise<{ newLikesCount: number; newCommentsCount: number; newLiked: boolean }>
 */
export async function toggleBookLike({
  book,
  userId,
  currentLikesCount,
  currentCommentsCount,
  currentlyLiked,
  onSuccess,
  onError,
}: ToggleBookLikeOptions): Promise<{
  newLikesCount: number;
  newCommentsCount: number;
  newLiked: boolean;
}> {
  try {
    const bookKey = getBookKey(book);
    if (!bookKey || bookKey === 'unknown') {
      throw new Error('Missing or invalid bookKey');
    }

    // Re-check en DB (évite les états désync)
    const { data: existing, error: checkErr } = await supabase
      .from('book_likes')
      .select('id')
      .eq('user_id', userId)
      .eq('book_key', bookKey)
      .maybeSingle();

    if (checkErr) throw checkErr;

    if (existing?.id) {
      // UNLIKE: supprimer le like existant
      const { error: delErr } = await supabase
        .from('book_likes')
        .delete()
        .eq('id', existing.id);

      if (delErr) throw delErr;

      const newCount = Math.max(0, currentLikesCount - 1);
      const result = {
        newLikesCount: newCount,
        newCommentsCount: currentCommentsCount,
        newLiked: false,
      };

      // Delete activity event (fire and forget)
      (async () => {
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (!currentUser?.id || !bookKey || bookKey === 'unknown') return;
          
          await supabase
            .from('activity_events')
            .delete()
            .eq('actor_id', currentUser.id)
            .eq('event_type', 'book_like')
            .eq('book_key', bookKey);
        } catch (err: any) {
          console.warn('[activity_events] delete failed', {
            message: err?.message,
            code: err?.code,
            details: err?.details,
            hint: err?.hint,
          });
        }
      })();

      onSuccess?.(result.newLikesCount, result.newCommentsCount, result.newLiked);
      socialEvents.emitSocialChanged(bookKey);
      return result;
    } else {
      // LIKE: insérer un nouveau like
      const { error: insErr } = await supabase
        .from('book_likes')
        .insert({ user_id: userId, book_key: bookKey });

      // Gérer les erreurs 409 (duplicate key) comme "déjà liké"
      if (insErr) {
        const msg = String((insErr as any)?.message || '');
        const code = String((insErr as any)?.code || '');
        if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint')) {
          // Déjà liké, on retourne l'état "liked"
          const result = {
            newLikesCount: currentLikesCount,
            newCommentsCount: currentCommentsCount,
            newLiked: true,
          };
          onSuccess?.(result.newLikesCount, result.newCommentsCount, result.newLiked);
          return result;
        }
        throw insErr;
      }

      const newCount = currentLikesCount + 1;
      const result = {
        newLikesCount: newCount,
        newCommentsCount: currentCommentsCount,
        newLiked: true,
      };

      // Upsert books_cache and insert activity event (fire and forget)
      (async () => {
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (!currentUser?.id || !bookKey || bookKey === 'unknown') return;
          
          // Throttle anti-spam : vérifier si dernier insert < 400ms
          const throttleKey = `${bookKey}:like`;
          const lastInsert = activityEventsThrottle.get(throttleKey);
          const now = Date.now();
          if (lastInsert && (now - lastInsert) < ACTIVITY_EVENTS_THROTTLE_MS) {
            return; // Skip insert si trop récent
          }
          activityEventsThrottle.set(throttleKey, now);
          
          const title = book.title || 'Titre inconnu';
          const author = book.author || book.authors || null;
          const coverUrl = book.cover_url || book.thumbnail || book.coverUrl || null;
          const isbn = book.isbn13 || book.isbn10 || book.isbn || null;
          const source = book.google_books_id ? 'google' : book.openLibraryKey ? 'openlibrary' : 'unknown';

          await Promise.all([
            supabase
              .from('books_cache')
              .upsert({
                book_key: bookKey,
                title,
                author,
                cover_url: coverUrl,
                isbn,
                source,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'book_key',
              }),
            supabase
              .from('activity_events')
              .insert({
                actor_id: currentUser.id,
                event_type: 'book_like',
                book_key: bookKey,
                comment_id: null,
              }),
          ]);
        } catch (err: any) {
          console.warn('[activity_events] insert failed', {
            message: err?.message,
            code: err?.code,
            details: err?.details,
            hint: err?.hint,
          });
        }
      })();

      onSuccess?.(result.newLikesCount, result.newCommentsCount, result.newLiked);
      socialEvents.emitSocialChanged(bookKey);
      return result;
    }
  } catch (error: any) {
    console.error('[toggleBookLike] error:', error);
    onError?.(error);
    // Return current state on error
    return {
      newLikesCount: currentLikesCount,
      newCommentsCount: currentCommentsCount,
      newLiked: currentlyLiked,
    };
  }
}

