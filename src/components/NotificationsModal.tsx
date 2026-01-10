import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from '../utils/dateUtils';
import { useScrollLock } from '../hooks/useScrollLock';

interface NotificationsModalProps {
  onClose: () => void;
  onUserClick?: (userId: string) => void;
  onOpenMyActivity?: (activityId: string, commentId?: string | null, notifType?: 'like' | 'comment') => void;
}

type NotifType = 'comment' | 'like' | 'follow';

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
    id?: string;
  };
  reactionType?: string;
  created_at: string;
  read?: boolean;
}

// Composants UI propres
function getIcon(type: NotifType) {
  if (type === 'comment') return '💬';
  if (type === 'like') return '💛';
  return '👤';
}

function formatAgo(iso: string) {
  return formatDistanceToNow(iso);
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase();
  const safeUrl = url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('/')) ? url : undefined;
  return (
    <div className="h-10 w-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
      {safeUrl ? (
        <img src={safeUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-gray-600">{letter}</span>
      )}
    </div>
  );
}

function FollowButton({
  isFollowing,
  onClick,
  disabled,
}: {
  isFollowing: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        isFollowing
          ? "px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          : "px-3 py-1.5 rounded-full text-xs font-bold bg-black text-white hover:bg-gray-900 disabled:opacity-50"
      }
    >
      {isFollowing ? "Suivi" : "Suivre"}
    </button>
  );
}

function NotificationItem({
  n,
  onOpenBook,
  onToggleFollow,
  onUserClick,
  onClick,
}: {
  n: {
    id: string;
    type: NotifType;
    created_at: string;
    actorName: string;
    actorAvatar?: string | null;
    bookTitle?: string | null;
    commentText?: string | null;
    isFollowing?: boolean;
    unread?: boolean;
  };
  onOpenBook?: () => void;
  onToggleFollow?: () => void;
  onUserClick?: () => void;
  onClick?: () => void;
}) {
  const icon = getIcon(n.type);

  return (
    <div className="px-4">
      <div
        role="button"
        tabIndex={0}
        className={[
          "w-full flex gap-3 py-3 text-left transition-colors cursor-pointer",
          "border-b border-gray-100",
          n.unread 
            ? "bg-neutral-50 border border-neutral-200 hover:bg-neutral-100" 
            : "bg-white hover:bg-gray-50",
        ].join(" ")}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        <div className="shrink-0 relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUserClick?.();
            }}
            className="shrink-0"
          >
            <Avatar name={n.actorName} url={n.actorAvatar} />
          </button>
          {/* Dot unread */}
          {n.unread && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-neutral-400 border border-white" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Ligne principale */}
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUserClick?.();
              }}
              className="text-left flex-1"
            >
              <span className="text-sm leading-snug text-gray-900">
                <span className="font-semibold">{n.actorName}</span>{" "}
                <span className="text-gray-600">
                  {n.type === 'comment'
                    ? "a commenté votre lecture"
                    : n.type === 'like'
                    ? "a aimé votre lecture"
                    : "s'est abonné à vous"}
                </span>
              </span>
            </button>
            <span className="text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">
              {formatAgo(n.created_at)}
            </span>
          </div>

          {/* Sous-ligne : livre cliquable */}
          {(n.bookTitle && n.type !== 'follow') && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenBook?.();
              }}
              className="mt-1 text-xs text-gray-500 hover:text-gray-900 text-left line-clamp-1"
            >
              {icon} <span className="italic">"{n.bookTitle}"</span>
            </button>
          )}

          {/* Preview commentaire */}
          {n.type === 'comment' && n.commentText && (
            <div className="mt-2 inline-flex max-w-full rounded-full bg-gray-50 border border-gray-200 px-3 py-1">
              <p className="text-xs text-gray-700 line-clamp-1">
                {n.commentText}
              </p>
            </div>
          )}
        </div>

        {/* Action à droite */}
        {n.type === 'follow' && (
          <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <FollowButton
              isFollowing={!!n.isFollowing}
              onClick={(e) => {
                e?.stopPropagation();
                onToggleFollow?.();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationsModal({ onClose, onUserClick, onOpenMyActivity }: NotificationsModalProps) {
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

  const markNotificationAsRead = async (notificationId: string) => {
    if (!user) return;

    // Update optimistically in state
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );

    // Update in database
    try {
      // Try to update in notifications table (for follow notifications)
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
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
      
      // Marquer read: false par défaut si le champ n'existe pas
      followNotifications = (result.data || []).map((n: any) => ({
        ...n,
        read: n.read ?? false,
      }));
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
          read: false, // Les réactions n'ont pas de champ read dans la table
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
            id: comment.id,
          },
          created_at: comment.created_at,
          read: false, // Les commentaires n'ont pas de champ read dans la table
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
          read: notif.read ?? false,
        };
      });

    // 6. Fusionner et trier toutes les notifications par date
    const allNotifications = [...followNotifs, ...reactionNotifications, ...commentNotifications]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30);

    setNotifications(allNotifications);
    setLoading(false);
  };

  // Extraire le titre du livre depuis activity.title (format: "Read [Book Title]")
  const extractBookTitle = (activityTitle?: string): string | null => {
    if (!activityTitle) return null;
    // Format typique: "Read [Book Title]" ou "Lu [Book Title]" ou juste "[Book Title]"
    const patterns = [
      /Read\s+"?([^"]+)"?/i,
      /Lu\s+"?([^"]+)"?/i,
      /"?([^"]+)"?/,
    ];
    for (const pattern of patterns) {
      const match = activityTitle.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return activityTitle;
  };

  const handleFollow = async (userId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
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
        // Créer la notification avec upsert pour éviter les doublons
        await supabase
          .from('notifications')
          .upsert(
            {
              user_id: userId,   // celui qui reçoit la notif
              actor_id: user.id,       // celui qui follow
              type: 'follow',
              read: false,
              created_at: new Date().toISOString(), // remonte en haut à chaque re-follow
            },
            {
              onConflict: 'user_id,actor_id,type',
            }
          );
        
        setFollowingIds([...followingIds, userId]);
      }
    }
  };

  useScrollLock(true);

  // Handler pour cliquer sur une notification
  const handleNotificationClick = async (notif: Notification) => {
    // Marquer comme lu (optimiste)
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );

    // Marquer comme lu en base
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notif.id)
        .eq('user_id', user?.id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }

    // Fermer le modal
    onClose();

    // Navigation selon le type
    switch (notif.type) {
      case 'reaction':
        // Ouvrir MON profil avec focus sur MON activité
        if (notif.activity?.id && onOpenMyActivity) {
          onOpenMyActivity(notif.activity.id, null, 'like');
        }
        break;

      case 'comment':
        // Ouvrir MON profil avec focus sur MON activité et le commentaire
        if (notif.activity?.id && onOpenMyActivity) {
          const commentId = notif.comment?.id || null;
          onOpenMyActivity(notif.activity.id, commentId, 'comment');
        }
        break;

      case 'follow':
        // Ouvrir le profil de l'utilisateur qui a suivi (actor_id)
        if (notif.userId && onUserClick) {
          onUserClick(notif.userId);
        }
        break;

      default:
        // Fallback: activité si disponible, sinon profil
        if (notif.activity?.id && onOpenMyActivity) {
          onOpenMyActivity(notif.activity.id, notif.comment?.id || null);
        } else if (notif.userId && onUserClick) {
          onUserClick(notif.userId);
        }
        break;
    }
  };

  // Transformer les notifications pour NotificationItem
  const transformedNotifications = notifications.map((notif) => {
    const notifType: NotifType = notif.type === 'reaction' ? 'like' : notif.type === 'comment' ? 'comment' : 'follow';
    const isFollowing = notif.userId && followingIds.includes(notif.userId);
    const isOwnProfile = notif.userId === user?.id;
    
    return {
      id: notif.id,
      type: notifType,
      created_at: notif.created_at,
      actorName: notif.user.display_name || 'Utilisateur',
      actorAvatar: notif.user.avatar_url,
      bookTitle: extractBookTitle(notif.activity?.title),
      commentText: notif.comment?.content,
      isFollowing: notifType === 'follow' ? isFollowing : undefined,
      unread: !notif.read,
      userId: notif.userId,
      activityId: notif.activity?.id,
      commentId: notif.comment?.id,
      isOwnProfile,
      // Garder la référence à la notification originale pour handleNotificationClick
      originalNotif: notif,
    };
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="rounded-2xl bg-white shadow-xl overflow-hidden w-[420px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900">Notifications</h2>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">{notifications.length}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadNotifications();
                loadFollowingIds();
              }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Actualiser"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              title="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Chargement...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="text-4xl mb-4">💬</div>
              <p className="text-lg font-medium text-gray-900 mb-2">Aucune notification</p>
              <p className="text-sm text-gray-500">
                Vous recevrez des notifications quand quelqu'un interagit avec vous
              </p>
            </div>
          ) : (
            <>
              {transformedNotifications.map((notif) => {
                return (
                  <NotificationItem
                    key={notif.id}
                    n={{
                      id: notif.id,
                      type: notif.type,
                      created_at: notif.created_at,
                      actorName: notif.actorName,
                      actorAvatar: notif.actorAvatar,
                      bookTitle: notif.bookTitle,
                      commentText: notif.commentText,
                      isFollowing: notif.isFollowing,
                      unread: notif.unread,
                    }}
                    onClick={() => {
                      if (notif.originalNotif) {
                        handleNotificationClick(notif.originalNotif);
                      }
                    }}
                    onUserClick={() => {
                      if (notif.userId && onUserClick) {
                        markNotificationAsRead(notif.id);
                        onUserClick(notif.userId);
                        setTimeout(() => onClose(), 0);
                      }
                    }}
                    onOpenBook={() => {
                      // Ouvrir MON activité si disponible
                      if (notif.activityId && onOpenMyActivity) {
                        markNotificationAsRead(notif.id);
                        onOpenMyActivity(notif.activityId, notif.commentId || null, notif.type === 'comment' ? 'comment' : 'like');
                        setTimeout(() => onClose(), 0);
                      }
                    }}
                    onToggleFollow={() => {
                      if (notif.userId) {
                        handleFollow(notif.userId);
                      }
                    }}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
