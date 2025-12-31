import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ActivityCard } from '../components/ActivityCard';
import { CommentModal } from '../components/CommentModal';
import { LikersModal } from '../components/LikersModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { SearchUsersModal } from '../components/SearchUsersModal';
import { UserProfileView } from '../components/UserProfileView';
import { EditActivityModal } from '../components/EditActivityModal';
import { DeleteActivityModal } from '../components/DeleteActivityModal';
import { WeeklySummaryCarousel } from '../components/WeeklySummaryCarousel';
import { StreakBadge } from '../components/StreakBadge';
import { SocialFeed } from '../pages/SocialFeed';
import { LevelProgressBar } from '../components/LevelProgressBar';
import { ActivityFocus } from '../lib/activityFocus';
import { LeaderboardModal } from '../components/LeaderboardModal';
import { Bell, UserPlus, Heart, RefreshCw } from 'lucide-react';
import { computeStreakFromActivities } from '../lib/readingStreak';
import { AppHeader } from '../components/AppHeader';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';
import { last7DaysRangeISO } from '../utils/dateUtils';

// Note: Bottom spacing is now handled by getScrollBottomPadding() in layoutConstants

// Monday-start week helper
function startOfLocalWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diffToMonday = (day + 6) % 7; // Mon=0, Tue=1 ... Sun=6
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

export function Home() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [commentingActivityId, setCommentingActivityId] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearchUsers, setShowSearchUsers] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [activityFocus, setActivityFocus] = useState<ActivityFocus | null>(null);

  // Debug: log when selectedUserId changes
  useEffect(() => {
    console.log('[Home] selectedUserId changed to:', selectedUserId);
  }, [selectedUserId]);
  const [showSocial, setShowSocial] = useState(false);
  const [likersActivityId, setLikersActivityId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [deletingActivity, setDeletingActivity] = useState<any>(null);
  
  // Weekly summary state
  const [weeklySummary, setWeeklySummary] = useState<{
    sessionsCount: number;
    totalMinutes: number;
    totalPages: number;
  } | null>(null);
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(true);
  
  // Ranking state
  const [ranking, setRanking] = useState<{ rank: number; total: number } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollContainerRef, setScrollContainerRef] = useState<HTMLDivElement | null>(null);
  const hapticFiredRef = useRef(false);
  
  const REFRESH_THRESHOLD = 80; // Increased threshold for less sensitivity
  
  const { user, profile: contextProfile } = useAuth();

  const loadUnreadNotificationsCount = async () => {
    if (!user) return;

    // ✅ Remove count: 'exact' to avoid HEAD requests
    const { data } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', user.id)
      .eq('read', false);

    setUnreadNotificationsCount(data?.length || 0);
  };

  const loadRanking = async () => {
    if (!user) return;

    try {
      // Get user's xp_total
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('xp_total')
        .eq('id', user.id)
        .maybeSingle();

      if (!userProfile?.xp_total) {
        setRanking(null);
        return;
      }

      // Count users with higher XP
      const { data: higherRankUsers } = await supabase
        .from('user_profiles')
        .select('id')
        .gt('xp_total', userProfile.xp_total);

      // Count total users with XP > 0
      const { data: totalUsers } = await supabase
        .from('user_profiles')
        .select('id')
        .gt('xp_total', 0);

      const rank = (higherRankUsers?.length || 0) + 1;
      const total = totalUsers?.length || 0;

      setRanking({ rank, total });
    } catch (error) {
      console.error('[loadRanking] Error:', error);
      setRanking(null);
    }
  };

  const loadProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('xp_total')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setProfile(data);
    }
  };

  const loadWeeklySummary = async () => {
    if (!user) return;

    console.log('[STATS] loadWeeklySummary user', user?.id);

    setWeeklySummaryLoading(true);

    try {
      // Use last 7 days range (includes today + 6 previous days)
      const { start, end } = last7DaysRangeISO();
      
      console.log('[STATS] loadWeeklySummary date range', { start, end });

      // First, test query to see all activities
      const { data: testData, error: testError } = await supabase
        .from('activities')
        .select('id, created_at, type, pages_read, duration_minutes')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      console.log('[STATS] last activities (test)', { count: testData?.length, data: testData, error: testError });

      // Main query: last 7 days with type 'reading'
      const { data: weekActivities, error } = await supabase
        .from('activities')
        .select('pages_read, duration_minutes, photos')
        .eq('user_id', user.id)
        .eq('type', 'reading')
        .gte('created_at', start)
        .lte('created_at', end);

      if (error) {
        console.error('[loadWeeklySummary] Error:', error);
        setWeeklySummary({ sessionsCount: 0, totalMinutes: 0, totalPages: 0 });
        setWeeklySummaryLoading(false);
        return;
      }

      console.log('[STATS] loadWeeklySummary result', { 
        count: weekActivities?.length, 
        activities: weekActivities,
        start,
        end 
      });

      if (weekActivities?.length === 0) {
        console.warn('[STATS] No activities found for range', { start, end, type: 'reading' });
      }

      const sessionsCount = weekActivities?.length || 0;
      const totalMinutes = (weekActivities ?? []).reduce((sum, a) => sum + (Number(a.duration_minutes) ?? 0), 0);
      const totalPages = (weekActivities ?? []).reduce((sum, a) => sum + (Number(a.pages_read) ?? 0), 0);

      console.log('[STATS] loadWeeklySummary computed', { sessionsCount, totalMinutes, totalPages });

      setWeeklySummary({ sessionsCount, totalMinutes, totalPages });
    } catch (error) {
      console.error('[loadWeeklySummary] Exception:', error);
      setWeeklySummary({ sessionsCount: 0, totalMinutes: 0, totalPages: 0 });
    } finally {
      setWeeklySummaryLoading(false);
    }
  };

  const loadActivities = useCallback(async () => {
    if (!user) return;

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);

    try {
      const { data: following, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      if (followsError) {
        console.error('=== FOLLOWS ERROR (Home) ===');
        console.error('Full error:', followsError);
      }

      const followingIds = following?.map((f) => f.following_id) || [];

      // Home feed = ONLY activities from people I follow (exclude my own activities)
      const query = supabase
        .from('activities')
        .select(`
          *,
          user_id,
          photos,
          user_profiles!activities_user_id_fkey(id, username, display_name, avatar_url),
          books!activities_book_id_fkey(title, author, cover_url, openlibrary_cover_id, isbn)
        `)
        .order('created_at', { ascending: false })
        .limit(30);

      // Include: activities ONLY from people I follow (public or followers-only), EXCLUDE my own and private
      if (followingIds.length > 0) {
        // Only show activities from people I follow (visibility = public OR followers)
        // Exclude private activities and my own activities
        query.in('user_id', followingIds);
        query.neq('user_id', user.id); // Exclude my activities
        query.or('visibility.eq.public,visibility.eq.followers'); // Only public or followers visibility
        query.neq('visibility', 'private'); // Explicitly exclude private
      } else {
        // If no following, show empty feed (will show CTA to find readers)
        query.eq('user_id', '00000000-0000-0000-0000-000000000000'); // Impossible UUID to return empty
      }

      const { data } = await query;
      
      // Fetch custom_cover_url for activities that have book_id
      // We need to join user_books for each activity's user_id and book_id
      if (data && data.length > 0) {
        const bookIds = data.map(a => a.book_id).filter(Boolean) as string[];
        const userIds = [...new Set(data.map(a => a.user_id))] as string[];
        
        if (bookIds.length > 0 && userIds.length > 0) {
          const { data: userBooksData, error: userBooksError } = await supabase
            .from('user_books')
            .select('book_id, user_id, custom_cover_url')
            .in('book_id', bookIds)
            .in('user_id', userIds);
          
          if (userBooksError) {
            console.error('[Home] Error fetching custom covers:', userBooksError);
          }
          
          // Create a map: `${user_id}:${book_id}` -> custom_cover_url
          const customCoverMap = new Map<string, string | null>();
          if (userBooksData) {
            userBooksData.forEach(ub => {
              const key = `${ub.user_id}:${ub.book_id}`;
              // custom_cover_url is already a public URL (stored as such in AddCoverModal)
              // If it's a path (shouldn't happen, but safety check), convert to public URL
              let coverUrl = ub.custom_cover_url;
              if (coverUrl && !coverUrl.startsWith('http')) {
                // It's a path, convert to public URL
                const { data: publicUrlData } = supabase.storage.from('book-covers').getPublicUrl(coverUrl);
                coverUrl = publicUrlData?.publicUrl || null;
              }
              customCoverMap.set(key, coverUrl);
            });
          }
          
          // Attach custom_cover_url to each activity's book
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

      if (!data || data.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      const activityIds = data.map((a) => a.id);

      // ✅ BATCH REQUEST: Fetch all reactions in one query
      const { data: allReactions } = await supabase
        .from('activity_reactions')
        .select('activity_id, user_id')
        .in('activity_id', activityIds);

      // ✅ BATCH REQUEST: Fetch all comments in one query
      const { data: allComments } = await supabase
        .from('activity_comments')
        .select('activity_id')
        .in('activity_id', activityIds);

      // Group reactions by activity_id (count + check user reaction)
      const reactionsByActivity = new Map<string, { count: number; userHasReacted: boolean }>();
      if (allReactions) {
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

      // Group comments by activity_id (count only)
      const commentsByActivity = new Map<string, number>();
      if (allComments) {
        for (const comment of allComments) {
          const activityId = comment.activity_id;
          commentsByActivity.set(activityId, (commentsByActivity.get(activityId) || 0) + 1);
        }
      }

      // Build activities with counts from grouped data
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
          book_id: activity.book_id,
          photos: activity.photos || null,
          created_at: activity.created_at,
          reactions_count: reactions.count,
          comments_count: commentsCount,
          user_has_reacted: reactions.userHasReacted,
        };
      });

      setActivities(activitiesWithReactions);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[loadActivities] Request aborted');
        return;
      }
      console.error('[loadActivities] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    loadActivities();
    loadWeeklySummary();
    loadStreak();
    loadUnreadNotificationsCount();
    loadProfile();
    loadRanking();

    const handleXpUpdated = (event: any) => {
      setProfile((prev: any) =>
        prev ? { ...prev, xp_total: event.detail.xp_total } : prev
      );
      // Recalculate ranking when XP changes
      loadRanking();
    };

    window.addEventListener('xp-updated', handleXpUpdated as EventListener);

    const interval = setInterval(() => {
      loadUnreadNotificationsCount();
    }, 30000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('xp-updated', handleXpUpdated as EventListener);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadStreak = async () => {
    if (!user) return;

    try {
      // Load last 200 reading activities (wide range, we'll filter in local timezone)
      const { data: activities, error } = await supabase
        .from('activities')
        .select('created_at, pages_read, duration_minutes, type')
        .eq('user_id', user.id)
        .eq('type', 'reading')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[loadStreak] Error:', error);
        setStreak(0);
        return;
      }

      // Compute streak from activities (local timezone)
      const streak = computeStreakFromActivities(activities || []);
      setStreak(streak);

      // Update profile's current_streak
      await supabase
        .from('user_profiles')
        .update({ current_streak: streak })
        .eq('id', user.id);
    } catch (error) {
      console.error('[loadStreak] Exception:', error);
      setStreak(0);
    }
  };

  const handleReact = async (activityId: string) => {
    console.log('[Home] handleReact called', activityId);
    if (!user) {
      console.log('[Home] handleReact: no user');
      return;
    }

    const a = activities.find((x) => x.id === activityId);
    if (!a) {
      console.log('[Home] handleReact: activity not found', activityId);
      return;
    }
    console.log('[Home] handleReact: activity found', a.id, 'current liked:', a.user_has_reacted);

    const currentLiked = a.user_has_reacted;
    const nextLiked = !currentLiked;

    // Optimistic UI
    setActivities((prev) =>
      prev.map((x) => {
        if (x.id !== activityId) return x;
        return {
          ...x,
          user_has_reacted: nextLiked,
          reactions_count: Math.max(0, (x.reactions_count || 0) + (nextLiked ? 1 : -1)),
        };
      })
    );

    try {
      if (currentLiked) {
        // Unlike: delete reaction
        const { error } = await supabase
          .from('activity_reactions')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', user.id);

        if (error) {
          console.error('[handleReact] delete error', error);
          // Rollback on error
          setActivities((prev) =>
            prev.map((x) => {
              if (x.id !== activityId) return x;
              return {
                ...x,
                user_has_reacted: currentLiked,
                reactions_count: Math.max(0, (x.reactions_count || 0) + (currentLiked ? 1 : -1)),
              };
            })
          );
        }
      } else {
        // Like: insert reaction
        const { error } = await supabase
          .from('activity_reactions')
          .insert({ activity_id: activityId, user_id: user.id });

        if (error) {
          console.error('[handleReact] insert error', error);
          // Rollback on error
          setActivities((prev) =>
            prev.map((x) => {
              if (x.id !== activityId) return x;
              return {
                ...x,
                user_has_reacted: currentLiked,
                reactions_count: Math.max(0, (x.reactions_count || 0) + (currentLiked ? 1 : -1)),
              };
            })
          );
        }
      }
    } catch (e) {
      console.error('[handleReact] exception', e);
      // Rollback on exception
      setActivities((prev) =>
        prev.map((x) => {
          if (x.id !== activityId) return x;
          return {
            ...x,
            user_has_reacted: currentLiked,
            reactions_count: Math.max(0, (x.reactions_count || 0) + (currentLiked ? 1 : -1)),
          };
        })
      );
    }
  };

  const handleComment = (activityId: string) => {
    setCommentingActivityId(activityId);
  };

  const handleCloseComments = () => {
    console.log('[Home] handleCloseComments called');
    setCommentingActivityId(null);
    // Don't reload activities on close, just close the modal
    // loadActivities();
  };

  const handleCommentAdded = () => {
    // Optimistically update comment count for the activity
    if (commentingActivityId) {
      setActivities((prev) =>
        prev.map((activity) => {
          if (activity.id === commentingActivityId) {
            return {
              ...activity,
              comments_count: (activity.comments_count || 0) + 1,
            };
          }
          return activity;
        })
      );
    }
  };

  // Pull-to-refresh handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      // vibration iPhone (une fois)
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch {}

      await Promise.all([
        loadUnreadNotificationsCount(),
        loadStreak(),
        loadWeeklySummary(),
        loadActivities(),
      ]);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
      hapticFiredRef.current = false;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef) return;
    const scrollTop = scrollContainerRef.scrollTop;
    // Only activate if scrolled to top AND touch is not on a scrollable carousel
    if (scrollTop === 0) {
      setIsPulling(true);
      setStartY(e.touches[0].clientY);
      // Store initial X to detect horizontal swipe
      const startX = e.touches[0].clientX;
      (e.currentTarget as HTMLElement).setAttribute('data-start-x', String(startX));
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !scrollContainerRef) return;

    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - startY;
    const startX = parseFloat((e.currentTarget as HTMLElement).getAttribute('data-start-x') || '0');
    const deltaX = Math.abs(currentX - startX);

    // Block pull-to-refresh if horizontal swipe is dominant
    if (deltaX > Math.abs(deltaY) && deltaX > 10) {
      setIsPulling(false);
      setPullDistance(0);
      hapticFiredRef.current = false;
      return;
    }

    // Only proceed if scroll is at top
    if (scrollContainerRef.scrollTop !== 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    if (deltaY > 0) {
      // résistance (plus smooth)
      const clamped = Math.min(deltaY * 0.65, 110);
      setPullDistance(clamped);

      // Haptic quand tu dépasses le seuil (une seule fois)
      if (clamped >= REFRESH_THRESHOLD && !hapticFiredRef.current) {
        hapticFiredRef.current = true;
        try { Haptics.impact({ style: ImpactStyle.Light }); } catch {}
      }
      if (clamped < REFRESH_THRESHOLD) {
        hapticFiredRef.current = false;
      }

      if (scrollContainerRef.scrollTop === 0 && e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance >= REFRESH_THRESHOLD) {
      handleRefresh();
    } else {
      setPullDistance(0);
      hapticFiredRef.current = false;
    }
    setIsPulling(false);
    setStartY(0);
  };

  // Navigation handlers
  const handleNavigateToSocial = () => {
    setShowSocial(true);
  };

  const handleNavigateToInsights = () => {
    // Navigate without page reload
    window.history.pushState({}, '', '/insights');
    // Trigger navigation event for App.tsx
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="h-screen max-w-2xl mx-auto bg-background-light overflow-hidden">
      {/* Fixed Header - now truly fixed via AppHeader component */}
      <AppHeader
        title="Accueil"
        rightActions={
          <>
            <StreakBadge streak={streak} onClick={handleNavigateToInsights} />
            <button
              onClick={handleNavigateToSocial}
              className="p-1.5 hover:bg-black/5 rounded-full transition-colors"
              title="Social"
            >
              <Heart className="w-4 h-4 text-text-sub-light" />
            </button>
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

      {/* Scrollable Feed Content with Pull-to-Refresh - SINGLE SCROLL CONTAINER */}
      <div
        ref={(el) => setScrollContainerRef(el)}
        className="h-full overflow-y-auto relative"
        style={{
          paddingBottom: `calc(${TABBAR_HEIGHT}px + env(safe-area-inset-bottom) + 32px)`,
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
        {(pullDistance > 0 || isRefreshing) && (
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none"
            style={{ height: `${Math.max(pullDistance, 60)}px`, paddingTop: '8px' }}
          >
            <div
              className="flex items-center justify-center rounded-full bg-white/80 backdrop-blur px-3 py-2 shadow-sm"
              style={{
                transform: `translateY(${Math.min(pullDistance * 0.3, 24)}px)`,
                transition: isRefreshing ? 'transform 150ms ease' : undefined,
              }}
            >
              <RefreshCw
                className={`w-4 h-4 text-stone-600 ${isRefreshing ? 'animate-spin' : ''}`}
                style={{
                  transform: !isRefreshing
                    ? `rotate(${Math.min(1, pullDistance / REFRESH_THRESHOLD) * 180}deg)`
                    : undefined,
                  transition: isRefreshing ? undefined : 'transform 50ms linear',
                }}
              />
            </div>
          </div>
        )}

        <div
          className="p-4"
          style={{
            transform: `translateY(${pullDistance}px)`,
            transition: isPulling ? 'none' : 'transform 180ms ease',
            willChange: 'transform',
            paddingBottom: `calc(32px + ${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
          }}
        >
          {/* Weekly Summary Carousel + Level Progress Bar (aligned) */}
          <div className="mb-4 space-y-3">
            <WeeklySummaryCarousel
              summary={weeklySummary}
              loading={weeklySummaryLoading}
              ranking={ranking}
              userAvatar={profile?.avatar_url}
              onOpenActivities={handleNavigateToInsights}
              onOpenTime={handleNavigateToInsights}
              onOpenPages={handleNavigateToInsights}
              onOpenLeaderboard={() => setShowLeaderboard(true)}
            />
            
            {/* Level Progress Bar (compact) - aligned with cards */}
            {contextProfile?.xp_total !== undefined && (
              <div className="px-4">
                <LevelProgressBar xpTotal={contextProfile.xp_total || 0} variant="compact" />
              </div>
            )}
          </div>

          {/* Activities Feed */}
          {loading ? (
            <div className="text-center py-12 text-stone-500">Chargement...</div>
          ) : (
            <>
              {activities.length > 0 ? (
                <div className="space-y-2">
                  {activities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onReact={() => handleReact(activity.id)}
                  onComment={() => handleComment(activity.id)}
                  onOpenLikers={(id) => setLikersActivityId(id)}
                  onEdit={(id) => {
                    const activity = activities.find(a => a.id === id);
                    if (activity) {
                      setEditingActivity(activity);
                      setEditingActivityId(id);
                    }
                  }}
                  onDelete={(id) => {
                    const activity = activities.find(a => a.id === id);
                    if (activity) {
                      setDeletingActivity(activity);
                      setDeletingActivityId(id);
                    }
                  }}
                />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-stone-600 mb-2">Aucune activité</p>
                  <p className="text-sm text-stone-500 mb-4">
                    Suivez d'autres lecteurs pour voir leurs activités ici
                  </p>
                  <button
                    onClick={() => setShowSearchUsers(true)}
                    className="px-4 py-2 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all"
                  >
                    Trouver des lecteurs
                  </button>
                </div>
            )}
          </>
        )}
      </div>
      </div>

      {commentingActivityId && (
        <CommentModal
          activityId={commentingActivityId}
          onClose={handleCloseComments}
          onCommentAdded={handleCommentAdded}
          onUserClick={(userId) => {
            console.log('[Home] ✅ CommentModal onUserClick called with userId:', userId, typeof userId);
            if (!userId) {
              console.error('[Home] ❌ No userId provided to onUserClick');
              return;
            }
            // Clear activityFocus to prevent auto-opening "Mes activités"
            setActivityFocus(null);
            // Set selectedUserId immediately - this will open the profile
            console.log('[Home] ✅ Setting selectedUserId to:', userId);
            setSelectedUserId(userId);
            console.log('[Home] ✅ selectedUserId set, UserProfileView should render');
            // Close the comment modal immediately
            handleCloseComments();
          }}
        />
      )}

      {likersActivityId && (
        <LikersModal
          activityId={likersActivityId}
          onClose={() => setLikersActivityId(null)}
          onUserClick={(id) => {
            setSelectedUserId(id);
            setLikersActivityId(null);
          }}
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
          onOpenMyActivity={(activityId, commentId, notifType) => {
            // Ouvrir MON profil avec focus sur MON activité
            setShowNotifications(false);
            setSelectedUserId(user?.id || null);
            setActivityFocus({
              ownerUserId: user?.id || '',
              activityId,
              commentId: commentId ?? null,
              openComments: notifType === 'comment',
              openMyActivities: true,
              source: 'notification',
            });
          }}
        />
      )}

      {selectedUserId && (
        <div className="fixed inset-0 bg-background-light z-[400] overflow-y-auto">
          {console.log('[Home] ✅ Rendering UserProfileView with userId:', selectedUserId)}
          <UserProfileView
            userId={selectedUserId}
            onClose={() => {
              console.log('[Home] Closing UserProfileView');
              setSelectedUserId(null);
              setActivityFocus(null);
            }}
            onUserClick={(id) => {
              console.log('[Home] UserProfileView onUserClick called with id:', id);
              // Clear activityFocus when navigating to a different user
              setActivityFocus(null);
              setSelectedUserId(id);
            }}
            activityFocus={activityFocus}
            onFocusConsumed={() => setActivityFocus(null)}
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

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          onClose={() => setShowLeaderboard(false)}
          onUserClick={(userId) => {
            setSelectedUserId(userId);
            setShowLeaderboard(false);
          }}
        />
      )}

      {/* Social feed overlay */}
      {showSocial && (
        <div className="fixed inset-0 bg-background-light z-[200] overflow-y-auto">
          <SocialFeed onClose={() => setShowSocial(false)} />
        </div>
      )}

      {/* Edit Activity Modal */}
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
          onSaved={() => {
            loadActivities();
            setEditingActivityId(null);
            setEditingActivity(null);
          }}
        />
      )}

      {/* Delete Activity Modal */}
      {deletingActivityId && deletingActivity && (
        <DeleteActivityModal
          activityId={deletingActivityId}
          activityPages={deletingActivity.pages_read}
          onClose={() => {
            setDeletingActivityId(null);
            setDeletingActivity(null);
          }}
          onDeleted={() => {
            setActivities(prev => prev.filter(a => a.id !== deletingActivityId));
            setDeletingActivityId(null);
            setDeletingActivity(null);
          }}
        />
      )}
    </div>
  );
}
