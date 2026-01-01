import { useState, useEffect, useMemo } from 'react';
import { X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from '../utils/dateUtils';
import { resolveAvatarUrl, addCacheBuster } from '../lib/resolveImageUrl';

interface Comment {
  id: string;
  user_id: string;
  user: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  } | null;
  content: string;
  created_at: string;
}

interface CommentModalProps {
  activityId: string;
  onClose: () => void;
  onCommentAdded?: () => void;
  initialFocusCommentId?: string;
  onUserClick?: (userId: string) => void;
}

export function CommentModal({ activityId, onClose, onCommentAdded, onUserClick }: CommentModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  // Debug: log when component receives onUserClick prop
  useEffect(() => {
    console.log('[CommentModal] Component mounted/updated, onUserClick prop:', typeof onUserClick, !!onUserClick);
  }, [onUserClick]);

  useEffect(() => {
    loadComments();
  }, [activityId]);

  const loadComments = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('activity_comments')
      .select(`
        id,
        user_id,
        content,
        created_at,
        user_profiles!activity_comments_user_id_fkey(id, username, display_name, avatar_url)
      `)
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CommentModal] Error loading comments:', error);
      setLoading(false);
      return;
    }

    if (data) {
      console.log('[CommentModal] Raw comments data:', data);
      const mappedComments = data.map((comment: any) => {
        const userData = comment.user_profiles ? {
          id: comment.user_profiles.id,
          username: comment.user_profiles.username,
          display_name: comment.user_profiles.display_name,
          avatar_url: comment.user_profiles.avatar_url,
        } : null;
        
        console.log('[CommentModal] Mapped comment:', {
          commentId: comment.id,
          userId: comment.user_id,
          userData,
          finalUserId: userData?.id || comment.user_id
        });
        
        return {
          id: comment.id,
          user_id: comment.user_id,
          user: userData,
          content: comment.content,
          created_at: comment.created_at,
        };
      });
      
      setComments(mappedComments);
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    setSubmitting(true);

    const { error } = await supabase.from('activity_comments').insert({
      activity_id: activityId,
      user_id: user.id,
      content: newComment.trim(),
    });

    if (!error) {
      setNewComment('');
      loadComments();
      // Notify parent that a comment was added
      if (onCommentAdded) {
        onCommentAdded();
      }
    }

    setSubmitting(false);
  };

  return (
    <div 
      className="fixed inset-0 z-[300] bg-black/30 flex items-end justify-center"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white rounded-t-2xl shadow-xl flex flex-col"
        style={{
          maxHeight: 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          marginBottom: 0,
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-bold">Commentaires</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div 
          className="flex-1 overflow-y-auto min-h-0 p-4"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          }}
        >
          {loading ? (
            <div className="text-center py-8 text-stone-500">Chargement des commentaires...</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-stone-600">Aucun commentaire pour le moment</p>
              <p className="text-sm text-stone-500 mt-1">Soyez le premier à commenter</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => {
                // Use user_id directly (it's always present) or fallback to user.id if available
                const userId = comment.user_id || comment.user?.id;
                const handleUserClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  console.log('[CommentModal] User click:', { 
                    userId, 
                    user_id: comment.user_id,
                    user_id_type: typeof comment.user_id,
                    user_id_length: comment.user_id?.length,
                    hasUser: !!comment.user,
                    userObject: comment.user,
                    comment: comment,
                    hasOnUserClick: !!onUserClick
                  });
                  
                  if (!userId) {
                    console.error('[CommentModal] ❌ No userId available', { 
                      comment_user_id: comment.user_id,
                      comment_user: comment.user
                    });
                    return;
                  }

                  if (!onUserClick) {
                    console.error('[CommentModal] ❌ onUserClick callback is not provided');
                    return;
                  }

                  console.log('[CommentModal] ✅ Calling onUserClick with userId:', userId);
                  try {
                    // Call onUserClick FIRST before closing modal
                    // This ensures the callback is executed before the component unmounts
                    onUserClick(userId);
                    console.log('[CommentModal] ✅ onUserClick called successfully');
                    // Then close the modal
                    console.log('[CommentModal] Closing modal after onUserClick');
                    onClose();
                  } catch (error) {
                    console.error('[CommentModal] ❌ Error calling onUserClick:', error);
                  }
                };

                return (
                  <div key={comment.id} className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleUserClick}
                      className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 text-sm font-medium flex-shrink-0 hover:bg-stone-300 transition-colors cursor-pointer overflow-hidden"
                      aria-label={`Voir le profil de ${comment.user?.display_name || 'utilisateur'}`}
                    >
                      {(() => {
                        const avatarUrl = resolveAvatarUrl(comment.user?.avatar_url || null, supabase);
                        const bustedUrl = addCacheBuster(avatarUrl, comment.user?.updated_at);
                        return bustedUrl ? (
                          <img 
                            src={bustedUrl} 
                            alt={comment.user.display_name || 'Avatar'} 
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          comment.user?.display_name?.charAt(0).toUpperCase() || '?'
                        );
                      })()}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          type="button"
                          onClick={handleUserClick}
                          className="font-semibold text-sm text-stone-900 hover:text-stone-700 hover:underline transition-colors cursor-pointer"
                        >
                          {comment.user?.display_name || 'Utilisateur'}
                        </button>
                        <span className="text-stone-500 text-xs">
                          {formatDistanceToNow(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-stone-700 text-sm">{comment.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 rounded-b-2xl flex-shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10">
        <div 
            className="px-4 py-3"
          style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          }}
        >
          <form onSubmit={handleSubmit} className="flex items-center gap-3 bg-gray-50 rounded-full px-4 py-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Ajouter un commentaire…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center hover:brightness-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4 text-black" />
            </button>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}
