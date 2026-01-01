import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FeedRow } from '../components/FeedRow';
import { FeedRowActivity } from '../components/FeedRowActivity';
import { SocialTabs, type SocialTab } from '../components/SocialTabs';
import { AppHeader } from '../components/AppHeader';
import { UserProfileView } from '../components/UserProfileView';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { groupSocialEvents, type GroupedEvent } from '../lib/feedUtils';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';

interface SocialFeedProps {
  onClose?: () => void;
}

interface BookEvent {
  id: string;
  actor: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
  event_type: 'book_like' | 'book_comment';
  book: {
    book_key: string;
    title: string;
    author?: string;
    cover_url?: string;
  };
  comment_content?: string | null;
  created_at: string;
  groupedLikes?: {
    actors: Array<{ id: string; display_name?: string; username?: string; avatar_url?: string }>;
    count: number;
  };
}

interface ActivityEvent {
  id: string;
  actor: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
  owner: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
  event_type: 'activity_like' | 'activity_comment';
  activity: {
    id: string;
    type: 'reading' | 'workout' | 'learning' | 'habit';
    title: string;
    pages_read?: number;
    duration_minutes?: number;
    created_at: string;
  };
  comment_content?: string | null;
  created_at: string;
}

export function SocialFeed({ onClose }: SocialFeedProps) {
  const [tab, setTab] = useState<SocialTab>('books');
  const [eventsBooks, setEventsBooks] = useState<BookEvent[]>([]);
  const [eventsActivities, setEventsActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const [selectedBookInitialTab, setSelectedBookInitialTab] = useState<'summary' | 'comments'>('summary');
  const [selectedBookFocusComment, setSelectedBookFocusComment] = useState(false);
  
  // Cache to avoid reloading when switching tabs
  const booksCacheRef = useRef<BookEvent[] | null>(null);
  const activitiesCacheRef = useRef<ActivityEvent[] | null>(null);
  const followingIdsRef = useRef<string[]>([]);
  
  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollContainerRef, setScrollContainerRef] = useState<HTMLDivElement | null>(null);
  
  // Dynamic header/tabs height measurement
  const headerRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [topOffset, setTopOffset] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  
  const { user } = useAuth();

  // Fetch following IDs (cached)
  const fetchFollowingIds = async (): Promise<string[]> => {
    if (!user) return [];
    
    if (followingIdsRef.current.length > 0) {
      return followingIdsRef.current;
    }

    const { data: following, error } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    if (error) {
      console.error('[SocialFeed] Error fetching follows:', error);
      return [];
    }

    const ids = following?.map((f) => f.following_id) || [];
    followingIdsRef.current = ids;
    return ids;
  };

  // Fetch books feed (book_like, book_comment)
  const fetchBooksFeed = async (_followingIds: string[]) => {
    if (booksCacheRef.current) {
      setEventsBooks(booksCacheRef.current);
      setLoading(false);
      return;
    }

    try {
      // Fetch all book events (not just from following)
      const { data: eventsData, error: eventsError } = await supabase
        .from('activity_events')
        .select('id, actor_id, event_type, book_key, comment_id, created_at')
        .in('event_type', ['book_like', 'book_comment'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) {
        console.error('[SocialFeed] activity_events error', eventsError);
        setEventsBooks([]);
        setLoading(false);
        return;
      }

      if (!eventsData || eventsData.length === 0) {
        setEventsBooks([]);
        setLoading(false);
        return;
      }

      // Enrich events with profiles, books, and comments
      const actorUserIds = [...new Set(eventsData.map(e => e.actor_id))].filter((id): id is string => !!id);
      const bookKeys = [...new Set(eventsData.map(e => e.book_key))].filter(key => !!key);
      const commentIds = eventsData
        .filter(e => e.comment_id)
        .map(e => e.comment_id)
        .filter((id): id is string => !!id);

      const [profilesResult, booksResult, commentsResult] = await Promise.all([
        actorUserIds.length > 0
          ? supabase
              .from('user_profiles')
              .select('id, display_name, username, avatar_url')
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

      if (profilesResult.error) {
        console.error('[SocialFeed] Error fetching profiles:', profilesResult.error);
      }
      if (booksResult.error) {
        console.error('[SocialFeed] Error fetching books_cache:', booksResult.error);
      }
      if (commentsResult.error) {
        console.error('[SocialFeed] Error fetching comments:', commentsResult.error);
      }

      const profilesMap = new Map((profilesResult.data || []).map(p => [p.id, p]));
      const booksMap = new Map((booksResult.data || []).map(b => [b.book_key, b]));
      const commentsMap = new Map((commentsResult.data || []).map(c => [c.id, c.content]));

      const enrichedEvents: BookEvent[] = eventsData
        .map(event => {
          const actor = profilesMap.get(event.actor_id);
          const book = booksMap.get(event.book_key);
          const commentContent = event.comment_id ? commentsMap.get(event.comment_id) || null : null;

          if (!actor || !book) return null;

          return {
            id: event.id,
            actor: {
              id: actor.id,
              display_name: actor.display_name || undefined,
              username: actor.username || undefined,
              avatar_url: actor.avatar_url || undefined,
            },
            event_type: event.event_type as 'book_like' | 'book_comment',
            book: {
              book_key: event.book_key,
              title: book.title,
              author: book.author,
              cover_url: book.cover_url,
            },
            comment_content: commentContent,
            created_at: event.created_at,
          };
        })
        .filter((event) => event !== null) as BookEvent[];

      // Group likes
      const grouped = groupSocialEvents(enrichedEvents as any);
      booksCacheRef.current = grouped as BookEvent[];
      setEventsBooks(grouped as BookEvent[]);
      setLoading(false);
    } catch (error) {
      console.error('[SocialFeed] Error fetching books feed:', error);
      setEventsBooks([]);
      setLoading(false);
    }
  };

  // Fetch activities feed (activity_like, activity_comment)
  const fetchActivitiesFeed = async (followingIds: string[]) => {
    if (activitiesCacheRef.current) {
      setEventsActivities(activitiesCacheRef.current);
      setLoading(false);
      return;
    }

    if (followingIds.length === 0) {
      setEventsActivities([]);
      setLoading(false);
      return;
    }

    try {
      // Check if activity_events has activity_id column (it doesn't in current schema)
      // So we use activity_reactions and activity_comments directly
      
      // Fetch reactions (likes)
      const { data: reactionsData, error: reactionsError } = await supabase
        .from('activity_reactions')
        .select('id, activity_id, user_id, created_at')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('activity_comments')
        .select('id, activity_id, user_id, content, created_at')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(50);

      if (reactionsError) {
        console.warn('[SocialFeed] activity_reactions error (schema may not support activity events):', reactionsError);
      }
      if (commentsError) {
        console.warn('[SocialFeed] activity_comments error (schema may not support activity events):', commentsError);
      }

      // If both queries fail, show empty state
      if (reactionsError && commentsError) {
        console.warn('[SocialFeed] Activity events not available - schema may need activity_id in activity_events');
        setEventsActivities([]);
        setLoading(false);
        return;
      }

      const reactions = reactionsData || [];
      const comments = commentsData || [];

      // Get unique activity IDs
      const activityIds = [...new Set([
        ...reactions.map(r => r.activity_id),
        ...comments.map(c => c.activity_id),
      ])].filter((id): id is string => !!id);

      if (activityIds.length === 0) {
        setEventsActivities([]);
        setLoading(false);
        return;
      }

      // Get all unique user IDs (actors and owners)
      const allUserIds = [...new Set([
        ...reactions.map(r => r.user_id),
        ...comments.map(c => c.user_id),
      ])].filter((id): id is string => !!id);

      // Fetch activities (only public ones) and all user profiles
      const [activitiesResult, actorsResult] = await Promise.all([
        supabase
          .from('activities')
          .select('id, type, title, pages_read, duration_minutes, created_at, user_id, visibility')
          .in('id', activityIds)
          .eq('visibility', 'public'), // Only show public activities
        allUserIds.length > 0
          ? supabase
              .from('user_profiles')
              .select('id, display_name, username, avatar_url')
              .in('id', allUserIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (activitiesResult.error) {
        console.error('[SocialFeed] Error fetching activities:', activitiesResult.error);
        setEventsActivities([]);
        setLoading(false);
        return;
      }

      if (actorsResult.error) {
        console.error('[SocialFeed] Error fetching actors:', actorsResult.error);
      }

      const activitiesMap = new Map((activitiesResult.data || []).map(a => [a.id, a]));

      // Get owner user IDs from activities
      const ownerUserIds = [...new Set((activitiesResult.data || []).map(a => a.user_id))].filter((id): id is string => !!id);
      
      // Fetch owner profiles (may overlap with actors, but we'll merge)
      const { data: ownersData, error: ownersError } = ownerUserIds.length > 0
        ? await supabase
            .from('user_profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', ownerUserIds)
        : { data: [], error: null };

      if (ownersError) {
        console.error('[SocialFeed] Error fetching owners:', ownersError);
      }

      // Merge actors and owners into a single map
      const allProfilesMap = new Map<string, any>();
      (actorsResult.data || []).forEach(p => allProfilesMap.set(p.id, p));
      (ownersData || []).forEach(p => allProfilesMap.set(p.id, p));

      // Combine reactions and comments into events
      const events: ActivityEvent[] = [];

      // Add reactions as activity_like events
      reactions.forEach(reaction => {
        const activity = activitiesMap.get(reaction.activity_id);
        const actor = allProfilesMap.get(reaction.user_id);
        const owner = activity ? allProfilesMap.get(activity.user_id) : null;
        if (activity && actor && owner) {
          events.push({
            id: reaction.id,
            actor,
            owner,
            event_type: 'activity_like',
            activity: {
              id: activity.id,
              type: activity.type as 'reading' | 'workout' | 'learning' | 'habit',
              title: activity.title,
              pages_read: activity.pages_read || undefined,
              duration_minutes: activity.duration_minutes || undefined,
              created_at: activity.created_at,
            },
            created_at: reaction.created_at,
          });
        }
      });

      // Add comments as activity_comment events
      comments.forEach(comment => {
        const activity = activitiesMap.get(comment.activity_id);
        const actor = allProfilesMap.get(comment.user_id);
        const owner = activity ? allProfilesMap.get(activity.user_id) : null;
        if (activity && actor && owner) {
          events.push({
            id: comment.id,
            actor,
            owner,
            event_type: 'activity_comment',
            activity: {
              id: activity.id,
              type: activity.type as 'reading' | 'workout' | 'learning' | 'habit',
              title: activity.title,
              pages_read: activity.pages_read || undefined,
              duration_minutes: activity.duration_minutes || undefined,
              created_at: activity.created_at,
            },
            comment_content: comment.content,
            created_at: comment.created_at,
          });
        }
      });

      // Sort by created_at desc
      events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      activitiesCacheRef.current = events;
      setEventsActivities(events);
      setLoading(false);
    } catch (error) {
      console.error('[SocialFeed] Error fetching activities feed:', error);
      setEventsActivities([]);
      setLoading(false);
    }
  };

  // Load data based on current tab
  const loadData = async () => {
    if (!user) return;
    
    setLoading(true);
    const followingIds = await fetchFollowingIds();
    
    if (tab === 'books') {
      await fetchBooksFeed(followingIds);
    } else {
      await fetchActivitiesFeed(followingIds);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [tab, user?.id]);

  // Measure header and tabs height dynamically
  useLayoutEffect(() => {
    const compute = () => {
      // Get the actual AppHeader element (first child of headerRef)
      const headerElement = headerRef.current?.querySelector('[class*="sticky"]') as HTMLElement;
      const h = headerElement?.offsetHeight ?? headerRef.current?.offsetHeight ?? 0;
      const t = tabsRef.current?.offsetHeight ?? 0;
      
      // The header is sticky (in flow), tabs are fixed (out of flow)
      // So paddingTop should be: header height + tabs height
      // But we need to measure the tabs container, not just the inner div
      const tabsContainer = tabsRef.current;
      const tabsInner = tabsContainer?.querySelector('[class*="max-w-2xl"]') as HTMLElement;
      const tabsActualHeight = tabsContainer?.offsetHeight ?? t;
      
      console.log('[SocialFeed] Height calculation:', { 
        header: h, 
        tabsContainer: tabsContainer?.offsetHeight,
        tabsInner: tabsInner?.offsetHeight,
        tabs: tabsActualHeight, 
        total: h + tabsActualHeight 
      });
      
      setHeaderHeight(h);
      setTopOffset(h + tabsActualHeight);
    };
    
    // Initial computation - use requestAnimationFrame to ensure DOM is rendered
    requestAnimationFrame(() => {
      compute();
      
      // Also compute after a small delay to catch any late renders
      setTimeout(compute, 100);
    });

    // Observe resize of header and tabs
    const ro = new ResizeObserver(() => {
      compute();
    });
    
    if (headerRef.current) ro.observe(headerRef.current);
    if (tabsRef.current) ro.observe(tabsRef.current);

    // Also listen to window resize
    window.addEventListener('resize', compute);
    
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

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

  const handleBookEventClick = (event: BookEvent | GroupedEvent) => {
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

  const handleActivityClick = (activityId: string) => {
    window.location.href = `/activity/${activityId}`;
  };

  // Pull-to-refresh handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Clear cache to force reload
    if (tab === 'books') {
      booksCacheRef.current = null;
    } else {
      activitiesCacheRef.current = null;
    }
    followingIdsRef.current = [];
    try {
      await loadData();
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

  const currentEvents = tab === 'books' ? eventsBooks : eventsActivities;
  const isEmpty = !loading && currentEvents.length === 0;

  return (
    <div className="h-screen max-w-2xl mx-auto bg-background-light overflow-hidden">
      {/* Fixed Header */}
      <div ref={headerRef} className="relative">
        <AppHeader 
          title="Social"
          showBack={true}
          onBack={onClose || (() => window.location.href = '/home')}
        />
      </div>
      
      {/* Fixed Tabs section (below header) */}
      <div 
        ref={tabsRef}
        className="fixed left-0 right-0 z-40"
        style={{
          top: `${headerHeight}px`, // Dynamically positioned below AppHeader
        }}
      >
        <div className="max-w-2xl mx-auto">
          <SocialTabs tab={tab} onTabChange={setTab} />
        </div>
      </div>

      {/* Scrollable Feed Content with Pull-to-Refresh */}
      <div
        ref={(el) => setScrollContainerRef(el)}
        className="h-full overflow-y-auto relative"
        style={{
          paddingTop: `${topOffset}px`, // Dynamically calculated: header + tabs height
          paddingBottom: `calc(${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y',
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
          className="px-4 pb-4 pt-0" 
          style={{ 
            transform: `translateY(${pullDistance}px)`,
            paddingBottom: 'calc(96px + env(safe-area-inset-bottom))',
            paddingTop: '0',
            marginTop: '0',
          }}
        >
          {loading ? (
            <div className="text-center py-12 text-stone-500">Chargement...</div>
          ) : isEmpty ? (
            <div className="text-center py-12">
              <p className="text-stone-600 mb-2">
                {tab === 'books'
                  ? 'Aucune activité sur les livres pour l\'instant'
                  : 'Aucune activité sur les activités pour l\'instant'}
              </p>
              <p className="text-sm text-stone-500">
                Suivez des utilisateurs pour voir leurs activités
              </p>
            </div>
          ) : (
            <div className="space-y-2 mt-0">
              {tab === 'books' ? (
                eventsBooks.map((event) => (
                  <FeedRow
                    key={event.id}
                    event={event}
                    onActorClick={(actorId) => setSelectedUserId(actorId)}
                    onBookClick={() => handleBookEventClick(event)}
                    formatTimeAgo={formatTimeAgo}
                  />
                ))
              ) : (
                eventsActivities.map((event) => (
                  <FeedRowActivity
                    key={event.id}
                    event={event}
                    onActorClick={(actorId) => setSelectedUserId(actorId)}
                    onActivityClick={(activityId) => handleActivityClick(activityId)}
                    formatTimeAgo={formatTimeAgo}
                  />
                ))
              )}
            </div>
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
