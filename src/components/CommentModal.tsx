import { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from '../utils/dateUtils';

interface Comment {
  id: string;
  user: {
    display_name: string;
    username: string;
  };
  content: string;
  created_at: string;
}

interface CommentModalProps {
  activityId: string;
  onClose: () => void;
}

export function CommentModal({ activityId, onClose }: CommentModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    loadComments();
  }, [activityId]);

  const loadComments = async () => {
    setLoading(true);

    const { data } = await supabase
      .from('activity_comments')
      .select(`
        id,
        content,
        created_at,
        user_profiles!activity_comments_user_id_fkey(username, display_name)
      `)
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true });

    if (data) {
      setComments(
        data.map((comment: any) => ({
          id: comment.id,
          user: comment.user_profiles,
          content: comment.content,
          created_at: comment.created_at,
        }))
      );
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
    }

    setSubmitting(false);
  };

  return (
    <div 
      className="fixed inset-0 z-[300] bg-black/30 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[70vh] mb-24" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-bold">Commentaires</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-stone-500">Chargement des commentaires...</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-stone-600">Aucun commentaire pour le moment</p>
              <p className="text-sm text-stone-500 mt-1">Soyez le premier à commenter</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 text-sm font-medium flex-shrink-0">
                    {comment.user.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-stone-900">
                        {comment.user.display_name}
                      </span>
                      <span className="text-stone-500 text-xs">
                        {formatDistanceToNow(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-stone-700 text-sm">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-4">
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
  );
}
