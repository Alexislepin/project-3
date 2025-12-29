/**
 * Notifications Page
 * 
 * Displays all user notifications with:
 * - Pagination
 * - Read/unread status
 * - Navigation to related content
 * - Mark all as read
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Heart, MessageCircle, UserPlus, Target, Flame } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppLayout } from '../components/layout/AppLayout';

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'reminder' | 'goal_achieved' | 'streak';
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  title: string;
  body: string;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
  actor?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

const ITEMS_PER_PAGE = 20;

export function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadNotifications();
      loadUnreadCount();
    }
  }, [user]);

  const loadNotifications = async (page = 0) => {
    if (!user) return;

    try {
      if (page === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          *,
          actor:user_profiles!notifications_actor_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (error) throw error;

      if (page === 0) {
        setNotifications(data || []);
      } else {
        setNotifications((prev) => [...prev, ...(data || [])]);
      }

      setHasMore((data || []).length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadUnreadCount = async () => {
    if (!user) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
        )
      );

      // Update unread count
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );

      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read_at) {
      await markAsRead(notification.id);
    }

    // Navigate based on type
    switch (notification.type) {
      case 'like':
      case 'comment':
        if (notification.target_id) {
          navigate(`/activity/${notification.target_id}`);
        }
        break;

      case 'follow':
        if (notification.actor_id) {
          navigate(`/profile/${notification.actor_id}`);
        }
        break;

      case 'reminder':
      case 'goal_achieved':
        navigate('/home');
        break;

      default:
        navigate('/home');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="w-5 h-5 text-red-500" />;
      case 'comment':
        return <MessageCircle className="w-5 h-5 text-blue-500" />;
      case 'follow':
        return <UserPlus className="w-5 h-5 text-green-500" />;
      case 'reminder':
        return <Target className="w-5 h-5 text-amber-500" />;
      case 'goal_achieved':
        return <Check className="w-5 h-5 text-lime-500" />;
      case 'streak':
        return <Flame className="w-5 h-5 text-orange-500" />;
      default:
        return <Bell className="w-5 h-5 text-stone-500" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  if (loading && notifications.length === 0) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-text-sub-light">Chargement...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-stone-200 bg-white">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900 transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                Tout marquer comme lu
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 py-12">
              <Bell className="w-12 h-12 text-stone-300 mb-4" />
              <p className="text-text-sub-light text-center">
                Aucune notification pour le moment
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full px-4 py-3 text-left hover:bg-stone-50 transition-colors ${
                    !notification.read_at ? 'bg-stone-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {notification.actor?.avatar_url ? (
                        <img
                          src={notification.actor.avatar_url}
                          alt={notification.actor.display_name || notification.actor.username}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center">
                          {getNotificationIcon(notification.type)}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-stone-900 line-clamp-2">
                          {notification.body}
                        </p>
                        {!notification.read_at && (
                          <div className="w-2 h-2 rounded-full bg-lime-500 flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-text-sub-light">
                        {formatTimeAgo(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && !loading && (
            <div className="px-4 py-4 text-center">
              <button
                onClick={() => loadNotifications(Math.floor(notifications.length / ITEMS_PER_PAGE))}
                className="text-sm text-stone-600 hover:text-stone-900 transition-colors"
              >
                Charger plus
              </button>
            </div>
          )}

          {loadingMore && (
            <div className="px-4 py-4 text-center">
              <div className="text-sm text-text-sub-light">Chargement...</div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

