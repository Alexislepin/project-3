import { useEffect, useState } from 'react';
import { X, Heart, RefreshCw, UserPlus, UserCheck, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from '../utils/dateUtils';
import { useScrollLock } from '../hooks/useScrollLock';

interface NotificationsModalProps {
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

interface Notification {
  id: string;
  type: 'follow' | 'reaction' | 'comment';
  userId: string; // ID de l'utilisateur concerné par la notification
  user: {
    display_name: string;
    username: string;
    avatar_url?: string;
  };
  activity?: {
    id: string;
    title: string;
  };
  comment?: {
    content: string;
  };
  reactionType?: string;
  created_at: string;
}

export function NotificationsModal({ onClose, onUserClick }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadNotifications();
      markNotificationsAsRead();
      loadFollowingIds();
    }
  }, [user]);

  const loadFollowingIds = async () => {
    if (!user) return;

    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (follows) {
      setFollowingIds(follows.map((f) => f.following_id));
    }
  };

  const markNotificationsAsRead = async () => {
    if (!user) return;

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  };

  const loadNotifications = async () => {
    if (!user) return;

    setLoading(true);

    // 1. Charger les notifications de follow depuis la table notifications
    let followNotifications: any[] = [];
    try {
      const result = await supabase
        .from('notifications')
        .select('id, type, created_at, actor_id, read')
        .eq('user_id', user.id)
        .eq('type', 'follow')
        .order('created_at', { ascending: false })
        .limit(30);
      
      followNotifications = result.data || [];
    } catch (error) {
      console.error('Erreur lors du chargement des notifications follow:', error);
    }

    // 2. Charger les likes (activity_reactions) sur mes activités
    let reactionNotifications: Notification[] = [];
    try {
      const { data: reactions } = await supabase
        .from('activity_reactions')
        .select(`
          id,
          created_at,
          type,
          user_id,
          activity_id,
          activities!inner(
            id,
            user_id,
            title
          ),
          user_profiles!activity_reactions_user_id_fkey(
            display_name,
            username,
            avatar_url
          )
        `)
        .eq('activities.user_id', user.id)
        .neq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (reactions) {
        reactionNotifications = reactions.map((reaction: any) => ({
          id: reaction.id,
          type: 'reaction' as const,
          userId: reaction.user_id,
          user: {
            display_name: reaction.user_profiles?.display_name || 'Utilisateur inconnu',
            username: reaction.user_profiles?.username || 'user',
            avatar_url: reaction.user_profiles?.avatar_url,
          },
          activity: {
            id: reaction.activity_id,
            title: reaction.activities?.title || 'Votre activité',
          },
          reactionType: reaction.type,
          created_at: reaction.created_at,
        }));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des réactions:', error);
    }

    // 3. Charger les commentaires (activity_comments) sur mes activités
    let commentNotifications: Notification[] = [];
    try {
      const { data: comments } = await supabase
        .from('activity_comments')
        .select(`
          id,
          created_at,
          user_id,
          activity_id,
          content,
          activities!inner(
            id,
            user_id,
            title
          ),
          user_profiles!activity_comments_user_id_fkey(
            display_name,
            username,
            avatar_url
          )
        `)
        .eq('activities.user_id', user.id)
        .neq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (comments) {
        commentNotifications = comments.map((comment: any) => ({
          id: comment.id,
          type: 'comment' as const,
          userId: comment.user_id,
          user: {
            display_name: comment.user_profiles?.display_name || 'Utilisateur inconnu',
            username: comment.user_profiles?.username || 'user',
            avatar_url: comment.user_profiles?.avatar_url,
          },
          activity: {
            id: comment.activity_id,
            title: comment.activities?.title || 'Votre activité',
          },
          comment: {
            content: comment.content || '',
          },
          created_at: comment.created_at,
        }));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des commentaires:', error);
    }

    // 4. Récupérer les profils des utilisateurs qui ont suivi
    const actorIds = followNotifications.map((n: any) => n.actor_id).filter((id: string) => id);
    let actorProfiles: Record<string, any> = {};
    
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', actorIds);
      
      if (profiles) {
        actorProfiles = profiles.reduce((acc: Record<string, any>, profile: any) => {
          acc[profile.id] = profile;
          return acc;
        }, {});
      }
    }

    // 5. Transformer les notifications de follow
    const followNotifs: Notification[] = followNotifications
      .filter((notif: any) => notif.actor_id)
      .map((notif: any) => {
        const profile = actorProfiles[notif.actor_id] || {};
        return {
          id: notif.id,
          type: 'follow' as const,
          userId: notif.actor_id,
          user: {
            display_name: profile.display_name || 'Utilisateur inconnu',
            username: profile.username || 'user',
            avatar_url: profile.avatar_url,
          },
          created_at: notif.created_at,
        };
      });

    // 6. Fusionner et trier toutes les notifications par date
    const allNotifications = [...followNotifs, ...reactionNotifications, ...commentNotifications]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30);

    setNotifications(allNotifications);
    setLoading(false);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'follow':
        return UserPlus;
      case 'reaction':
        return Heart;
      case 'comment':
        return MessageCircle;
      default:
        return Heart;
    }
  };

  const getNotificationText = (notif: Notification) => {
    if (notif.type === 'follow') {
      return (
        <>
          <span className="font-semibold">{notif.user.display_name}</span> s'est abonné à vous
        </>
      );
    }
    if (notif.type === 'reaction') {
      return (
        <>
          <span className="font-semibold">{notif.user.display_name}</span> a aimé votre lecture
          {notif.activity?.title && (
            <span className="text-stone-600"> "{notif.activity.title}"</span>
          )}
        </>
      );
    }
    if (notif.type === 'comment') {
      return (
        <>
          <span className="font-semibold">{notif.user.display_name}</span> a commenté votre lecture
          {notif.activity?.title && (
            <span className="text-stone-600"> "{notif.activity.title}"</span>
          )}
        </>
      );
    }
    return <span className="font-semibold">{notif.user.display_name}</span>;
  };

  const handleFollow = async (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || userId === user.id) return;

    const isFollowing = followingIds.includes(userId);

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      setFollowingIds(followingIds.filter((id) => id !== userId));
    } else {
      const { error: followError } = await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: userId,
      });

      if (followError) {
        console.error('Erreur lors du follow:', followError);
      } else {
        setFollowingIds([...followingIds, userId]);
      }
    }
  };

  useScrollLock(true);

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4 py-6"
      data-modal-overlay
      style={{ 
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))', 
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' 
      }}
      onClick={onClose}
      onTouchMove={(e) => {
        // Prevent scroll on overlay
        const target = e.target as HTMLElement;
        if (!target.closest('[data-modal-content]')) {
          e.preventDefault();
        }
      }}
    >
      <div
        data-modal-content
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[calc(100vh-7rem)] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Notifications</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadNotifications();
                loadFollowingIds();
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
              title="Rafraîchir"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div 
          className="flex-1 overflow-y-auto min-h-0 px-4 pt-3"
          style={{ 
            paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >
          {loading ? (
            <div className="text-center py-12 text-text-sub-light">Chargement...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="w-16 h-16 mx-auto mb-4 text-text-sub-light" />
              <p className="text-lg font-medium text-text-main-light mb-2">Aucune notification</p>
              <p className="text-sm text-text-sub-light">
                Vous recevrez des notifications quand quelqu'un interagit avec vous
              </p>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              {notifications.map((notif) => {
                const Icon = getNotificationIcon(notif.type);
                const isFollowing = notif.userId && followingIds.includes(notif.userId);
                const isOwnProfile = notif.userId === user?.id;
                const showFollowButton = notif.type === 'follow' && !isOwnProfile && onUserClick && notif.userId;

                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => {
                      if (!notif.userId) return;
                      onUserClick?.(notif.userId);
                      setTimeout(() => onClose?.(), 0);
                    }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-stone-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-stone-200 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {notif.user.avatar_url ? (
                        <img
                          src={notif.user.avatar_url}
                          alt={notif.user.display_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-stone-600 font-medium">
                          {notif.user.display_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                        <p className="text-sm text-stone-900 flex-1 leading-relaxed">
                          {getNotificationText(notif)}
                        </p>
                      </div>
                      {notif.type === 'comment' && notif.comment?.content && (
                        <div className="ml-6 mt-2 p-3 bg-stone-50 rounded-lg border border-stone-200">
                          <p className="text-xs text-stone-700 line-clamp-2">
                            {notif.comment.content}
                          </p>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-stone-500">{formatDistanceToNow(notif.created_at)}</p>
                        {showFollowButton && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFollow(notif.userId, e);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                              isFollowing
                                ? 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                                : 'bg-primary text-black hover:brightness-95'
                            }`}
                          >
                            {isFollowing ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                Suivi
                              </>
                            ) : (
                              <>
                                <UserPlus className="w-3.5 h-3.5" />
                                Suivre
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {/* Spacer pour éviter que le dernier item soit caché par la tab bar */}
              <div className="h-6" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
