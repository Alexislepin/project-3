import { useState, useEffect, useMemo } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { canonicalBookKey, isBookLoading, toggleBookLike as toggleBookLikeSocial } from '../lib/bookSocial';
import { ensureBookInDB } from '../lib/booksUpsert';
import { socialEvents } from '../lib/events';
import { createBookEvent } from '../lib/bookEvents';

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
  const isLoading = useMemo(() => isBookLoading(book), [book]);
  const [currentLikesCount, setCurrentLikesCount] = useState(likesCount);
  const [currentCommentsCount, setCurrentCommentsCount] = useState(commentsCount);
  const [likedByMe, setLikedByMe] = useState(initiallyLiked);
  const [isTogglingLike, setIsTogglingLike] = useState(false);

  // Sync counts and isLiked when props change (e.g., after refresh or external updates)
  useEffect(() => {
    setCurrentLikesCount(likesCount);
    setCurrentCommentsCount(commentsCount);
    setLikedByMe(initiallyLiked); // ✅ Sync isLiked avec la prop (source of truth)
  }, [likesCount, commentsCount, initiallyLiked]);

  // 1) Vérifier si l'utilisateur a déjà liké ce livre (seulement les likes actifs: deleted_at IS NULL)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!user || !stableBookKey || stableBookKey === 'unknown') {
        setLikedByMe(false);
        return;
      }

      // ✅ SOFT DELETE: Filtrer seulement les likes actifs (deleted_at IS NULL)
      const { data, error } = await supabase
        .from('book_likes')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_key', stableBookKey)
        .is('deleted_at', null) // ✅ Seulement les likes actifs
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

      // CRITICAL: Use centralized RPC function - never touch book_likes directly
      // This function uses RPC toggle_book_like only
      const result = await toggleBookLikeSocial(bookKey, user.id, book);

      // CRITICAL: Use server response - NEVER infer state locally
      // result.liked is the source of truth from RPC
      setLikedByMe(result.liked);

      // ✅ Appeler createBookEvent() SEULEMENT si un nouveau like a été créé
      if (result.created && result.liked) {
        // RÈGLE ABSOLUE: S'assurer que le livre existe en DB pour créer l'event
        const bookUuid = await ensureBookInDB(supabase, book);
        // Fire-and-forget (non-blocking)
        createBookEvent(user.id, bookUuid, 'book_liked').catch((err) => {
          console.warn('[BookQuickActions] Error creating book event:', err);
          // Non-critical, continue
        });
      }

      // Emit event to refresh counts in Explorer (already done by toggleBookLike, but safe to duplicate)
      socialEvents.emitSocialChanged(stableBookKey);
      
      // Emit global event for Profile to refresh liked books
      window.dispatchEvent(new CustomEvent('book-like-changed', { 
        detail: { bookKey: stableBookKey, liked: result.liked } 
      }));
    } catch (error: any) {
      // Error handling: show toast only on error with proper error details
      if (error?.code || error?.message) {
        console.error('toggle_book_like error', error.code, error.message, error.details);
      } else {
        console.error('[QuickActions] toggleLike error:', error);
      }
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
      <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1.5 relative group">
        <button
          onClick={handleLikeClick}
          disabled={isTogglingLike || isLoading}
          className={`transition-all ${
            likedByMe
              ? 'text-red-400 hover:text-red-300'
              : 'text-white hover:text-gray-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label={likedByMe ? 'Ne plus aimer' : 'Aimer'}
          title={isLoading ? 'Métadonnées du livre en cours de chargement' : undefined}
        >
          <Heart className={`w-4 h-4 ${likedByMe ? 'fill-current' : ''}`} />
        </button>
        <span className={`text-xs font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
          currentLikesCount > 0 ? 'text-white' : 'text-white/50'
        }`}>
          {currentLikesCount}
        </span>
        {isLoading && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Métadonnées du livre en cours de chargement
          </div>
        )}
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

