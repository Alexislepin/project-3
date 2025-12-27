import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FeedRow } from '../components/FeedRow';
import { AudienceTabs } from '../components/AudienceTabs';
import { AppHeader } from '../components/AppHeader';
import { UserProfileView } from '../components/UserProfileView';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { groupSocialEvents, filterDiscoverEvents, type GroupedEvent } from '../lib/feedUtils';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';

type FeedFilter = 'all' | 'following' | 'me';

interface SocialFeedProps {
  onClose?: () => void;
}

export function SocialFeed({ onClose }: SocialFeedProps) {
  const [socialEvents, setSocialEvents] = useState<Array<any & { source?: 'following' | 'discover' }>>([]);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [selectedBookInitialTab, setSelectedBookInitialTab] = useState<'summary' | 'comments'>('summary');
  const [selectedBookFocusComment, setSelectedBookFocusComment] = useState(false);
  
  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollContainerRef, setScrollContainerRef] = useState<HTMLDivElement | null>(null);
  
  const { user } = useAuth();

  // Helper function to process events (defined before use)
  const processSocialEvents = async (
    eventsData: any[],
    followingIds: string[],
    defaultSource?: 'following' | 'discover'
  ) => {
    // Fetch actor profiles, book details, and comment previews in parallel
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

    // Combine data with source tagging
    const combinedEvents = eventsData
      .map(event => {
        const actor = profilesMap.get(event.actor_id);
        const book = booksMap.get(event.book_key);
        const commentData = event.comment_id ? commentsMap.get(event.comment_id) : null;
        const commentContent = commentData?.content || null;

        if (!actor || !book) return null; // Skip events with missing data

        // Determine source: use event.source if set, otherwise infer from followingIds
        const source = event.source || (defaultSource || (followingIds.includes(event.actor_id) ? 'following' : 'discover'));

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
          source,
        };
      })
      .filter((event): event is NonNullable<typeof event> => event !== null);

    setSocialEvents(combinedEvents);
    setLoading(false);
  };

  const loadSocialEvents = async () => {
    if (!user) return;

    setLoading(true);

    try {
      // 1) Get following IDs
      const { data: following, error: followingError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      if (followingError) {
        console.error('[loadSocialEvents] Error fetching follows:', followingError);
        setSocialEvents([]);
        setLoading(false);
        return;
      }

      const followingIds = following?.map((f) => f.following_id) || [];

      // 2) Build query based on filter
      if (filter === 'me') {
        if (!user.id) {
          console.error('[loadSocialEvents] user.id is undefined');
          setSocialEvents([]);
          setLoading(false);
          return;
        }
        // Fetch only user's events
        const { data: eventsData, error: eventsError } = await supabase
          .from('activity_events')
          .select('id, actor_id, event_type, book_key, comment_id, created_at')
          .eq('actor_id', user.id)
          .in('event_type', ['book_like', 'book_comment'])
          .order('created_at', { ascending: false })
          .limit(50);

        if (eventsError) {
          console.error('[loadSocialEvents] activity_events error', eventsError);
          setSocialEvents([]);
          setLoading(false);
          return;
        }

        if (!eventsData || eventsData.length === 0) {
          setSocialEvents([]);
          setLoading(false);
          return;
        }

        await processSocialEvents(eventsData, []);
        return;
      }

      if (filter === 'following') {
        if (followingIds.length === 0) {
          setSocialEvents([]);
          setLoading(false);
          return;
        }

        // Fetch only following events
        const { data: eventsData, error: eventsError } = await supabase
          .from('activity_events')
          .select('id, actor_id, event_type, book_key, comment_id, created_at')
          .in('actor_id', followingIds)
          .in('event_type', ['book_like', 'book_comment'])
          .order('created_at', { ascending: false })
          .limit(50);

        if (eventsError) {
          console.error('[loadSocialEvents] activity_events error', eventsError);
          setSocialEvents([]);
          setLoading(false);
          return;
        }

        if (!eventsData || eventsData.length === 0) {
          setSocialEvents([]);
          setLoading(false);
          return;
        }

        await processSocialEvents(eventsData, followingIds, 'following');
        return;
      }

      // filter === 'all': Curated mix
      // A) Following feed (priority 1)
      const followingEventsPromise = followingIds.length > 0
        ? supabase
            .from('activity_events')
            .select('id, actor_id, event_type, book_key, comment_id, created_at')
            .in('actor_id', followingIds)
            .in('event_type', ['book_like', 'book_comment'])
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [], error: null });

      // B) Trending public feed (priority 2) - Comments only, limit 5
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
      const trendingEventsPromise = supabase
        .from('activity_events')
        .select('id, actor_id, event_type, book_key, comment_id, created_at')
        .eq('event_type', 'book_comment')
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      const [followingResult, trendingResult] = await Promise.all([
        followingEventsPromise,
        trendingEventsPromise,
      ]);

      if (followingResult.error) {
        console.error('[loadSocialEvents] Following events error:', followingResult.error);
      }
      if (trendingResult.error) {
        console.error('[loadSocialEvents] Trending events error:', trendingResult.error);
      }

      const followingEvents = followingResult.data || [];
      const trendingEvents = trendingResult.data || [];

      // Merge, dedupe, and tag
      const eventsMap = new Map<string, any & { source: 'following' | 'discover' }>();

      // Add following events first (priority)
      followingEvents.forEach(event => {
        if (!eventsMap.has(event.id)) {
          eventsMap.set(event.id, { ...event, source: 'following' as const });
        }
      });

      // Add trending events (only if not already in following)
      trendingEvents.forEach(event => {
        if (eventsMap.has(event.id)) return;
        eventsMap.set(event.id, { ...event, source: 'discover' as const });
      });

      // Convert to array and sort by created_at desc
      const mergedEvents = Array.from(eventsMap.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (mergedEvents.length === 0) {
        setSocialEvents([]);
        setLoading(false);
        return;
      }

      await processSocialEvents(mergedEvents, followingIds);
    } catch (error) {
      console.error('Error loading social events:', error);
      setSocialEvents([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadSocialEvents();
  }, [filter, user?.id]);

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

  // Process and group social events
  const processedSocialEvents = useMemo(() => {
    if (socialEvents.length === 0) return { following: [], discover: [] };

    const followingEvents = socialEvents.filter(e => e.source === 'following');
    const discoverEvents = socialEvents.filter(e => e.source === 'discover');

    // Group likes in following events
    const groupedFollowing = groupSocialEvents(followingEvents);
    
    // Filter discover to comments only and limit to 5
    const filteredDiscover = filterDiscoverEvents(discoverEvents);

    return {
      following: groupedFollowing,
      discover: filteredDiscover,
    };
  }, [socialEvents]);

  const handleEventClick = (event: GroupedEvent) => {
    const bookObj = {
      id: event.book?.book_key || '',
      title: event.book?.title || 'Titre inconnu',
      author: event.book?.author || 'Auteur inconnu',
      cover_url: event.book?.cover_url || null,
      thumbnail: event.book?.cover_url || null,
    };
    setSelectedBook(bookObj);
    setSelectedBookInitialTab(event.event_type === 'book_comment' ? 'comments' : 'summary');
    setSelectedBookFocusComment(event.event_type === 'book_comment');
  };

  // Pull-to-refresh handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadSocialEvents();
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef) return;
    const scrollTop = scrollContainerRef.scrollTop;
    if (scrollTop === 0) {
      setIsPulling(true);
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !scrollContainerRef) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    if (deltaY > 0) {
      const clamped = Math.min(deltaY, 90);
      setPullDistance(clamped);
      if (deltaY > 0 && scrollContainerRef.scrollTop === 0 && e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance >= 60) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
    setStartY(0);
  };

  return (
    <div className="h-screen max-w-2xl mx-auto bg-background-light overflow-hidden">
      {/* Fixed Header - now truly fixed via AppHeader component */}
      <AppHeader 
        title="Social"
        showBack={true}
        onBack={onClose || (() => window.location.href = '/home')}
      />
      
      {/* Fixed Tabs section (below header) */}
      <div 
        className="fixed left-0 right-0 z-40"
        style={{
          top: 'calc(56px + env(safe-area-inset-top))', // Below AppHeader
        }}
      >
        <div className="max-w-2xl mx-auto">
          <AudienceTabs filter={filter} onFilterChange={setFilter} />
        </div>
      </div>

      {/* Scrollable Feed Content with Pull-to-Refresh */}
      <div
        ref={(el) => setScrollContainerRef(el)}
        className="h-full overflow-y-auto relative"
        style={{
          paddingTop: 'calc(106px + env(safe-area-inset-top))', // Header (56px) + Tabs section (~50px)
          paddingBottom: `calc(${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y', // Allow vertical panning only
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {pullDistance > 0 && (
          <div
            className="absolute top-0 left-0 right-0 flex items-end justify-center bg-background-light"
            style={{ height: `${pullDistance}px`, transform: `translateY(-${pullDistance}px)` }}
          >
            <span className="text-xs text-stone-500 pb-2">
              {isRefreshing
                ? 'Actualisation…'
                : pullDistance >= 60
                ? 'Relâche pour actualiser'
                : 'Tire pour actualiser'}
            </span>
          </div>
        )}

        <div 
          className="p-4" 
          style={{ 
            transform: `translateY(${pullDistance}px)`,
            paddingBottom: 'calc(96px + env(safe-area-inset-bottom))',
          }}
        >
          {loading ? (
            <div className="text-center py-12 text-stone-500">Chargement...</div>
          ) : (
            <>
              {filter === 'all' ? (
                <>
                  {/* Following section */}
                  {processedSocialEvents.following.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 px-1">
                        Abonnements
                      </h3>
                      <div className="space-y-2">
                        {processedSocialEvents.following.map((event) => (
                          <FeedRow
                            key={event.id}
                            event={event}
                            onActorClick={(actorId) => setSelectedUserId(actorId)}
                            onBookClick={() => handleEventClick(event)}
                            formatTimeAgo={formatTimeAgo}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Discover section */}
                  {processedSocialEvents.discover.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 px-1 flex items-center gap-2">
                        <span>Découvrir</span>
                        <span className="text-[10px] font-normal text-stone-400">• Contenu populaire</span>
                      </h3>
                      <div className="space-y-2">
                        {processedSocialEvents.discover.map((event) => (
                          <FeedRow
                            key={event.id}
                            event={event}
                            onActorClick={(actorId) => setSelectedUserId(actorId)}
                            onBookClick={() => handleEventClick(event)}
                            formatTimeAgo={formatTimeAgo}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                (() => {
                  const eventsToShow = filter === 'following' 
                    ? processedSocialEvents.following 
                    : socialEvents.filter(e => e.source !== 'discover');
                  const grouped = groupSocialEvents(eventsToShow);
                  
                  if (grouped.length > 0) {
                    return (
                      <div className="space-y-2">
                        {grouped.map((event) => (
                          <FeedRow
                            key={event.id}
                            event={event}
                            onActorClick={(actorId) => setSelectedUserId(actorId)}
                            onBookClick={() => handleEventClick(event)}
                            formatTimeAgo={formatTimeAgo}
                          />
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()
              )}

              {/* Empty state */}
              {!loading && 
                processedSocialEvents.following.length === 0 && 
                processedSocialEvents.discover.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-stone-600 mb-2">Aucune activité sociale</p>
                  <p className="text-sm text-stone-500">
                    {filter === 'following'
                      ? 'Suivez des utilisateurs pour voir leurs activités'
                      : filter === 'me'
                      ? 'Vos likes et commentaires apparaîtront ici'
                      : 'Suivez des utilisateurs pour voir leurs activités dans votre fil'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
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

      {selectedUserId && (
        <div className="fixed inset-0 bg-background-light z-[200] overflow-y-auto">
          <UserProfileView
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
            onUserClick={(id) => setSelectedUserId(id)}
          />
        </div>
      )}
    </div>
  );
}

