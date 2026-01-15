import { useEffect, useState } from 'react';
import { RefreshCw, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from '../utils/dateUtils';
import { useScrollLock } from '../hooks/useScrollLock';
import { useTheme } from '../contexts/ThemeContext';
import './NotificationsModal.light.css';
import './NotificationsModal.dark.css';

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
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      disabled={disabled}
      style={!isFollowing ? { color: "rgba(0, 0, 0, 1)" } : undefined}
      className={
        isFollowing
          ? [
              "px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-auto relative z-20",
              "border border-[rgba(249,245,6,1)] text-black",
              "bg-transparent hover:bg-[rgba(249,245,6,0.08)]",
              "disabled:opacity-50",
              "dark:border-[rgba(249,245,6,1)] dark:text-black dark:hover:bg-[rgba(249,245,6,0.12)]",
            ].join(" ")
          : [
              "px-3 py-1.5 rounded-full text-xs font-bold pointer-events-auto relative z-20",
              "bg-[rgba(249,245,6,1)] text-black hover:bg-[rgba(249,245,6,0.9)]",
              "disabled:opacity-50",
              "dark:bg-[rgba(249,245,6,1)] dark:text-black dark:hover:bg-[rgba(249,245,6,0.85)]",
            ].join(" ")
      }
    >
      {isFollowing ? (
        <span className="flex items-center gap-1">
          <Check className="w-3.5 h-3.5 stroke-[3]" />
          Suivi
        </span>
      ) : (
        "Suivre"
      )}
    </button>
  );
}

function SeeButton({ onClick, disabled }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      disabled={disabled}
      className={[
        "px-3 py-1.5 rounded-full text-xs font-bold pointer-events-auto relative z-20",
        "bg-[rgba(249,245,6,1)] text-[rgba(0,0,0,1)] hover:bg-[rgba(249,245,6,0.9)]",
        "disabled:opacity-50",
        "dark:bg-[rgba(249,245,6,1)] dark:text-[rgba(0,0,0,1)] dark:hover:bg-[rgba(249,245,6,0.85)]",
      ].join(" ")}
    >
      Voir
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
    activityId?: string | null;
    commentId?: string | null;
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
          "w-full flex items-start gap-3 py-3 text-left transition-colors cursor-pointer",
          "text-black dark:text-white",
          n.unread
            ? "bg-neutral-50 dark:bg-neutral-900"
            : "bg-white dark:bg-neutral-950",
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

        <div className="min-w-0 flex-1 space-y-1">
          {/* Ligne principale */}
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUserClick?.();
              }}
              className="text-left flex-1 min-w-0"
            >
              <span className="text-sm leading-snug text-black dark:text-white whitespace-normal break-words line-clamp-2">
                <span className="font-semibold text-black !text-black dark:text-white">
                  {n.actorName}
                </span>{" "}
                <span className="text-gray-900 !text-black dark:text-gray-100">
                  {n.type === 'comment'
                    ? "a commenté votre lecture"
                    : n.type === 'like'
                    ? "a aimé votre lecture"
                    : "s'est abonné à vous"}
                </span>
              </span>
            </button>
            <span
              className="text-[11px] whitespace-nowrap mt-0.5"
              style={{ color: 'var(--tw-ring-offset-color)' }}
            >
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
              className="text-xs text-black hover:text-gray-900 text-left line-clamp-1 dark:text-white dark:hover:text-white/90"
            >
              {icon}{" "}
              <span className="italic text-black dark:text-white">
                "{n.bookTitle}"
              </span>
            </button>
          )}

          {/* Preview commentaire */}
          {n.type === 'comment' && n.commentText && (
            <div className="inline-flex max-w-full rounded-full bg-gray-50 border border-gray-200 px-3 py-1 dark:bg-neutral-800 dark:border-neutral-700">
              <p className="text-xs text-gray-800 line-clamp-1 dark:text-gray-50">
                {n.commentText}
              </p>
            </div>
          )}
        </div>

        {/* Action à droite */}
        {n.type === 'follow' && (
          <div
            className="shrink-0 pt-0.5 relative z-20 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFollow?.();
            }}
          >
            <FollowButton
              isFollowing={!!n.isFollowing}
              onClick={(e) => {
                e?.stopPropagation();
                onToggleFollow?.();
              }}
            />
          </div>
        )}

        {n.type !== 'follow' && n.activityId && (
          <div className="shrink-0 pt-0.5 relative z-20 pointer-events-auto">
            <SeeButton
              onClick={() => {
                onClick?.();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type TabType = 'all' | 'follows' | 'likes' | 'comments';

export function NotificationsModal({ onClose, onUserClick, onOpenMyActivity }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const { user } = useAuth();
  const { resolved } = useTheme();

  useEffect(() => {
    if (user) {
      loadNotifications();
      markNotificationsAsRead();
      loadFollowingIds();
    }
  }, [user]);

  const loadFollowingIds = async () => {
    if (!user) return;

    const { data: follows, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (error) {
      console.error('Erreur chargement follows:', error);
      return;
    }

    if (follows) {
      console.log('[NotificationsModal] Following IDs chargés:', follows.map((f) => f.following_id));
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
    const markFollowing = () => setFollowingIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    const markUnfollow = () => setFollowingIds((prev) => prev.filter((id) => id !== userId));
    const isDuplicateError = (err: any) =>
      err?.code === '23505' ||
      err?.details?.toLowerCase?.().includes('already exists') ||
      err?.message?.toLowerCase?.().includes('duplicate key') ||
      err?.hint?.toLowerCase?.().includes('already exists') ||
      err?.code === '409' ||
      err?.status === 409;

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', userId);

      markUnfollow();
    } else {
      // Insert simple, on tolère les 409 (relation déjà existante)
      const { error: followError } = await supabase
        .from('follows')
        .insert({ follower_id: user.id, following_id: userId });

      if (followError && !isDuplicateError(followError)) {
        console.error('Erreur lors du follow:', followError);
        return;
      }

      // Notification (on ignore les doublons)
      await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: user.id,
        type: 'follow',
        read: false,
        created_at: new Date().toISOString(),
      });

      markFollowing();
    }

    // Recharger l'état des follows depuis la DB pour avoir la vérité
    await loadFollowingIds();
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
  const allTransformedNotifications = notifications.map((notif) => {
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

  // Filtrer selon l'onglet actif
  const transformedNotifications = allTransformedNotifications.filter((notif) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'follows') return notif.type === 'follow';
    if (activeTab === 'likes') return notif.type === 'like';
    if (activeTab === 'comments') return notif.type === 'comment';
    return true;
  });

  // Compter les notifications par type
  const followsCount = allTransformedNotifications.filter(n => n.type === 'follow').length;
  const likesCount = allTransformedNotifications.filter(n => n.type === 'like').length;
  const commentsCount = allTransformedNotifications.filter(n => n.type === 'comment').length;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[100] px-4 pt-12 pb-12 sm:pt-16"
      onClick={onClose}
    >
      <div
        className={[
          "rounded-3xl bg-white text-black shadow-xl overflow-hidden",
          "w-full max-w-[1100px] max-h-[78vh] flex flex-col mb-10 sm:mb-12",
          "dark:bg-neutral-950 dark:text-white",
          resolved === 'dark' ? 'notif-theme-dark' : 'notif-theme-light',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 notif-header">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold notif-title">Notifications</h2>
              <span className="text-xs notif-dot">•</span>
              <span className="text-xs notif-count">{notifications.length}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  loadNotifications();
                  loadFollowingIds();
                }}
                className="p-2 rounded-lg notif-icon-btn"
                title="Actualiser"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg notif-icon-btn"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Onglets */}
          <div className="notif-tabs">
            <button
              className={`notif-tab ${activeTab === 'all' ? 'notif-tab-active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              Toutes
              <span className="notif-tab-badge">{notifications.length}</span>
            </button>
            <button
              className={`notif-tab ${activeTab === 'follows' ? 'notif-tab-active' : ''}`}
              onClick={() => setActiveTab('follows')}
            >
              Suivis
              <span className="notif-tab-badge">{followsCount}</span>
            </button>
            <button
              className={`notif-tab ${activeTab === 'likes' ? 'notif-tab-active' : ''}`}
              onClick={() => setActiveTab('likes')}
            >
              Likes
              <span className="notif-tab-badge">{likesCount}</span>
            </button>
            <button
              className={`notif-tab ${activeTab === 'comments' ? 'notif-tab-active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              Commentaires
              <span className="notif-tab-badge">{commentsCount}</span>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto pb-24 px-0">
          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-300">Chargement...</div>
          ) : transformedNotifications.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty-icon">
                {activeTab === 'follows' && '👥'}
                {activeTab === 'likes' && '💛'}
                {activeTab === 'comments' && '💬'}
                {activeTab === 'all' && '🔔'}
              </div>
              <p className="notif-empty-title">
                {activeTab === 'follows' && 'Aucun nouvel abonnement'}
                {activeTab === 'likes' && 'Aucun like reçu'}
                {activeTab === 'comments' && 'Aucun commentaire'}
                {activeTab === 'all' && 'Aucune notification'}
              </p>
              <p className="notif-empty-desc">
                {activeTab === 'follows' && 'Personne ne s\'est abonné à vous récemment'}
                {activeTab === 'likes' && 'Vous n\'avez pas encore reçu de likes'}
                {activeTab === 'comments' && 'Aucun commentaire sur vos lectures'}
                {activeTab === 'all' && 'Vous recevrez des notifications quand quelqu\'un interagit avec vous'}
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
                      activityId: notif.activityId,
                      commentId: notif.commentId,
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
