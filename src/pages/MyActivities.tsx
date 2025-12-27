import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ActivityCard } from '../components/ActivityCard';
import { EditActivityModal } from '../components/EditActivityModal';
import { DeleteActivityModal } from '../components/DeleteActivityModal';
import { CommentModal } from '../components/CommentModal';
import { LikersModal } from '../components/LikersModal';
import { AppHeader } from '../components/AppHeader';
import { X } from 'lucide-react';
import { getScrollTopOffset, getScrollBottomPadding } from '../lib/layoutConstants';

interface MyActivitiesProps {
  onClose: () => void;
  userId?: string; // Optional: if not provided, uses current user
  title?: string; // Optional: custom title
}

export function MyActivities({ onClose, userId: targetUserId, title }: MyActivitiesProps) {
  const { user } = useAuth();
  const userId = targetUserId || user?.id;
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [commentingActivityId, setCommentingActivityId] = useState<string | null>(null);
  const [likersActivityId, setLikersActivityId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [deletingActivity, setDeletingActivity] = useState<any>(null);

  const loadActivities = useCallback(async () => {
    if (!userId) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('activities')
        .select(`
          *,
          user_id,
          photos,
          user_profiles!activities_user_id_fkey(id, username, display_name, avatar_url),
          books!activities_book_id_fkey(title, author, cover_url, openlibrary_cover_id, isbn)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[MyActivities] Error loading activities:', error);
        setActivities([]);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      // Fetch custom_cover_url for activities that have book_id
      if (data.length > 0) {
        const bookIds = data.map(a => a.book_id).filter(Boolean) as string[];
        
        if (bookIds.length > 0) {
          const { data: userBooksData } = await supabase
            .from('user_books')
            .select('book_id, user_id, custom_cover_url')
            .in('book_id', bookIds)
            .eq('user_id', userId);
          
          const customCoverMap = new Map<string, string | null>();
          if (userBooksData) {
            userBooksData.forEach(ub => {
              const key = `${ub.user_id}:${ub.book_id}`;
              customCoverMap.set(key, ub.custom_cover_url);
            });
          }
          
          data.forEach(activity => {
            if (activity.book_id && activity.books) {
              const key = `${activity.user_id}:${activity.book_id}`;
              const customCoverUrl = customCoverMap.get(key);
              if (customCoverUrl !== undefined) {
                (activity.books as any).custom_cover_url = customCoverUrl;
              }
            }
          });
        }
      }

      const activityIds = data.map((a) => a.id);

      // Fetch reactions and comments
      const { data: allReactions } = await supabase
        .from('activity_reactions')
        .select('activity_id, user_id')
        .in('activity_id', activityIds);

      const { data: allComments } = await supabase
        .from('activity_comments')
        .select('activity_id')
        .in('activity_id', activityIds);

          // Group reactions by activity_id
      const reactionsByActivity = new Map<string, { count: number; userHasReacted: boolean }>();
      if (allReactions && user) {
        for (const reaction of allReactions) {
          const activityId = reaction.activity_id;
          const existing = reactionsByActivity.get(activityId) || { count: 0, userHasReacted: false };
          existing.count++;
          if (reaction.user_id === user.id) {
            existing.userHasReacted = true;
          }
          reactionsByActivity.set(activityId, existing);
        }
      }

      // Group comments by activity_id
      const commentsByActivity = new Map<string, number>();
      if (allComments) {
        for (const comment of allComments) {
          const activityId = comment.activity_id;
          commentsByActivity.set(activityId, (commentsByActivity.get(activityId) || 0) + 1);
        }
      }

      // Build activities with counts
      const activitiesWithReactions = data.map((activity) => {
        const reactions = reactionsByActivity.get(activity.id) || { count: 0, userHasReacted: false };
        const commentsCount = commentsByActivity.get(activity.id) || 0;

        return {
          id: activity.id,
          user: activity.user_profiles,
          user_id: activity.user_id,
          type: activity.type,
          title: activity.title,
          pages_read: activity.pages_read,
          duration_minutes: activity.duration_minutes,
          notes: activity.notes,
          quotes: activity.quotes || [],
          book: activity.books,
          created_at: activity.created_at,
          reactions_count: reactions.count,
          comments_count: commentsCount,
          user_has_reacted: reactions.userHasReacted,
        };
      });

      setActivities(activitiesWithReactions);
    } catch (error: any) {
      console.error('[MyActivities] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, user]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const isOwner = user && userId === user.id;

  const handleReact = async (activityId: string) => {
    if (!user) return;

    const a = activities.find((x) => x.id === activityId);
    if (!a) return;

    // Optimistic UI
    setActivities((prev) =>
      prev.map((x) => {
        if (x.id !== activityId) return x;
        const nextLiked = !x.user_has_reacted;
        return {
          ...x,
          user_has_reacted: nextLiked,
          reactions_count: Math.max(0, (x.reactions_count || 0) + (nextLiked ? 1 : -1)),
        };
      })
    );

    try {
      if (a.user_has_reacted) {
        await supabase
          .from('activity_reactions')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('activity_reactions')
          .upsert(
            { activity_id: activityId, user_id: user.id, type: 'like' },
            { onConflict: 'user_id,activity_id' }
          );
      }
    } catch (e) {
      console.error('[handleReact] error', e);
      loadActivities();
    }
  };

  const handleEdit = (activityId: string) => {
    if (!isOwner) return;
    const activity = activities.find(a => a.id === activityId);
    if (activity) {
      setEditingActivity(activity);
      setEditingActivityId(activityId);
    }
  };

  const handleDelete = (activityId: string) => {
    if (!isOwner) return;
    const activity = activities.find(a => a.id === activityId);
    if (activity) {
      setDeletingActivity(activity);
      setDeletingActivityId(activityId);
    }
  };

  const handleEditSaved = () => {
    loadActivities();
    setEditingActivityId(null);
    setEditingActivity(null);
  };

  const handleDeleteConfirmed = () => {
    setActivities(prev => prev.filter(a => a.id !== deletingActivityId));
    setDeletingActivityId(null);
    setDeletingActivity(null);
  };

  return (
    <div className="h-screen max-w-2xl mx-auto bg-background-light overflow-hidden">
      {/* Fixed Header - now truly fixed via AppHeader component */}
      <AppHeader
        title={title || (isOwner ? "Mes activités" : "Activités")}
        rightActions={
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-black/5 rounded-full transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5 text-text-sub-light" />
          </button>
        }
      />

      {/* ✅ SCROLL ICI - Single scrollable container with proper padding */}
      <div
        className="h-full overflow-y-auto"
        style={{
          paddingTop: getScrollTopOffset(),
          paddingBottom: getScrollBottomPadding(),
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y', // Allow vertical panning only
        }}
      >
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12 text-stone-500">Chargement...</div>
          ) : activities.length > 0 ? (
            <div className="space-y-2">
              {activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onReact={() => handleReact(activity.id)}
                  onComment={() => setCommentingActivityId(activity.id)}
                  onOpenLikers={(id) => setLikersActivityId(id)}
                  onEdit={isOwner ? handleEdit : undefined}
                  onDelete={isOwner ? handleDelete : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-stone-600 mb-2">Aucune activité</p>
              <p className="text-sm text-stone-500">
                Vos activités de lecture apparaîtront ici
              </p>
            </div>
          )}
        </div>
      </div>

      {editingActivityId && editingActivity && (
        <EditActivityModal
          activityId={editingActivityId}
          initialPages={editingActivity.pages_read}
          initialDuration={editingActivity.duration_minutes}
          initialNotes={editingActivity.notes}
          onClose={() => {
            setEditingActivityId(null);
            setEditingActivity(null);
          }}
          onSaved={handleEditSaved}
        />
      )}

      {deletingActivityId && deletingActivity && (
        <DeleteActivityModal
          activityId={deletingActivityId}
          activityPages={deletingActivity.pages_read}
          onClose={() => {
            setDeletingActivityId(null);
            setDeletingActivity(null);
          }}
          onDeleted={handleDeleteConfirmed}
        />
      )}

      {commentingActivityId && (
        <CommentModal
          activityId={commentingActivityId}
          onClose={() => {
            setCommentingActivityId(null);
            loadActivities();
          }}
        />
      )}

      {likersActivityId && (
        <LikersModal
          activityId={likersActivityId}
          onClose={() => setLikersActivityId(null)}
        />
      )}
    </div>
  );
}

