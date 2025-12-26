import { useEffect, useState } from 'react';
import { X, BookOpen, Users, Heart, RefreshCw, UserPlus, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from '../utils/dateUtils';

interface NotificationsModalProps {
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

interface Notification {
  id: string;
  type: 'activity' | 'follow' | 'reaction';
  userId: string; // ID de l'utilisateur concerné par la notification
  user: {
    display_name: string;
    username: string;
    avatar_url?: string;
  };
  activity?: {
    title: string;
    pages_read?: number;
  };
  created_at: string;
}


export function NotificationsModal({ onClose, onUserClick }: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      console.log('Chargement des notifications pour user:', user.id);
      loadNotifications();
      markNotificationsAsRead();
      loadFollowingIds();
    }
  }, [user]);

  const loadFollowingIds = async () => {
    if (!user) return;

    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (followsError) {
      console.error('=== FOLLOWS ERROR (NotificationsModal) ===');
      console.error('Full error:', followsError);
      console.error('Message:', followsError.message);
      console.error('Details:', followsError.details);
      console.error('Hint:', followsError.hint);
      console.error('Code:', followsError.code);
      console.error('Query:', `follows?select=following_id&follower_id=eq.${user.id}`);
    }

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

    // Charger les notifications de follow depuis la table notifications
    // On charge TOUTES les notifications (lues et non lues) pour le débogage
    let followNotifications: any[] = [];
    let notifError: any = null;
    
    try {
      const result = await supabase
        .from('notifications')
        .select('id, type, created_at, actor_id, read')
        .eq('user_id', user.id)
        .eq('type', 'follow')
        .order('created_at', { ascending: false })
        .limit(20);
      
      followNotifications = result.data || [];
      notifError = result.error;
      
      if (notifError) {
        console.error('Erreur lors du chargement des notifications:', notifError);
        // Si la table n'existe pas, on continue quand même sans erreur
        if (notifError.message?.includes('schema cache') || notifError.message?.includes('does not exist')) {
          console.warn('Table notifications non trouvée dans le cache. Attendez quelques secondes et réessayez.');
        }
      } else {
        console.log('Notifications de follow trouvées:', followNotifications.length);
        if (followNotifications.length > 0) {
          console.log('Détails des notifications:', followNotifications);
        }
      }
    } catch (error: any) {
      console.error('Exception lors du chargement des notifications:', error);
      notifError = error;
    }

    // Charger les activités des personnes suivies
    const { data: follows, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (followsError) {
      console.error('=== FOLLOWS ERROR (NotificationsModal loadNotifications) ===');
      console.error('Full error:', followsError);
      console.error('Message:', followsError.message);
      console.error('Details:', followsError.details);
      console.error('Hint:', followsError.hint);
      console.error('Code:', followsError.code);
      console.error('Query:', `follows?select=following_id&follower_id=eq.${user.id}`);
    }

    const followingIds = follows?.map((f) => f.following_id) || [];

    let activityNotifications: Notification[] = [];
    if (followingIds.length > 0) {
      const { data: activities } = await supabase
        .from('activities')
        .select('id, title, pages_read, created_at, user_id, user_profiles!activities_user_id_fkey(display_name, username, avatar_url)')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(20);

      if (activities) {
        activityNotifications = activities.map((activity: any) => ({
          id: activity.id,
          type: 'activity' as const,
          userId: activity.user_id || '', // S'assurer que userId est toujours défini
          user: {
            display_name: activity.user_profiles.display_name,
            username: activity.user_profiles.username,
            avatar_url: activity.user_profiles.avatar_url,
          },
          activity: {
            title: activity.title,
            pages_read: activity.pages_read,
          },
          created_at: activity.created_at,
        }));
      }
    }

    // Récupérer les profils des utilisateurs qui ont suivi
    const actorIds = followNotifications.map((n: any) => n.actor_id).filter((id: string) => id);
    let actorProfiles: Record<string, any> = {};
    
    console.log('Actor IDs à charger:', actorIds);
    
    if (actorIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', actorIds);
      
      if (profilesError) {
        console.error('Erreur lors du chargement des profils:', profilesError);
      } else {
        console.log('Profils chargés:', profiles?.length || 0, profiles);
        if (profiles && profiles.length > 0) {
          actorProfiles = profiles.reduce((acc: Record<string, any>, profile: any) => {
            acc[profile.id] = profile;
            return acc;
          }, {});
          console.log('Profils mappés:', actorProfiles);
        } else {
          console.warn('Aucun profil trouvé pour les actor_ids:', actorIds);
        }
      }
    } else {
      console.log('Aucun actor_id trouvé dans les notifications');
    }

    // Transformer les notifications de follow
    const followNotifs: Notification[] = followNotifications
      .filter((notif: any) => notif.actor_id) // Filtrer les notifications sans actor_id
      .map((notif: any) => {
        const profile = actorProfiles[notif.actor_id] || {};
        console.log('Transformation notification:', { 
          notif_id: notif.id, 
          actor_id: notif.actor_id, 
          profile_trouve: !!profile.display_name,
          profile 
        });
        
        // Si on n'a pas le profil, on essaie de le charger individuellement
        if (!profile.display_name && notif.actor_id) {
          console.warn('Profil manquant pour actor_id:', notif.actor_id);
        }
        
        return {
          id: notif.id,
          type: 'follow' as const,
          userId: notif.actor_id, // actor_id est garanti d'exister grâce au filter
          user: {
            display_name: profile.display_name || 'Utilisateur inconnu',
            username: profile.username || 'user',
            avatar_url: profile.avatar_url,
          },
          created_at: notif.created_at,
        };
      });

    console.log('Notifications de follow transformées:', followNotifs.length);

    // Combiner et trier toutes les notifications par date
    const allNotifications = [...followNotifs, ...activityNotifications].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    console.log('Total notifications combinées:', allNotifications.length);
    console.log('Notifications de follow:', followNotifs.length);
    console.log('Notifications d\'activité:', activityNotifications.length);
    console.log('Toutes les notifications:', allNotifications);

    setNotifications(allNotifications.slice(0, 20));
    setLoading(false);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'activity':
        return BookOpen;
      case 'follow':
        return Users;
      case 'reaction':
        return Heart;
      default:
        return BookOpen;
    }
  };

  const getNotificationText = (notif: Notification) => {
    if (notif.type === 'activity' && notif.activity) {
      return (
        <>
          <span className="font-semibold">{notif.user.display_name}</span> a lu
          {notif.activity.pages_read && notif.activity.pages_read > 0 && (
            <span className="font-semibold"> {notif.activity.pages_read} pages</span>
          )}
        </>
      );
    }
    if (notif.type === 'follow') {
      return (
        <>
          <span className="font-semibold">{notif.user.display_name}</span> s'est abonné à vous
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold">Notifications</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                console.log('Rafraîchissement des notifications...');
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

        <div className="flex-1 overflow-y-auto min-h-0 p-4">
          {loading ? (
            <div className="text-center py-12 text-text-sub-light">Chargement...</div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 mx-auto mb-4 text-text-sub-light" />
              <p className="text-lg font-medium text-text-main-light mb-2">Aucune notification</p>
              <p className="text-sm text-text-sub-light">
                Vous recevrez des notifications quand quelqu'un s'abonne à vous
              </p>
            </div>
          ) : (
            <div className="space-y-2">
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
                      console.log("CLICK NOTIF userId:", notif.userId, "onUserClick?", !!onUserClick);
                      if (!notif.userId) return;
                      onUserClick?.(notif.userId);
                      setTimeout(() => onClose?.(), 0);
                    }}
                    className="w-full flex items-start gap-3 p-4 rounded-xl hover:bg-stone-50 transition-colors text-left"
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
                      <div className="flex items-start gap-2 mb-1">
                        <Icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-stone-900 flex-1">{getNotificationText(notif)}</p>
                      </div>
                      <div className="flex items-center justify-between">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
