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
import { resolveBookCover } from '../lib/bookCover';

interface SocialFeedProps {
  onClose?: () => void;
}

// Interface correspondant à v_activity_feed
interface VActivityFeedRow {
  id: string;
  created_at: string;
  event_type: string;
  actor_id: string;
  actor_name: string;
  book_uuid: string | null;
  book_key: string | null;
  title: string | null;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
}

interface BookEvent {
  id: string;
  actor: {
    id: string;
    display_name?: string;
    username?: string;
    avatar_url?: string;
  };
  event_type: 'book_like' | 'book_comment' | 'book_started' | 'book_added' | 'book_finished';
  book: {
    book_key: string | null;
    title: string;
    author?: string | null;
    cover_url?: string | null;
    id?: string | null; // UUID from books table
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
  
  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollContainerRef, setScrollContainerRef] = useState<HTMLDivElement | null>(null);
  
  // Dynamic header/tabs height measurement
  const headerRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [tabsHeight, setTabsHeight] = useState(0);
  
  const { user } = useAuth();

  // Fetch books feed (book_like, book_comment) - Utilise v_activity_feed directement
  const fetchBooksFeed = async (_followingIds: string[]) => {
    if (booksCacheRef.current) {
      setEventsBooks(booksCacheRef.current);
      setLoading(false);
      return;
    }

    try {
      // ✅ Utiliser v_activity_feed directement
      const { data, error } = await supabase
        .from('v_activity_feed')
        .select(`
          id,
          created_at,
          event_type,
          actor_id,
          actor_name,
          book_uuid,
          book_key,
          title,
          author,
          isbn,
          cover_url
        `)
        .in('event_type', ['book_like', 'book_comment', 'book_started', 'book_added', 'book_finished'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[SocialFeed] v_activity_feed error', error);
        setEventsBooks([]);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setEventsBooks([]);
        setLoading(false);
        return;
      }

      // ✅ Charger les covers custom depuis book_covers pour les acteurs
      const actorIds = Array.from(new Set(data.map((r: VActivityFeedRow) => r.actor_id).filter(Boolean)));
      const allBookUuids = Array.from(new Set(data.map((r: VActivityFeedRow) => r.book_uuid).filter(Boolean)));

      let customCoversMap = new Map<string, string | null>(); // key: `${actorId}:${bookId}`
      if (actorIds.length > 0 && allBookUuids.length > 0) {
        // Essayer book_covers d'abord
        const { data: coversData } = await supabase
          .from('book_covers')
          .select('user_id, book_id, cover_url')
          .in('user_id', actorIds)
          .in('book_id', allBookUuids);

        if (coversData) {
          coversData.forEach((c: any) => {
            customCoversMap.set(`${c.user_id}:${c.book_id}`, c.cover_url);
          });
        } else {
          // Fallback: charger depuis user_books.custom_cover_url
          const { data: userBooksData } = await supabase
            .from('user_books')
            .select('user_id, book_id, custom_cover_url')
            .in('user_id', actorIds)
            .in('book_id', allBookUuids);

          if (userBooksData) {
            userBooksData.forEach((ub: any) => {
              customCoversMap.set(`${ub.user_id}:${ub.book_id}`, ub.custom_cover_url);
            });
          }
        }
      }

      // ✅ Charger les profils des acteurs pour avoir avatar_url
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', actorIds);

      const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

      // ✅ Charger les commentaires pour les events de type book_comment
      const commentEventIds = data
        .filter((r: VActivityFeedRow) => r.event_type === 'book_comment')
        .map((r: VActivityFeedRow) => r.id);

      let commentsMap = new Map<string, string | null>();
      if (commentEventIds.length > 0) {
        // Pour book_comment, on doit récupérer le comment_id depuis activity_events
        const { data: commentEvents } = await supabase
          .from('activity_events')
          .select('id, comment_id')
          .in('id', commentEventIds);

        if (commentEvents) {
          const commentIds = commentEvents
            .map((e: any) => e.comment_id)
            .filter((id: string | null): id is string => !!id);

          if (commentIds.length > 0) {
            const { data: comments } = await supabase
              .from('book_comments')
              .select('id, content')
              .in('id', commentIds);

            if (comments) {
              const commentContentMap = new Map(comments.map((c: any) => [c.id, c.content]));
              // Mapper event_id -> comment_content
              commentsMap = new Map(
                commentEvents.map((e: any) => [e.id, e.comment_id ? commentContentMap.get(e.comment_id) || null : null])
              );
            }
          }
        }
      }

      // ✅ Construire les events directement depuis v_activity_feed
      const enrichedEvents: BookEvent[] = data
        .map((row: VActivityFeedRow) => {
          const profile = profilesMap.get(row.actor_id);
          if (!profile) return null;

          // ✅ Récupérer la cover custom de l'acteur pour ce livre
          const actorCustomCoverUrl = row.book_uuid && row.actor_id
            ? customCoversMap.get(`${row.actor_id}:${row.book_uuid}`) ?? null
            : null;

          // ✅ Utiliser resolveBookCover (fonction canonique)
          const displayCoverUrl = resolveBookCover({
            customCoverUrl: actorCustomCoverUrl,
            coverUrl: row.cover_url || null,
          });

          return {
            id: row.id,
            actor: {
              id: row.actor_id,
              display_name: profile.display_name || undefined,
              username: profile.username || undefined,
              avatar_url: profile.avatar_url || undefined,
            },
            event_type: row.event_type as 'book_like' | 'book_comment' | 'book_started' | 'book_added' | 'book_finished',
            book: {
              book_key: row.book_key || null,
              title: row.title || 'Livre',
              author: row.author || null,
              cover_url: displayCoverUrl,
              id: row.book_uuid || null,
            },
            comment_content: commentsMap.get(row.id) || null,
            created_at: row.created_at,
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
  // Fetch activities feed (activity_like, activity_comment) - GLOBAL (all users)
  const fetchActivitiesFeed = async () => {
    if (activitiesCacheRef.current) {
      setEventsActivities(activitiesCacheRef.current);
      setLoading(false);
      return;
    }

    try {
      // 1) Fetch last likes + comments (global)
      const [{ data: reactionsData, error: reactionsError }, { data: commentsData, error: commentsError }] =
        await Promise.all([
          supabase
            .from('activity_reactions')
            .select('id, activity_id, user_id, created_at')
            .order('created_at', { ascending: false })
            .limit(60),
          supabase
            .from('activity_comments')
            .select('id, activity_id, user_id, content, created_at')
            .order('created_at', { ascending: false })
            .limit(60),
        ]);

      if (reactionsError) console.warn('[SocialFeed] activity_reactions error:', reactionsError);
      if (commentsError) console.warn('[SocialFeed] activity_comments error:', commentsError);

      const reactions = reactionsData || [];
      const comments = commentsData || [];

      const activityIds = Array.from(
        new Set([...reactions.map(r => r.activity_id), ...comments.map(c => c.activity_id)].filter(Boolean))
      ) as string[];

      if (activityIds.length === 0) {
        setEventsActivities([]);
        setLoading(false);
        return;
      }

      // 2) Fetch activities (public only)
      const { data: activitiesData, error: activitiesErr } = await supabase
        .from('activities')
        .select('id, type, title, pages_read, duration_minutes, created_at, user_id, visibility')
        .in('id', activityIds)
        .eq('visibility', 'public');

      if (activitiesErr) {
        console.error('[SocialFeed] Error fetching activities:', activitiesErr);
        setEventsActivities([]);
        setLoading(false);
        return;
      }

      const activitiesMap = new Map((activitiesData || []).map(a => [a.id, a]));

      // IMPORTANT: drop reactions/comments for activities not public or missing
      const filteredReactions = reactions.filter(r => activitiesMap.has(r.activity_id));
      const filteredComments  = comments.filter(c => activitiesMap.has(c.activity_id));

      // 3) Collect actor + owner ids
      const actorIds = Array.from(
        new Set([...filteredReactions.map(r => r.user_id), ...filteredComments.map(c => c.user_id)].filter(Boolean))
      ) as string[];

      const ownerIds = Array.from(
        new Set((activitiesData || []).map(a => a.user_id).filter(Boolean))
      ) as string[];

      const profileIds = Array.from(new Set([...actorIds, ...ownerIds]));

      const { data: profilesData, error: profilesErr } = profileIds.length
        ? await supabase
            .from('user_profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', profileIds)
        : { data: [], error: null };

      if (profilesErr) console.error('[SocialFeed] Error fetching profiles:', profilesErr);

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));

      // 4) Build events
      const events: ActivityEvent[] = [];

      filteredReactions.forEach(reaction => {
        const activity = activitiesMap.get(reaction.activity_id);
        if (!activity) return;

        const actor = profilesMap.get(reaction.user_id);
        const owner = profilesMap.get(activity.user_id);
        if (!actor || !owner) return;

        events.push({
          id: reaction.id,
          actor: {
            id: actor.id,
            display_name: actor.display_name || undefined,
            username: actor.username || undefined,
            avatar_url: actor.avatar_url || undefined,
          },
          owner: {
            id: owner.id,
            display_name: owner.display_name || undefined,
            username: owner.username || undefined,
            avatar_url: owner.avatar_url || undefined,
          },
          event_type: 'activity_like',
          activity: {
            id: activity.id,
            type: activity.type as any,
            title: activity.title,
            pages_read: activity.pages_read || undefined,
            duration_minutes: activity.duration_minutes || undefined,
            created_at: activity.created_at,
          },
          created_at: reaction.created_at,
        });
      });

      filteredComments.forEach(comment => {
        const activity = activitiesMap.get(comment.activity_id);
        if (!activity) return;

        const actor = profilesMap.get(comment.user_id);
        const owner = profilesMap.get(activity.user_id);
        if (!actor || !owner) return;

        events.push({
          id: comment.id,
          actor: {
            id: actor.id,
            display_name: actor.display_name || undefined,
            username: actor.username || undefined,
            avatar_url: actor.avatar_url || undefined,
          },
          owner: {
            id: owner.id,
            display_name: owner.display_name || undefined,
            username: owner.username || undefined,
            avatar_url: owner.avatar_url || undefined,
          },
          event_type: 'activity_comment',
          activity: {
            id: activity.id,
            type: activity.type as any,
            title: activity.title,
            pages_read: activity.pages_read || undefined,
            duration_minutes: activity.duration_minutes || undefined,
            created_at: activity.created_at,
          },
          comment_content: comment.content,
          created_at: comment.created_at,
        });
      });

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

    if (tab === 'books') {
      // books = déjà global chez toi
      await fetchBooksFeed([]);
    } else {
      // activities = global maintenant
      await fetchActivitiesFeed();
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [tab, user?.id]);

  // Measure header and tabs height dynamically
  useLayoutEffect(() => {
    const compute = () => {
      // Measure header height
      const h = headerRef.current?.offsetHeight ?? 0;
      // Measure tabs container height
      const t = tabsRef.current?.offsetHeight ?? 0;
      
      setHeaderHeight(h);
      setTabsHeight(t);
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

  const handleBookEventClick = async (event: BookEvent | GroupedEvent) => {
    const bookUuid = (event as any).book?.id || (event as any).book?.book_uuid;
    
    if (!bookUuid) {
      console.error('[SocialFeed] No book_uuid in event:', event);
      return;
    }

    // ✅ Charger le livre directement depuis books via book_uuid
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookUuid)
        .single();

      if (error) {
        console.error('[SocialFeed] Error loading book:', error);
        return;
      }

      setSelectedBook(data);
      setSelectedBookInitialTab(event.event_type === 'book_comment' ? 'comments' : 'summary');
      setSelectedBookFocusComment(event.event_type === 'book_comment');
    } catch (error) {
      console.error('[SocialFeed] Error in handleBookEventClick:', error);
    }
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
        className="fixed left-0 right-0 z-40 bg-background-light"
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
          paddingTop: `${tabsHeight}px`, // Header déjà dans le flux, on ne double pas l'espace
          paddingBottom: `calc(48px + ${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`, // Plus d'espace de fin
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
          className="px-4" 
          style={{ 
            transform: `translateY(${pullDistance}px)`,
          }}
        >
          {loading ? (
            <div className="text-center py-8 text-stone-500">Chargement...</div>
          ) : isEmpty ? (
            <div className="text-center py-8">
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
            <div className="space-y-2 py-4">
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
