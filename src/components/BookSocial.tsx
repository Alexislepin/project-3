import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Heart, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { canonicalBookKey, candidateBookKeysFromBook, isBookLoading, toggleBookLike as toggleBookLikeSocial } from '../lib/bookSocial';
import { ensureBookInDB } from '../lib/booksUpsert';
import { createBookEvent } from '../lib/bookEvents';

import { socialEvents } from '../lib/events';

// Throttle anti-spam pour activity_events (évite inserts multiples < 400ms)
const activityEventsThrottle = new Map<string, number>();
const ACTIVITY_EVENTS_THROTTLE_MS = 400;

/**
 * Helper function to upsert book into books_cache
 * Extracts title, author, cover_url, isbn, source from book object
 */
async function upsertBookCache(stableBookKey: string, book: any) {
  if (!stableBookKey || stableBookKey === 'unknown' || !book) return;

  try {
    const title = book.title || 'Titre inconnu';
    const author = book.author || book.authors || null;
    const coverUrl = book.cover_url || book.thumbnail || book.coverUrl || null;
    const isbn = book.isbn13 || book.isbn10 || book.isbn || null;
    // ✅ Utiliser book.source s'il existe, sinon déterminer depuis les propriétés
    const source = book.source || (book.google_books_id ? 'google' : book.openLibraryKey ? 'openlibrary' : 'unknown');

    await supabase
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
  } catch (error) {
    // Silencieux en cas d'erreur (ne pas bloquer l'UI)
    console.warn('Error upserting book cache:', error);
  }
}


interface BookSocialProps {
  bookId?: string; // book.id (OpenLibrary id 'ol:/works/...') ou book.key
  book?: any; // Objet book complet (optionnel, pour utiliser getBookKey)
  focusComment?: boolean; // Auto-focus comment input when true
}

interface Like {
  id: string;
  user_id: string;
  created_at: string;
  user_profiles: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user_profiles: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export function BookSocial({ bookId, book, focusComment = false }: BookSocialProps) {
  const { user } = useAuth();
  const [likes, setLikes] = useState<Like[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const commentInputRef = useRef<HTMLInputElement | null>(null);

  // UNE SEULE variable stable pour toutes les opérations (likes, comments, activity_events)
  // Calculée UNE SEULE FOIS avec canonicalBookKey pour éviter les doubles calculs
  const stableBookKey = useMemo(() => {
    if (book) {
      return canonicalBookKey(book);
    }
    if (bookId) {
      return canonicalBookKey({ id: bookId });
    }
    return 'unknown';
  }, [book, bookId]);
  
  // Alias pour compatibilité (bookKey = stableBookKey)
  const bookKey = stableBookKey;
  
  // Vérifier si le livre est en cours de chargement (métadonnées manquantes)
  const isLoading = useMemo(() => {
    if (book) {
      return isBookLoading(book);
    }
    return false;
  }, [book]);

  // Helper function to dispatch global event for Explorer synchronization
  const dispatchCountsChanged = useCallback((likesCount: number, commentsCount: number, isLikedByMe: boolean) => {
    if (bookKey && bookKey !== 'unknown') {
      // Debug log (temporary)
      console.debug('[BookSocial] dispatch', bookKey, { likes: likesCount, comments: commentsCount, isLiked: isLikedByMe });
      
      window.dispatchEvent(new CustomEvent('book-social-counts-changed', {
        detail: {
          bookKey,
          likes: likesCount,
          comments: commentsCount,
          isLiked: isLikedByMe,
        },
      }));
    }
  }, [bookKey]);

  // Si bookKey est absent ou 'unknown', ne rien afficher
  if (!bookKey || bookKey === 'unknown') {
    return null;
  }

  // Charger les likes et commentaires
  useEffect(() => {
    if (!bookKey || bookKey === 'unknown') {
      setLoading(false);
      return;
    }

    setLoading(true);

    const loadAll = async () => {
      try {
        // Charger likes et comments en parallèle et récupérer les résultats
        const [likesResult, commentsResult] = await Promise.all([
          loadLikes(),
          loadComments(),
        ]);

        // Dispatch UNE SEULE FOIS avec les vraies valeurs (pas stale)
        if (likesResult && commentsResult) {
          dispatchCountsChanged(
            likesResult.likesCount,
            commentsResult.commentsCount,
            likesResult.isLikedByMe
          );
        }
      } catch (error) {
        console.error('Error loading social data:', error);
        // En cas d'erreur, arrêter le loading quand même
        setLikes([]);
        setComments([]);
        setIsLiked(false);
        dispatchCountsChanged(0, 0, false);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [bookKey, user?.id, dispatchCountsChanged]);

  // Auto-focus comment input if focusComment is true
  useEffect(() => {
    if (focusComment && commentInputRef.current && !loading) {
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 100);
    }
  }, [focusComment, loading]);

  const loadLikes = async (): Promise<{ likesCount: number; isLikedByMe: boolean } | null> => {
    if (!bookKey || bookKey === 'unknown') return null;

    try {
      // Charger likes: filter on book_key with candidate keys (supports legacy format)
      // ✅ SOFT DELETE: Filtrer seulement les likes actifs (deleted_at IS NULL)
      const candidateKeys = candidateBookKeysFromBook(book ?? bookKey, bookId);
      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select('*')
        .in('book_key', candidateKeys)
        .is('deleted_at', null) // ✅ Seulement les likes actifs
        .order('created_at', { ascending: false });

      if (likesError) {
        console.error('Error loading likes:', {
          message: likesError.message,
          details: likesError.details,
          hint: likesError.hint,
          code: likesError.code,
          status: (likesError as any).status,
        });
        setLikes([]);
        setIsLiked(false);
        return { likesCount: 0, isLikedByMe: false };
      }

      if (!likesData || likesData.length === 0) {
        setLikes([]);
        setIsLiked(false);
        return { likesCount: 0, isLikedByMe: false };
      }

      // Extraire user_ids et charger profils
      const userIds = [...new Set(likesData.map(like => like.user_id))];
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error loading profiles for likes:', profilesError);
        // Continuer même si les profils échouent
      }

      // Combiner côté JS
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const combinedLikes = likesData.map((like, index) => ({
        id: `like-${index}`, // ID temporaire pour React key
        user_id: like.user_id,
        created_at: like.created_at,
        user_profiles: profilesMap.get(like.user_id) || null,
      }));

      setLikes(combinedLikes as any);
      // Vérifier si l'utilisateur actuel a liké
      const isLikedByMe = user ? likesData.some(like => like.user_id === user.id) : false;
      setIsLiked(isLikedByMe);
      
      // Retourner les valeurs pour dispatch unique dans loadAll
      return { likesCount: likesData.length, isLikedByMe };
    } catch (error) {
      console.error('Exception loading likes:', error);
      setLikes([]);
      setIsLiked(false);
      return { likesCount: 0, isLikedByMe: false };
    }
  };

  const loadComments = async (): Promise<{ commentsCount: number } | null> => {
    if (!bookKey || bookKey === 'unknown') return null;

    try {
      // Charger comments: filter on book_key with candidate keys (supports legacy format)
      const candidateKeys = candidateBookKeysFromBook(book ?? bookKey, bookId);
      const { data: commentsData, error: commentsError } = await supabase
        .from('book_comments')
        .select('*')
        .in('book_key', candidateKeys)
        .order('created_at', { ascending: false });

      if (commentsError) {
        console.error('Error loading comments:', {
          message: commentsError.message,
          details: commentsError.details,
          hint: commentsError.hint,
          code: commentsError.code,
          status: (commentsError as any).status,
        });
        setComments([]);
        return { commentsCount: 0 };
      }

      if (!commentsData || commentsData.length === 0) {
        setComments([]);
        return { commentsCount: 0 };
      }

      // Extraire user_ids et charger profils
      const userIds = [...new Set(commentsData.map(comment => comment.user_id))];
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error loading profiles for comments:', profilesError);
        // Continuer même si les profils échouent
      }

      // Combiner côté JS
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const combinedComments = commentsData.map(comment => ({
        ...comment,
        updated_at: comment.created_at, // Fallback si updated_at n'existe pas
        user_profiles: profilesMap.get(comment.user_id) || null,
      }));

      setComments(combinedComments as any);
      
      // Retourner les valeurs pour dispatch unique dans loadAll
      return { commentsCount: commentsData.length };
    } catch (error) {
      console.error('Exception loading comments:', error);
      setComments([]);
      return { commentsCount: 0 };
    }
  };

  const handleToggleLike = async () => {
    if (!book || !user) return;

    // RÈGLE ABSOLUE: Calculer la clé canonique
    const bookKey = canonicalBookKey(book);
    if (!bookKey || bookKey === 'unknown') {
      console.error('[BookSocial] Invalid bookKey');
      return;
    }

    // Optimistic update
    const prevLiked = isLiked;
    setIsLiked(!prevLiked);

    try {
      // CRITICAL: Use centralized RPC function - never touch book_likes directly
      const result = await toggleBookLikeSocial(bookKey, user.id, book);

      // CRITICAL: Use server response - NEVER infer state locally
      // result.liked is the source of truth from RPC
      setIsLiked(result.liked);
      
      // ✅ Émettre l'événement global avec les détails complets
      window.dispatchEvent(new CustomEvent('book-like-changed', {
        detail: {
          book_key: bookKey,
          book_uuid: book.id ?? null,
          liked: result.liked,
          book: {
            id: book.id ?? null,
            title: book.title ?? null,
            author: book.author ?? null,
            cover_url: book.cover_url ?? null,
            isbn: book.isbn ?? null,
            openlibrary_cover_id: book.openlibrary_cover_id ?? null,
            google_books_id: book.google_books_id ?? null,
            openlibrary_work_key: book.openLibraryKey ?? book.openlibrary_work_key ?? null,
          }
        }
      }));
      
      // Recharger les likes depuis la DB pour avoir la liste complète avec profils
      await loadLikes();
      
      // Dispatch avec les valeurs réelles
      const currentCommentsCount = comments.length;
      dispatchCountsChanged(0, currentCommentsCount, result.liked);

      // ✅ Appeler createBookEvent() SEULEMENT si un nouveau like a été créé
      if (result.created && result.liked) {
        // RÈGLE ABSOLUE: S'assurer que le livre existe en DB pour créer l'event
        const bookUuid = await ensureBookInDB(supabase, book);
        createBookEvent(user.id, bookUuid, 'book_liked').catch((err) => {
          console.warn('[BookSocial] Error creating book event:', err);
        });
      }

      // Emit event to refresh counts in Explorer (already done by toggleBookLike, but safe to duplicate)
      socialEvents.emitSocialChanged(bookKey);
    } catch (error: any) {
      // Error handling: show toast only on error
      if (error?.code || error?.message) {
        console.error('[BookSocial] toggle_book_like error', error.code, error.message, error.details);
      } else {
        console.error('[BookSocial] Exception in handleToggleLike:', error);
      }
      // Rollback optimistic update
      setIsLiked(prevLiked);
      // En cas d'erreur, recharger pour être sûr
      await loadLikes();
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !book || !commentText.trim()) return;

    // RÈGLE ABSOLUE: Calculer la clé canonique
    const bookKey = canonicalBookKey(book);
    if (!bookKey || bookKey === 'unknown') {
      console.error('[book_comments] Invalid bookKey');
      return;
    }

    // RÈGLE ABSOLUE: S'assurer que le livre existe en DB
    let bookUuid: string;
    try {
      bookUuid = await ensureBookInDB(supabase, book);
    } catch (error) {
      console.error('[book_comments] Error ensuring book in DB:', error);
      return;
    }

    const commentContent = commentText.trim();
    
    // STOCKER LES VALEURS AVANT setState pour dispatch stable
    const prevCommentsCount = comments.length;
    const currentLikesCount = likes.length;
    const currentIsLiked = isLiked;
    
    // OPTIMISTIC UPDATE: Ajouter immédiatement le commentaire à l'UI
    const tempComment: Comment = {
      id: `temp-comment-${Date.now()}`,
      user_id: user.id,
      content: commentContent,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_profiles: null, // Sera chargé après
    };
    
    // Ajouter immédiatement le commentaire temporaire
    setComments(prev => [tempComment, ...prev]);
    setCommentText(''); // Vider le champ immédiatement
    setSubmittingComment(true);

    try {
      console.debug('[book_comments] Inserting comment:', {
        book_key: bookKey,
        book_id: bookUuid,
        user_id: user.id,
        content_length: commentContent.length,
      });
      
      const { data: newComment, error } = await supabase
        .from('book_comments')
        .insert({
          book_key: bookKey, // CRITICAL: Use canonical bookKey
          book_id: bookUuid, // Using book_id as book_uuid
          user_id: user.id,
          content: commentContent,
        })
        .select('*')
        .single();

      if (error) {
        console.error('Error adding comment:', error);
        // Rollback: retirer le commentaire temporaire
        setComments(prev => prev.filter(c => !c.id.startsWith('temp-comment-')));
        setCommentText(commentContent); // Remettre le texte dans le champ
        setSubmittingComment(false);
        return;
      }

      if (newComment) {
        // Charger le profil pour le nouveau commentaire
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('id, display_name, avatar_url')
          .eq('id', user.id)
          .single();

        const commentWithProfile: Comment = {
          ...newComment,
          updated_at: newComment.created_at,
          user_profiles: profileData || null,
        };

        // Remplacer le commentaire temporaire par le vrai commentaire avec profil
        setComments(prev => {
          const filtered = prev.filter(c => !c.id.startsWith('temp-comment-'));
          return [commentWithProfile, ...filtered];
        });

        // Emit event to refresh counts in Explorer
        socialEvents.emitSocialChanged(bookKey);
        
        // Dispatch global event for Explorer synchronization avec valeurs stables
        dispatchCountsChanged(currentLikesCount, prevCommentsCount + 1, currentIsLiked);
        
        // Upsert books_cache and insert activity event (fire and forget)
        (async () => {
          try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser?.id || !bookKey || bookKey === 'unknown' || !newComment?.id) return;
            
            if (!stableBookKey) return;
            
            // Throttle anti-spam : vérifier si dernier insert < 400ms
            const throttleKey = `${stableBookKey}:comment`;
            const lastInsert = activityEventsThrottle.get(throttleKey);
            const now = Date.now();
            if (lastInsert && (now - lastInsert) < ACTIVITY_EVENTS_THROTTLE_MS) {
              return; // Skip insert si trop récent
            }
            activityEventsThrottle.set(throttleKey, now);
            
            const eventType = normalizeEventType('comment');
            
            console.log('[activity_events] Inserting event:', {
              event_type: eventType,
              book_key: stableBookKey,
              actor_id: currentUser.id,
              comment_id: newComment.id,
            });
            
            await Promise.all([
              upsertBookCache(stableBookKey, book),
              supabase
                .from('activity_events')
                .insert({
                  actor_id: currentUser.id,
                  event_type: eventType,
                  book_key: stableBookKey,
                  comment_id: newComment.id,
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
    } catch (error) {
      console.error('Exception in handleSubmitComment:', error);
      // Rollback en cas d'exception
      setComments(prev => prev.filter(c => !c.id.startsWith('temp-comment-')));
      setCommentText(commentContent);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('book_comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting comment:', error);
      return;
    }

    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="mb-6">
        <div className="text-sm text-black/50">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-4">
      {/* Section Likes */}
      <div className="relative group">
        <button
          onClick={handleToggleLike}
          disabled={!user || isLoading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            isLiked
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isLoading ? 'Métadonnées du livre en cours de chargement' : undefined}
        >
          <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          <span className="font-semibold">{likes.length}</span>
          <span className="text-sm">{isLiked ? 'J\'aime' : 'J\'aime pas'}</span>
        </button>
        {isLoading && (
          <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-black/90 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Métadonnées du livre en cours de chargement
          </div>
        )}
      </div>

      {/* Section Commentaires */}
      <div>
        <h4 className="text-sm font-bold text-text-main-light mb-3 uppercase tracking-wide">
          Commentaires ({comments.length})
        </h4>

        {/* Formulaire d'ajout de commentaire */}
        {user && (
          <form onSubmit={handleSubmitComment} className="mb-4">
            <div className="flex gap-2">
              <input
                ref={commentInputRef}
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Ajouter un commentaire..."
                maxLength={1000}
                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                disabled={submittingComment}
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submittingComment}
                className="px-4 py-2 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* Liste des commentaires */}
        {comments.length === 0 ? (
          <p className="text-sm text-black/50 italic py-4">
            Aucun commentaire pour le moment.
          </p>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => {
              const userName = comment.user_profiles?.display_name || 'Utilisateur';
              const avatarUrl = comment.user_profiles?.avatar_url;
              const isOwnComment = user && comment.user_id === user.id;

              return (
                <div key={comment.id} className="flex gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={userName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-gray-600">
                        {userName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Contenu */}
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-900">
                          {isOwnComment ? 'Vous' : userName}
                        </span>
                        {isOwnComment && (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="p-1 hover:bg-gray-200 rounded transition"
                            aria-label="Supprimer le commentaire"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-4">
                      {formatDate(comment.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
