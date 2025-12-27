import { useState, useEffect, useMemo } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { canonicalBookKey } from '../lib/bookSocial';
import { ensureBookInDB } from '../lib/booksUpsert';
import { socialEvents } from '../lib/events';
import { normalizeEventType } from '../lib/activityEvents';

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
  // UNE SEULE variable stable calculée UNE SEULE FOIS avec canonicalBookKey
  const stableBookKey = useMemo(() => canonicalBookKey(book), [book]);
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
      if (!user || !stableBookKey || stableBookKey === 'unknown') {
        setLikedByMe(false);
        return;
      }

      const { data, error } = await supabase
        .from('book_likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_key', stableBookKey)
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
  }, [stableBookKey, user?.id]);

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
      if (!book) throw new Error('Missing book');

      // RÈGLE ABSOLUE: Utiliser la clé stable déjà calculée
      const bookKey = stableBookKey;
      if (!bookKey || bookKey === 'unknown') {
        throw new Error('Invalid bookKey');
      }

      // RÈGLE ABSOLUE: S'assurer que le livre existe en DB
      const bookUuid = await ensureBookInDB(supabase, book);

      // IDEMPOTENT: Vérifier si le like existe déjà (avec book_key, pas book_id)
      const { data: existing, error: checkErr } = await supabase
        .from('book_likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_key', bookKey)
        .maybeSingle();

      if (checkErr) throw checkErr;

      // OPTIMISTIC UPDATE: Mettre à jour l'UI immédiatement
      const wasLiked = !!existing?.id;
      const prevLikesCount = currentLikesCount;
      const prevCommentsCount = currentCommentsCount;

      if (wasLiked) {
        // UNLIKE: Update UI immediately
        setLikedByMe(false);
        const newCount = Math.max(0, prevLikesCount - 1);
        setCurrentLikesCount(newCount);
        onCountsChange?.(newCount, prevCommentsCount, false);
      } else {
        // LIKE: Update UI immediately
        setLikedByMe(true);
        const newCount = prevLikesCount + 1;
        setCurrentLikesCount(newCount);
        onCountsChange?.(newCount, prevCommentsCount, true);
      }

      if (wasLiked) {
        // UNLIKE: Delete from book_likes using book_key (idempotent)
        const { error: delErr } = await supabase
          .from('book_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('book_key', bookKey);

        if (delErr) {
          // Rollback UI on error
          setLikedByMe(true);
          setCurrentLikesCount(prevLikesCount);
          onCountsChange?.(prevLikesCount, prevCommentsCount, true);
          throw delErr;
        }

        // Delete activity event (fire and forget)
        (async () => {
          try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser?.id || !bookKey) return;
            
            await supabase
              .from('activity_events')
              .delete()
              .eq('actor_id', currentUser.id)
              .eq('event_type', normalizeEventType('like'))
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
        // LIKE: IDEMPOTENT INSERT
        // Vérifier à nouveau si le like existe (race condition protection)
        const { data: doubleCheck, error: doubleCheckErr } = await supabase
          .from('book_likes')
          .select('id')
          .eq('user_id', user.id)
          .eq('book_key', bookKey)
          .maybeSingle();

        if (doubleCheckErr) {
          // Rollback UI on error
          setLikedByMe(false);
          setCurrentLikesCount(prevLikesCount);
          onCountsChange?.(prevLikesCount, prevCommentsCount, false);
          throw doubleCheckErr;
        }

        // Si le like existe déjà, c'est OK (idempotent)
        if (doubleCheck?.id) {
          // Already liked, do nothing (idempotent success)
          return;
        }

        // Insert new like
        const { error: insertErr } = await supabase
          .from('book_likes')
          .insert({
              user_id: user.id,
              book_key: bookKey,
              book_id: bookUuid,
          });

        // Handle insert errors (except unique constraint violation)
        if (insertErr) {
          // If it's a unique constraint violation, treat as success (idempotent)
          if (insertErr.code === '23505' || insertErr.message?.includes('unique') || insertErr.message?.includes('duplicate')) {
            // Already exists, that's OK
            return;
        }
          // Other errors: rollback UI
          setLikedByMe(false);
          setCurrentLikesCount(prevLikesCount);
          onCountsChange?.(prevLikesCount, prevCommentsCount, false);
          throw insertErr;
        }

        // Upsert books_cache and insert activity event (fire and forget)
        (async () => {
          try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser?.id || !stableBookKey) return;
            
            // Throttle anti-spam : vérifier si dernier insert < 400ms
            const throttleKey = `${stableBookKey}:like`;
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

            // Upsert books_cache
            const { error: cacheError } = await supabase
              .from('books_cache')
              .upsert({
                book_key: stableBookKey,
                title,
                author,
                cover_url: coverUrl,
                isbn,
                source,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'book_key',
              });

            if (cacheError) {
              console.warn('[books_cache] upsert failed', {
                message: cacheError.message,
                code: cacheError.code,
                details: (cacheError as any).details,
                hint: (cacheError as any).hint,
              });
            }

            // Insert activity_events with comprehensive error logging
            const eventType = normalizeEventType('like');
            const activityEventPayload = {
              actor_id: currentUser.id,
              event_type: eventType,
              book_key: stableBookKey,
              comment_id: null,
            };

            console.log('[activity_events] Inserting event:', {
              event_type: eventType,
              book_key: stableBookKey,
              actor_id: currentUser.id,
            });

            const { error: activityError, data: activityData } = await supabase
              .from('activity_events')
              .insert(activityEventPayload)
              .select();

            if (activityError) {
              console.error('[activity_events] INSERT FAILED - Full error details:', {
                message: activityError.message,
                code: activityError.code,
                details: (activityError as any).details,
                hint: (activityError as any).hint,
                status: (activityError as any).status,
                payload: activityEventPayload,
                userId: currentUser.id,
                userIdType: typeof currentUser.id,
                bookKeyType: typeof stableBookKey,
              });
            } else {
              console.debug('[activity_events] Insert successful', {
                insertedId: activityData?.[0]?.id,
                bookKey: stableBookKey,
              });
            }
          } catch (err: any) {
            console.error('[activity_events] Exception during insert', {
              message: err?.message,
              code: err?.code,
              details: err?.details,
              hint: err?.hint,
              stack: err?.stack,
            });
          }
        })();
      }

      // Emit event to refresh counts in Explorer
      socialEvents.emitSocialChanged(stableBookKey);
      
      // Emit global event for Profile to refresh liked books
      window.dispatchEvent(new CustomEvent('book-like-changed', { 
        detail: { bookKey: stableBookKey, liked: !wasLiked } 
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

