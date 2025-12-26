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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl max-w-2xl w-full max-h-[70vh] mb-16 flex flex-col" onClick={(e) => e.stopPropagation()}>
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

        <div className="p-4 border-t border-stone-200">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Ajouter un commentaire..."
              className="flex-1 px-4 py-2 border border-stone-300 rounded-full focus:outline-none focus:ring-2 focus:ring-lime-400 focus:border-transparent"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-stone-900 text-white hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
