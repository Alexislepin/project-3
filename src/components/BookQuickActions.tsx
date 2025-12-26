import { useState, useEffect, useMemo } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getBookKey } from '../lib/bookSocial';
import { socialEvents } from '../lib/events';

// Throttle anti-spam pour activity_events (évite inserts multiples < 400ms)
const activityEventsThrottle = new Map<string, number>();
const ACTIVITY_EVENTS_THROTTLE_MS = 400;

interface BookQuickActionsProps {
  book: any; // Contains id/key/isbn/title/authors/coverUrl etc
  likesCount: number;
  commentsCount: number;
  initiallyLiked?: boolean;
  onCountsChange?: (nextLikes: number, nextComments: number, nextLiked: boolean) => void;
  onOpenComments?: () => void;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export function BookQuickActions({
  book,
  likesCount,
  commentsCount,
  initiallyLiked = false,
  onCountsChange,
  onOpenComments,
  onShowToast,
}: BookQuickActionsProps) {
  const { user } = useAuth();
  const bookKey = useMemo(() => getBookKey(book), [book]);
  const [currentLikesCount, setCurrentLikesCount] = useState(likesCount);
  const [currentCommentsCount, setCurrentCommentsCount] = useState(commentsCount);
  const [likedByMe, setLikedByMe] = useState(initiallyLiked);
  const [isTogglingLike, setIsTogglingLike] = useState(false);

  // Sync counts when props change (e.g., after refresh or external updates)
  useEffect(() => {
    setCurrentLikesCount(likesCount);
    setCurrentCommentsCount(commentsCount);
  }, [likesCount, commentsCount]);

  // 1) Vérifier si l'utilisateur a déjà liké ce livre
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user || !bookKey) {
        setLikedByMe(false);
        return;
      }

      const { data, error } = await supabase
        .from('book_likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_key', bookKey)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('[QuickActions] Error loading my like:', error);
        return;
      }

      setLikedByMe(!!data?.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookKey, user?.id]);

  // 2) Toggle LIKE robuste (vérifie en DB avant d'agir)
  const handleLikeClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      onShowToast?.('Connecte-toi pour liker', 'info');
      return;
    }

    if (isTogglingLike) return; // Anti double-click

    setIsTogglingLike(true);

    try {
      if (!bookKey) throw new Error('Missing bookKey');

      // Re-check en DB (évite les états désync)
      const { data: existing, error: checkErr } = await supabase
        .from('book_likes')
        .select('id')
        .eq('user_id', user.id)
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

        // Update UI
        setLikedByMe(false);
        const newCount = Math.max(0, currentLikesCount - 1);
        setCurrentLikesCount(newCount);
        onCountsChange?.(newCount, currentCommentsCount, false);

        // Delete activity event (fire and forget)
        (async () => {
          try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser?.id || !bookKey || bookKey === 'unknown') return;
            
            await supabase
              .from('activity_events')
              .delete()
              .eq('actor_id', currentUser.id)
              .eq('event_type', 'like')
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
      } else {
        // LIKE: insérer un nouveau like
        const { error: insErr } = await supabase
          .from('book_likes')
          .insert({ user_id: user.id, book_key: bookKey });

        // Gérer les erreurs 409 (duplicate key) comme "déjà liké"
        if (insErr) {
          const msg = String((insErr as any)?.message || '');
          const code = String((insErr as any)?.code || '');
          if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint')) {
            // Déjà liké, on met juste à jour l'état
            setLikedByMe(true);
            setIsTogglingLike(false);
            return;
          }
          throw insErr;
        }

        // Update UI
        setLikedByMe(true);
        const newCount = currentLikesCount + 1;
        setCurrentLikesCount(newCount);
        onCountsChange?.(newCount, currentCommentsCount, true);

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
                  event_type: 'like',
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
      }

      // Emit event to refresh counts in Explorer
      socialEvents.emitSocialChanged(bookKey);
      
      // Emit global event for Profile to refresh liked books
      window.dispatchEvent(new CustomEvent('book-like-changed', { 
        detail: { bookKey, liked: !existing?.id } 
      }));
    } catch (error: any) {
      console.error('[QuickActions] toggleLike error:', error);
      onShowToast?.('Erreur lors du like', 'error');
    } finally {
      setIsTogglingLike(false);
    }
  };

  const handleCommentClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    e.preventDefault(); // Prevent any default behavior

    if (!user) {
      onShowToast?.('Connecte-toi pour commenter', 'info');
      return;
    }

    onOpenComments?.();
  };

  return (
    <div className="absolute bottom-2 left-2 flex items-center gap-2 z-10 pointer-events-auto" style={{ isolation: 'isolate' }}>
      {/* Like button with count */}
      <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1.5">
        <button
          onClick={handleLikeClick}
          disabled={isTogglingLike}
          className={`transition-all ${
            likedByMe
              ? 'text-red-400 hover:text-red-300'
              : 'text-white hover:text-gray-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label={likedByMe ? 'Ne plus aimer' : 'Aimer'}
        >
          <Heart className={`w-4 h-4 ${likedByMe ? 'fill-current' : ''}`} />
        </button>
        <span className={`text-xs font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
          currentLikesCount > 0 ? 'text-white' : 'text-white/50'
        }`}>
          {currentLikesCount}
        </span>
      </div>

      {/* Comment button with count */}
      <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1.5">
        <button
          onClick={handleCommentClick}
          className="text-white hover:text-gray-200 transition-all"
          aria-label="Commenter"
        >
          <MessageCircle className="w-4 h-4" />
        </button>
        <span className={`text-xs font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
          currentCommentsCount > 0 ? 'text-white' : 'text-white/50'
        }`}>
          {currentCommentsCount}
        </span>
      </div>
    </div>
  );
}

