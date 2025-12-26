import { useState, useEffect, useRef } from 'react';
import { Heart, Send, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getBookKey } from '../lib/bookSocial';
import { socialEvents } from '../lib/events';

// Throttle anti-spam pour activity_events (évite inserts multiples < 400ms)
const activityEventsThrottle = new Map<string, number>();
const ACTIVITY_EVENTS_THROTTLE_MS = 400;

/**
 * Helper function to upsert book into books_cache
 * Extracts title, author, cover_url, isbn, source from book object
 */
async function upsertBookCache(bookKey: string, book: any) {
  if (!bookKey || bookKey === 'unknown' || !book) return;

  try {
    const title = book.title || 'Titre inconnu';
    const author = book.author || book.authors || null;
    const coverUrl = book.cover_url || book.thumbnail || book.coverUrl || null;
    const isbn = book.isbn13 || book.isbn10 || book.isbn || null;
    const source = book.google_books_id ? 'google' : book.openLibraryKey ? 'openlibrary' : 'unknown';

    await supabase
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

interface BookSocialProps {
  bookId?: string; // book.id (OpenLibrary id 'ol:/works/...') ou book.key
  book?: any; // Objet book complet (optionnel, pour utiliser getBookKey)
  focusComment?: boolean; // Auto-focus comment input when true
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

  // Calculer bookKey: utiliser book si fourni, sinon bookId
  // bookKey = book.id || book.key || `isbn:${isbn13||isbn10||isbn}` || `t:${title}|a:${author}` (always non-empty)
  const bookKey = book ? getBookKey(book) : (bookId ? getBookKey(bookId) : null);

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
        await Promise.all([loadLikes(), loadComments()]);
      } catch (error) {
        console.error('Error loading social data:', error);
        // En cas d'erreur, arrêter le loading quand même
        setLikes([]);
        setComments([]);
        setIsLiked(false);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [bookKey, user?.id]);

  // Auto-focus comment input if focusComment is true
  useEffect(() => {
    if (focusComment && commentInputRef.current && !loading) {
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 100);
    }
  }, [focusComment, loading]);

  const loadLikes = async () => {
    if (!bookKey || bookKey === 'unknown') return;

    try {
      // Charger likes: filter on book_key (NO book_id)
      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select('*')
        .eq('book_key', bookKey)
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
        return;
      }

      if (!likesData || likesData.length === 0) {
        setLikes([]);
        setIsLiked(false);
        return;
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
      if (user) {
        setIsLiked(likesData.some(like => like.user_id === user.id));
      }
    } catch (error) {
      console.error('Exception loading likes:', error);
      setLikes([]);
      setIsLiked(false);
    }
  };

  const loadComments = async () => {
    if (!bookKey || bookKey === 'unknown') return;

    try {
      // Charger comments: filter on book_key (NO book_id)
      const { data: commentsData, error: commentsError } = await supabase
        .from('book_comments')
        .select('*')
        .eq('book_key', bookKey)
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
        return;
      }

      if (!commentsData || commentsData.length === 0) {
        setComments([]);
        return;
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
    } catch (error) {
      console.error('Exception loading comments:', error);
      setComments([]);
    }
  };

  const handleToggleLike = async () => {
    if (!user || !bookKey || bookKey === 'unknown') return;

    // OPTIMISTIC UPDATE: Mettre à jour l'UI immédiatement
    const wasLiked = isLiked;
    const previousLikes = [...likes];
    
    // Toggle immédiatement l'état
    setIsLiked(!wasLiked);
    
    if (wasLiked) {
      // Unlike: retirer immédiatement le like de la liste
      setLikes(prev => prev.filter(like => like.user_id !== user.id));
    } else {
      // Like: ajouter immédiatement un like temporaire
      const tempLike: Like = {
        id: `temp-like-${Date.now()}`,
        user_id: user.id,
        created_at: new Date().toISOString(),
        user_profiles: null, // Sera chargé après
      };
      setLikes(prev => [...prev, tempLike]);
    }

    try {
      // Vérifier d'abord si le like existe pour éviter 409 conflict
      // Filter on book_key (NO book_id)
      const { data: existingLike, error: checkError } = await supabase
        .from('book_likes')
        .select('id')
        .eq('book_key', bookKey)
        .eq('user_id', user.id)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking like:', checkError);
        // Rollback en cas d'erreur
        setIsLiked(wasLiked);
        setLikes(previousLikes);
        return;
      }

      if (existingLike) {
        // Le like existe -> le supprimer (unlike)
        // Delete by book_key + user_id (NO book_id)
        const { error: deleteError } = await supabase
          .from('book_likes')
          .delete()
          .eq('book_key', bookKey)
          .eq('user_id', user.id);

        if (deleteError) {
          console.error('Error removing like:', deleteError);
          // Rollback en cas d'erreur
          setIsLiked(wasLiked);
          setLikes(previousLikes);
          return;
        }

        // Mise à jour déjà faite (optimistic), juste s'assurer que c'est correct
        // Le profil n'est pas nécessaire pour unlike
        
        // Emit event to refresh counts in Explorer
        socialEvents.emitSocialChanged(bookKey);
        
        // Delete activity event for unlike (fire and forget)
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
        // Le like n'existe pas -> l'ajouter (like)
        // Insert: { book_key: bookKey, user_id: user.id } (DO NOT send book_id)
        const { data: newLike, error: insertError } = await supabase
          .from('book_likes')
          .insert({
            book_key: bookKey,
            user_id: user.id,
          })
          .select('user_id, created_at')
          .single();

        if (insertError) {
          console.error('Error adding like:', insertError);
          // Rollback en cas d'erreur
          setIsLiked(wasLiked);
          setLikes(previousLikes);
          return;
        }

        if (newLike) {
          // Charger le profil pour le nouveau like et remplacer le like temporaire
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('id, display_name, avatar_url')
            .eq('id', user.id)
            .single();

          const likeWithProfile: Like = {
            id: `like-${Date.now()}`,
            user_id: newLike.user_id,
            created_at: newLike.created_at,
            user_profiles: profileData || null,
          };

          // Remplacer le like temporaire par le vrai like avec profil
          setLikes(prev => {
            const filtered = prev.filter(like => !like.id.startsWith('temp-like-'));
            return [...filtered, likeWithProfile];
          });

          // Emit event to refresh counts in Explorer
          socialEvents.emitSocialChanged(bookKey);
          
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
              
              await Promise.all([
                upsertBookCache(bookKey, book),
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
      }
    } catch (error) {
      console.error('Exception in handleToggleLike:', error);
      // Rollback en cas d'exception
      setIsLiked(wasLiked);
      setLikes(previousLikes);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !bookKey || bookKey === 'unknown' || !commentText.trim()) return;

    const commentContent = commentText.trim();
    
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
      // Insert comment: { book_key: bookKey, user_id: user.id, content } (DO NOT send book_id)
      const { data: newComment, error } = await supabase
        .from('book_comments')
        .insert({
          book_key: bookKey,
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
        
        // Upsert books_cache and insert activity event (fire and forget)
        (async () => {
          try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser?.id || !bookKey || bookKey === 'unknown' || !newComment?.id) return;
            
            // Throttle anti-spam : vérifier si dernier insert < 400ms
            const throttleKey = `${bookKey}:comment`;
            const lastInsert = activityEventsThrottle.get(throttleKey);
            const now = Date.now();
            if (lastInsert && (now - lastInsert) < ACTIVITY_EVENTS_THROTTLE_MS) {
              return; // Skip insert si trop récent
            }
            activityEventsThrottle.set(throttleKey, now);
            
            await Promise.all([
              upsertBookCache(bookKey, book),
              supabase
                .from('activity_events')
                .insert({
                  actor_id: currentUser.id,
                  event_type: 'comment',
                  book_key: bookKey,
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
      <div>
        <button
          onClick={handleToggleLike}
          disabled={!user}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
            isLiked
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
          <span className="font-semibold">{likes.length}</span>
          <span className="text-sm">{isLiked ? 'J\'aime' : 'J\'aime pas'}</span>
        </button>
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
