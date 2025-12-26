import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ActivityCard } from '../components/ActivityCard';
import { CommentModal } from '../components/CommentModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { SearchUsersModal } from '../components/SearchUsersModal';
import { UserProfileView } from '../components/UserProfileView';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { Flame, Bell, UserPlus, Heart, MessageCircle } from 'lucide-react';
import { BookCover } from '../components/BookCover';
import { useSwipeTabs } from '../lib/useSwipeTabs';
import { AppHeader } from '../components/AppHeader';

type FeedFilter = 'all' | 'following' | 'me';

export function Home() {
  const [activities, setActivities] = useState<any[]>([]);
  const [socialEvents, setSocialEvents] = useState<any[]>([]);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [commentingActivityId, setCommentingActivityId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearchUsers, setShowSearchUsers] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [selectedBookInitialTab, setSelectedBookInitialTab] = useState<'summary' | 'comments'>('summary');
  const [selectedBookFocusComment, setSelectedBookFocusComment] = useState(false);
  const { user } = useAuth();

  // Swipe horizontal entre tabs
  const feedTabs = ['all', 'following', 'me'] as FeedFilter[];
  useSwipeTabs({
    tabs: feedTabs,
    currentTab: filter,
    onTabChange: (tab) => setFilter(tab as FeedFilter),
    threshold: 35,
    verticalThreshold: 1.2,
  });

  useEffect(() => {
    loadActivities();
    loadSocialEvents();
    loadStreak();
    loadUnreadNotificationsCount();

    const interval = setInterval(() => {
      loadUnreadNotificationsCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [filter, user]);

  const loadUnreadNotificationsCount = async () => {
    if (!user) return;

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);

    setUnreadNotificationsCount(count || 0);
  };

  const loadActivities = async () => {
    if (!user) return;

    setLoading(true);

    const { data: following, error: followsError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (followsError) {
      console.error('=== FOLLOWS ERROR (Home) ===');
      console.error('Full error:', followsError);
      console.error('Message:', followsError.message);
      console.error('Details:', followsError.details);
      console.error('Hint:', followsError.hint);
      console.error('Code:', followsError.code);
      console.error('Query:', `follows?select=following_id&follower_id=eq.${user.id}`);
    }

    const followingIds = following?.map((f) => f.following_id) || [];

    let query = supabase
      .from('activities')
      .select(`
        *,
        user_profiles!activities_user_id_fkey(username, display_name, avatar_url),
        books(title, author, cover_url)
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (filter === 'me') {
      query = query.eq('user_id', user.id);
    } else if (filter === 'following') {
      if (followingIds.length > 0) {
        query = query.in('user_id', followingIds).or(`visibility.eq.public,and(visibility.eq.followers,user_id.in.(${followingIds.join(',')}))`);
      } else {
        setActivities([]);
        setLoading(false);
        return;
      }
    } else {
      query = query.or(`visibility.eq.public,user_id.eq.${user.id},and(visibility.eq.followers,user_id.in.(${followingIds.join(',')}))`);
    }

    const { data } = await query;

    if (data) {
      const activitiesWithReactions = await Promise.all(
        data.map(async (activity) => {
          const { count: reactionsCount } = await supabase
            .from('activity_reactions')
            .select('*', { count: 'exact', head: true })
            .eq('activity_id', activity.id);

          const { count: commentsCount } = await supabase
            .from('activity_comments')
            .select('*', { count: 'exact', head: true })
            .eq('activity_id', activity.id);

          const { data: userReaction } = await supabase
            .from('activity_reactions')
            .select('id')
            .eq('activity_id', activity.id)
            .eq('user_id', user.id)
            .maybeSingle();

          return {
            id: activity.id,
            user: activity.user_profiles,
            type: activity.type,
            title: activity.title,
            pages_read: activity.pages_read,
            duration_minutes: activity.duration_minutes,
            notes: activity.notes,
            quotes: activity.quotes || [],
            book: activity.books,
            created_at: activity.created_at,
            reactions_count: reactionsCount || 0,
            comments_count: commentsCount || 0,
            user_has_reacted: !!userReaction,
          };
        })
      );

      setActivities(activitiesWithReactions);
    }

    setLoading(false);
  };

  const loadSocialEvents = async () => {
    if (!user) return;

    try {
      // 1) Get following IDs
      const { data: following, error: followingError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      if (followingError) {
        console.error('[loadSocialEvents] Error fetching follows:', followingError);
        setSocialEvents([]);
        return;
      }

      const followingIds = following?.map((f) => f.following_id) || [];

      // 2) Build query based on filter
      let actorIds: string[] = [];
      if (filter === 'me') {
        if (!user.id) {
          console.error('[loadSocialEvents] user.id is undefined');
          setSocialEvents([]);
          return;
        }
        actorIds = [user.id];
      } else if (filter === 'following') {
        actorIds = followingIds.length > 0 ? followingIds : [];
      } else {
        // 'all': show all events (no filter on actor_user_id)
        actorIds = [];
      }

      // Guard: if filter is 'following' or 'me' and actorIds is empty, return early
      if ((filter === 'following' || filter === 'me') && actorIds.length === 0) {
        setSocialEvents([]);
        return;
      }

      // 3) Fetch events from activity_events
      let query = supabase
        .from('activity_events')
        .select('id, actor_id, event_type, book_key, comment_id, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      // Guard: only apply .in() if actorIds is not empty
      if (filter !== 'all' && actorIds.length > 0) {
        query = query.in('actor_id', actorIds);
      }

      const { data: eventsData, error: eventsError } = await query;

      if (eventsError) {
        console.error('[loadSocialEvents] activity_events error', {
          error: eventsError,
          message: eventsError.message,
          details: (eventsError as any).details,
          hint: (eventsError as any).hint,
          code: (eventsError as any).code,
          filter,
          actorIds,
          actorIdsLength: actorIds.length,
        });
        setSocialEvents([]);
        return;
      }

      if (!eventsData || eventsData.length === 0) {
        setSocialEvents([]);
        return;
      }

      // 4) Fetch actor profiles, book details, and comment previews in parallel
      const actorUserIds = [...new Set(eventsData.map(e => e.actor_id))]
        .filter((id): id is string => !!id);
      const bookKeys = [...new Set(eventsData.map(e => e.book_key))].filter(key => !!key);
      const commentIds = eventsData
        .filter(e => e.comment_id)
        .map(e => e.comment_id)
        .filter((id): id is string => !!id);

      // Guards: don't query if arrays are empty
      const [profilesResult, booksResult, commentsResult] = await Promise.all([
        actorUserIds.length > 0
          ? supabase
              .from('user_profiles')
              .select('id, display_name, avatar_url')
              .in('id', actorUserIds)
          : Promise.resolve({ data: [], error: null }),
        bookKeys.length > 0
          ? supabase
              .from('books_cache')
              .select('book_key, title, author, cover_url')
              .in('book_key', bookKeys)
          : Promise.resolve({ data: [], error: null }),
        commentIds.length > 0
          ? supabase
              .from('book_comments')
              .select('id, content, created_at')
              .in('id', commentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Handle errors from parallel queries
      if (profilesResult.error) {
        console.error('[loadSocialEvents] Error fetching profiles:', profilesResult.error);
      }
      if (booksResult.error) {
        console.error('[loadSocialEvents] Error fetching books_cache:', booksResult.error);
      }
      if (commentsResult.error) {
        console.error('[loadSocialEvents] Error fetching comments:', commentsResult.error);
      }

      const profilesMap = new Map((profilesResult.data || []).map(p => [p.id, p]));
      const booksMap = new Map((booksResult.data || []).map(b => [b.book_key, b]));
      const commentsMap = new Map((commentsResult.data || []).map(c => [c.id, { content: c.content, created_at: c.created_at }]));

      // 5) Combine data
      const combinedEvents = eventsData
        .map(event => {
          const actor = profilesMap.get(event.actor_id);
          const book = booksMap.get(event.book_key);
          const commentData = event.comment_id ? commentsMap.get(event.comment_id) : null;
          const commentContent = commentData?.content || null;

          if (!actor || !book) return null; // Skip events with missing data

          return {
            id: event.id,
            actor,
            event_type: event.event_type,
            book: {
              book_key: event.book_key,
              title: book.title,
              author: book.author,
              cover_url: book.cover_url,
            },
            comment_content: commentContent,
            comment_id: event.comment_id,
            created_at: event.created_at,
          };
        })
        .filter((event): event is NonNullable<typeof event> => event !== null);

      setSocialEvents(combinedEvents);
    } catch (error) {
      console.error('Error loading social events:', error);
      setSocialEvents([]);
    }
  };

  const formatTimeAgo = (dateString: string) => {
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

  const loadStreak = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('current_streak')
      .eq('id', user.id)
      .single();

    if (data) {
      setStreak(data.current_streak);
    }
  };

  const handleReact = async (activityId: string) => {
    if (!user) return;

    const activity = activities.find((a) => a.id === activityId);
    if (!activity) return;

    if (activity.user_has_reacted) {
      await supabase
        .from('activity_reactions')
        .delete()
        .eq('activity_id', activityId)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('activity_reactions')
        .insert({ activity_id: activityId, user_id: user.id, type: 'like' });
    }

    loadActivities();
  };

  const handleComment = (activityId: string) => {
    setCommentingActivityId(activityId);
  };

  const handleCloseComments = () => {
    setCommentingActivityId(null);
    loadActivities();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <AppHeader
        title="Fil d'actualité"
        rightActions={
          <>
            {streak > 0 && (
              <div className="flex items-center gap-1 bg-lime-400 px-2 py-1 rounded-full">
                <Flame className="w-3.5 h-3.5 text-stone-900" />
                <span className="font-semibold text-xs text-stone-900">{streak}</span>
              </div>
            )}
            <button
              onClick={() => setShowSearchUsers(true)}
              className="p-1.5 hover:bg-black/5 rounded-full transition-colors"
              title="Ajouter des amis"
            >
              <UserPlus className="w-4 h-4 text-text-sub-light" />
            </button>
            <button
              onClick={() => setShowNotifications(true)}
              className="p-1.5 hover:bg-black/5 rounded-full transition-colors relative"
              title="Notifications"
            >
              <Bell className="w-4 h-4 text-text-sub-light" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>
          </>
        }
      />
      
      {/* Chips séparés sous le header */}
      <div className="px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              filter === 'all'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilter('following')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              filter === 'following'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Abonnements
          </button>
          <button
            onClick={() => setFilter('me')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              filter === 'me'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200'
            }`}
          >
            Moi
          </button>
        </div>
      </div>

      <div className="p-4 no-scrollbar">
        {loading ? (
          <div className="text-center py-12 text-stone-500">Chargement des activités...</div>
        ) : (
          <>
            {/* Social Events Feed (Likes/Comments) */}
            {socialEvents.length > 0 && (
              <div className="mb-6 space-y-3">
                {socialEvents.map((event) => {
                  const actorName = event.actor?.display_name || event.actor?.username || 'Utilisateur';

                  return (
                    <div
                      key={event.id}
                      onClick={() => {
                        // Create minimal book object for modal
                        const bookObj = {
                          id: event.book_key,
                          title: event.book?.title || 'Titre inconnu',
                          author: event.book?.author || 'Auteur inconnu',
                          cover_url: event.book?.cover_url || null,
                          thumbnail: event.book?.cover_url || null,
                        };
                        setSelectedBook(bookObj);
                        setSelectedBookInitialTab(event.event_type === 'book_comment' ? 'comments' : 'summary');
                        setSelectedBookFocusComment(event.event_type === 'book_comment');
                      }}
                      className="flex items-center gap-3 p-3 bg-white rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer"
                    >
                      {/* Avatar */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation(); // empêche l'ouverture du livre
                          setSelectedUserId(event.actor.id); // ouvre le profil
                        }}
                        className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden shrink-0 hover:ring-2 hover:ring-primary transition"
                      >
                        {event.actor?.avatar_url ? (
                          <img
                            src={event.actor.avatar_url}
                            alt={actorName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-stone-600">
                            {actorName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </button>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-1">
                          {event.event_type === 'book_like' ? (
                            <Heart className="w-4 h-4 text-red-500 fill-current shrink-0 mt-0.5" />
                          ) : (
                            <MessageCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-900">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedUserId(event.actor.id);
                                }}
                                className="font-semibold hover:underline"
                              >
                                {actorName}
                              </button>{' '}
                              {event.event_type === 'book_like' ? 'a aimé' : 'a commenté'}{' '}
                              <span className="font-semibold">
                                {event.book?.title || 'ce livre'}
                              </span>
                            </p>
                            {event.event_type === 'book_comment' && (
                              <p className="text-xs text-stone-700 mt-1 line-clamp-2">
                                {event.comment_content && event.comment_content.trim() ? (
                                  <span className="font-normal">"{event.comment_content}"</span>
                                ) : (
                                  <span className="text-stone-500 italic">Commentaire supprimé</span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-stone-500 mt-1 ml-6">
                          {formatTimeAgo(event.created_at)}
                        </p>
                      </div>

                      {/* Book Cover */}
                      {event.book?.cover_url && (
                        <div className="w-12 h-16 shrink-0 rounded overflow-hidden">
                          <BookCover
                            coverUrl={event.book.cover_url}
                            title={event.book.title || ''}
                            author={event.book.author || ''}
                            className="w-full h-full"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state for social events */}
            {!loading && socialEvents.length === 0 && filter === 'following' && (
              <div className="text-center py-8 mb-6 bg-white rounded-xl border border-stone-200">
                <p className="text-stone-600 mb-2">Suis des personnes pour voir leurs activités</p>
                <button
                  onClick={() => setShowSearchUsers(true)}
                  className="text-sm text-primary font-semibold hover:underline"
                >
                  Explorer les profils
                </button>
              </div>
            )}

            {/* Regular Activities Feed */}
            {activities.length === 0 && socialEvents.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-stone-600 mb-2">Aucune activité pour le moment</p>
                <p className="text-sm text-stone-500">
                  {filter === 'following'
                    ? 'Suivez des utilisateurs pour voir leurs activités'
                    : 'Commencez à enregistrer vos activités pour construire votre fil'}
                </p>
              </div>
            ) : (
              activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onReact={() => handleReact(activity.id)}
                  onComment={() => handleComment(activity.id)}
                />
              ))
            )}
          </>
        )}
      </div>

      {selectedBook && (
        <BookDetailsModal
          book={selectedBook}
          onClose={() => {
            setSelectedBook(null);
            setSelectedBookInitialTab('summary');
            setSelectedBookFocusComment(false);
          }}
          initialTab={selectedBookInitialTab}
          focusComment={selectedBookFocusComment}
        />
      )}

      {commentingActivityId && (
        <CommentModal
          activityId={commentingActivityId}
          onClose={handleCloseComments}
        />
      )}

      {showNotifications && (
        <NotificationsModal 
          onClose={() => {
            setShowNotifications(false);
            loadUnreadNotificationsCount();
          }}
          onUserClick={(id) => {
            setSelectedUserId(id);
            setShowNotifications(false);
          }}
        />
      )}

      {selectedUserId && (
        <div className="fixed inset-0 bg-background-light z-[200] overflow-y-auto">
          <UserProfileView
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
            onUserClick={(id) => setSelectedUserId(id)}
          />
        </div>
      )}

      {showSearchUsers && (
        <SearchUsersModal 
          onClose={() => setShowSearchUsers(false)}
          onUserClick={(userId) => {
            setSelectedUserId(userId);
            setShowSearchUsers(false);
          }}
        />
      )}
    </div>
  );
}
