import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, UserCheck } from 'lucide-react';
import { FollowersModal } from './FollowersModal';
import { FollowingModal } from './FollowingModal';
import { UserLibraryView } from './UserLibraryView';
import { AppHeader } from './AppHeader';
import { ProfileLayout } from './ProfileLayout';
import { computeReadingStats, computePR } from '../lib/readingStats';
import { isRealReadingSession } from '../lib/readingSessions';
import { MyActivities } from '../pages/MyActivities';
import { countRows } from '../lib/supabaseCounts';
import { LevelProgressBar } from './LevelProgressBar';
import { XpHistoryModal } from './XpHistoryModal';
import { ActivityFocus } from '../lib/activityFocus';

interface UserProfileViewProps {
  userId: string;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
  activityFocus?: ActivityFocus | null;
  onFocusConsumed?: () => void;
}

export function UserProfileView({ userId, onClose, onUserClick, activityFocus, onFocusConsumed }: UserProfileViewProps) {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, activities: 0, books: 0, likes: 0 });
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLikedBooks, setShowLikedBooks] = useState(false);
  const [showUserActivities, setShowUserActivities] = useState(false);
  const [showXpHistory, setShowXpHistory] = useState(false);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [readingSpeed7d, setReadingSpeed7d] = useState<number | null>(null);
  const [readingPace7d, setReadingPace7d] = useState<number | null>(null);
  const [readingSpeedPR, setReadingSpeedPR] = useState<number | null>(null);
  const [readingPacePR, setReadingPacePR] = useState<number | null>(null);
  const [hasSessions7d, setHasSessions7d] = useState(false);
  const [hasAnySessions, setHasAnySessions] = useState(false);
  const [totalPages7d, setTotalPages7d] = useState(0);
  const [totalPagesAllTime, setTotalPagesAllTime] = useState(0);
  const [totalMinutes7d, setTotalMinutes7d] = useState(0);
  const [currentlyReading, setCurrentlyReading] = useState<any[]>([]);
  const [likedBooks, setLikedBooks] = useState<any[]>([]);
  const { user } = useAuth();

  const handleUserClick = (clickedUserId: string) => {
    if (onUserClick) {
      onUserClick(clickedUserId);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadAll = async () => {
      if (!userId || !user) return;

      setLoading(true);

      try {
        await Promise.all([
          loadProfile(),
          loadStats(),
          loadWeeklyActivity(),
          loadReadingStats(),
          loadLikedBooks(),
          loadCurrentlyReading(),
          checkFollowing(),
        ]);
      } catch (error) {
        console.error('Error loading profile data:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadAll();

    return () => {
      mounted = false;
    };
  }, [userId, user?.id]);

  // ✅ Auto-open "Mes activités" when coming from a notification focus
  useEffect(() => {
    if (!activityFocus) return;

    // Only if focus targets THIS profile
    if (!activityFocus.openMyActivities) return;
    if (!activityFocus.ownerUserId) return;
    if (activityFocus.ownerUserId !== userId) return;

    // Wait until profile is loaded (avoid opening during initial loading state)
    if (loading || !profile) return;

    // Open MyActivities overlay
    setShowUserActivities(true);
  }, [activityFocus, userId, loading, profile]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setProfile(data);
    }
  };

  const loadStats = async () => {
    try {
      const [followers, following, activities, books, likes] = await Promise.all([
        countRows('follows', q => q.eq('following_id', userId)), // followers = ceux qui suivent cet user
        countRows('follows', q => q.eq('follower_id', userId)),  // following = ceux que cet user suit
        countRows('activities', q => q.eq('user_id', userId).eq('visibility', 'public')),
        countRows('user_books', q => q.eq('user_id', userId)),
        countRows('book_likes', q => q.eq('user_id', userId).is('deleted_at', null)), // ✅ Seulement les likes actifs
      ]);

      console.log('[loadStats counts]', { userId, followers, following, activities, books, likes });

      setStats({ followers, following, activities, books, likes });
    } catch (e: any) {
      console.error('[loadStats] FAILED', {
        userId,
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
        code: e?.code,
        raw: e,
      });
      // IMPORTANT: ne pas écraser avec 0 si tu veux voir le bug
      // mais si tu veux fallback UI: garde l'ancien stats au lieu de tout reset
      // setStats(prev => prev);
    }
  };

  const loadWeeklyActivity = async () => {
    try {
      const now = new Date();
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diffToMonday = (day + 6) % 7;
      startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      const startISO = startOfWeek.toISOString();

      const { data: activities, error } = await supabase
        .from('activities')
        .select('pages_read, created_at, photos')
        .eq('user_id', userId)
        .eq('type', 'reading')
        .eq('visibility', 'public')
        .gte('created_at', startISO)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[loadWeeklyActivity] Error:', error);
        setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
        return;
      }

      const weekData = [0, 0, 0, 0, 0, 0, 0];

      for (const a of activities ?? []) {
        if (!a.created_at) continue;
        const d = new Date(a.created_at);
        const js = d.getDay();
        const idx = (js + 6) % 7;
        weekData[idx] += Number(a.pages_read) || 0;
      }

      setWeeklyActivity(weekData);
    } catch (e) {
      console.error('[loadWeeklyActivity] Unexpected:', e);
      setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
    }
  };

  const loadReadingStats = async () => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceISO = since.toISOString();

    const { data: allActivities, error: allErr } = await supabase
      .from('activities')
      .select('pages_read, duration_minutes, reading_speed_pph, reading_pace_min_per_page, created_at, photos')
      .eq('user_id', userId)
      .eq('type', 'reading')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false });

    if (allErr) {
      console.error('[loadReadingStats] all activities error:', allErr);
      setTotalMinutes(0);
      setReadingSpeed7d(null);
      setReadingPace7d(null);
      setReadingSpeedPR(null);
      setReadingPacePR(null);
      return;
    }

    const all = allActivities ?? [];
    // Filter to only real reading sessions (pages > 0 AND duration > 0)
    const sessions = all.filter(isRealReadingSession);

    // total pages all time (single source of truth: real sessions only)
    const totalPagesAll = sessions.reduce((acc, a) => acc + (Number(a.pages_read) || 0), 0);
    setTotalPagesAllTime(totalPagesAll);

    const totalMins = sessions.reduce((acc, a) => acc + (Number(a.duration_minutes) || 0), 0);
    setTotalMinutes(totalMins);

    // Check if user has any real sessions
    const hasAny = sessions.length > 0;
    setHasAnySessions(hasAny);

    // Compute PR using centralized function (real sessions only)
    const prResult = computePR(sessions, 30);
    setReadingSpeedPR(prResult.speedPph);
    setReadingPacePR(prResult.paceMinPerPage);

    // 7d stats using centralized function (real sessions only)
    const last7d = sessions.filter(a => a.created_at && new Date(a.created_at) >= new Date(sinceISO));

    const sumPages7d = last7d.reduce((acc, a) => acc + (Number(a.pages_read) || 0), 0);
    const sumMins7d = last7d.reduce((acc, a) => acc + (Number(a.duration_minutes) || 0), 0);

    setTotalPages7d(sumPages7d);
    setTotalMinutes7d(sumMins7d);

    const stats7d = computeReadingStats(sumPages7d, sumMins7d);
    setHasSessions7d(stats7d.hasSessions);
    
    if (stats7d.speed.type === 'value') {
      setReadingSpeed7d(stats7d.speed.value);
    } else {
      setReadingSpeed7d(null);
    }

    if (stats7d.pace.type === 'value') {
      setReadingPace7d(stats7d.pace.value);
    } else {
      setReadingPace7d(null);
    }
  };

  const loadLikedBooks = async () => {
    try {
      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select('book_key, created_at')
        .eq('user_id', userId)
      .order('created_at', { ascending: false })
        .limit(50);

      if (likesError) {
        console.error('[loadLikedBooks] book_likes error:', likesError);
        setLikedBooks([]);
        return;
      }

      if (!likesData || likesData.length === 0) {
        setLikedBooks([]);
        return;
      }

      const normalizeKey = (key: string): string[] => {
        if (!key) return [];
        const k = key.trim();
        const out = new Set<string>();
        out.add(k);
        if (k.startsWith('ol:/works/')) out.add(k.replace(/^ol:/, ''));
        if (k.startsWith('ol:') && !k.startsWith('ol:/works/')) out.add(`/works/${k.replace(/^ol:/, '')}`);
        if (k.startsWith('/works/')) out.add(k);
        if (k.startsWith('isbn:')) out.add(k);
        return Array.from(out);
      };

      const rawKeys = likesData.map(l => l.book_key).filter(Boolean);
      const candidateKeys = Array.from(new Set(rawKeys.flatMap(normalizeKey)));

      if (candidateKeys.length === 0) {
        setLikedBooks([]);
        return;
      }

      const { data: booksData, error: booksError } = await supabase
        .from('books_cache')
        .select('book_key, title, author, cover_url, isbn')
        .in('book_key', candidateKeys);

      if (booksError) {
        console.error('[loadLikedBooks] books_cache error:', booksError);
        setLikedBooks([]);
        return;
      }

      const booksMap = new Map((booksData ?? []).map(b => [b.book_key, b]));

      const pickCached = (likeKey: string) => {
        if (!likeKey) return null;
        if (booksMap.has(likeKey)) return booksMap.get(likeKey);
        const norms = normalizeKey(likeKey);
        for (const nk of norms) {
          if (booksMap.has(nk)) return booksMap.get(nk);
        }
        return null;
      };

      const combined = likesData.map(like => {
        const cached = pickCached(like.book_key);
        return {
          book_key: like.book_key,
          created_at: like.created_at,
          book: cached ?? {
            book_key: like.book_key,
            title: 'Titre inconnu',
            author: 'Auteur inconnu',
            cover_url: null,
            isbn: null,
          },
        };
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setLikedBooks(combined);
    } catch (error) {
      console.error('[loadLikedBooks] Unexpected error:', error);
      setLikedBooks([]);
    }
  };

  const loadCurrentlyReading = async () => {
    const { data } = await supabase
      .from('user_books')
      .select(`
        id,
        status,
        current_page,
        book_id,
        created_at,
        updated_at,
        book:books (
          id,
          title,
          author,
          cover_url,
          total_pages,
          description,
          isbn,
          google_books_id,
          edition
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'reading')
      .order('updated_at', { ascending: false });

    if (data) {
      setCurrentlyReading(data);
    } else {
      setCurrentlyReading([]);
    }
  };

  const checkFollowing = async () => {
    if (!user || userId === user.id) {
      return;
    }

    const { data, error } = await supabase
      .from('follows')
      .select('follower_id, following_id')
      .eq('follower_id', user.id)
      .eq('following_id', userId)
      .maybeSingle();

    if (error) {
      console.error('checkFollowing error:', error);
      setIsFollowing(false);
      return;
    }

    setIsFollowing(!!data);
  };

  const handleFollowToggle = async () => {
    if (!user || userId === user.id) return;
    if (followLoading) return;

    setFollowLoading(true);

    try {
      if (isFollowing) {
        const { error: deleteError } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);

        if (deleteError) {
          console.error('Erreur lors du unfollow:', deleteError);
          return;
        }

        setIsFollowing(false);
      } else {
        const { error: followError } = await supabase
          .from('follows')
          .upsert(
            { follower_id: user.id, following_id: userId },
            { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
          );

        if (followError && (followError as any).code !== '23505') {
          console.error('Erreur lors du follow:', followError);
          return;
        }

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

        setIsFollowing(true);
      }

      await Promise.all([loadStats(), checkFollowing()]);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light">
        <div className="text-text-sub-light">Chargement du profil...</div>
      </div>
    );
  }

  const isOwnProfile = user?.id === userId;

  if (showLibrary) {
    return (
      <UserLibraryView
        userId={userId}
        userName={profile.display_name}
        onClose={() => setShowLibrary(false)}
        mode="all"
      />
    );
  }

  if (showLikedBooks) {
    return (
      <UserLibraryView
        userId={userId}
        userName={profile.display_name}
        onClose={() => setShowLikedBooks(false)}
        mode="liked"
      />
    );
  }

  if (showUserActivities) {
    return (
      <MyActivities
        userId={userId}
        title={`Activités de ${profile.display_name}`}
        onClose={() => {
          setShowUserActivities(false);
          loadStats();
          onFocusConsumed?.();
        }}
        focusActivityId={activityFocus?.activityId || null}
        focusCommentId={activityFocus?.commentId || null}
        autoOpenComments={activityFocus?.openComments || false}
        onFocusConsumed={onFocusConsumed}
        onUserClick={(clickedUserId) => {
          handleUserClick(clickedUserId);
          setShowUserActivities(false);
        }}
      />
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col min-h-0 overflow-hidden max-w-2xl mx-auto">
      {/* Sticky Header with safe-area top */}
      <AppHeader
        title="Profil"
        showBack
        onBack={onClose}
      />

      {/* Scrollable content container */}
      <div 
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: 'calc(12px + var(--sab))',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
        }}
      >
        {/* Level Progress Bar */}
        {profile?.xp_total !== undefined && (
          <div className="px-4 pt-4 pb-2">
            <div
              role="button"
              tabIndex={0}
              className="w-full cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[UserProfileView] Opening XP history modal');
                setShowXpHistory(true);
                requestAnimationFrame(() => {
                  console.log('[UserProfileView] showXpHistory should be true now');
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  console.log('[UserProfileView] Opening XP history modal (keyboard)');
                  setShowXpHistory(true);
                }
              }}
            >
              <LevelProgressBar xpTotal={profile.xp_total || 0} variant="full" />
            </div>
          </div>
        )}

        <ProfileLayout
        profile={profile}
        stats={stats}
        weeklyActivity={weeklyActivity}
        totalMinutes={totalMinutes}
        readingSpeed7d={readingSpeed7d}
        readingPace7d={readingPace7d}
        readingSpeedPR={readingSpeedPR}
        readingPacePR={readingPacePR}
        bestSessionMinutes={null}
        hasSessions7d={hasSessions7d}
        hasAnySessions={hasAnySessions}
        totalPages7d={totalPages7d}
        totalPagesAllTime={totalPagesAllTime}
        totalMinutes7d={totalMinutes7d}
        streakDays={profile?.current_streak ?? 0}
        currentlyReading={currentlyReading}
        likedBooks={likedBooks}
        interests={profile.interests}
        actionButtons={
          !isOwnProfile ? (
            <button
              onClick={handleFollowToggle}
              disabled={followLoading}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl hover:brightness-95 transition-colors font-medium ${
                isFollowing
                  ? 'bg-stone-900 text-white hover:bg-stone-800'
                  : 'bg-primary text-black'
              } ${followLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="w-4 h-4" />
                  Suivi
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Suivre
                </>
              )}
            </button>
          ) : undefined
        }
        onNavigateToLibrary={() => setShowLibrary(true)}
        onShowAllLikedBooks={() => setShowLikedBooks(true)}
        onShowFollowers={() => setShowFollowersModal(true)}
        onShowFollowing={() => setShowFollowingModal(true)}
        onShowMyActivities={() => setShowUserActivities(true)}
        mode="user"
        viewedUserId={userId}
        />
      </div>

      {showFollowersModal && (
          <FollowersModal
            userId={userId}
            onClose={() => setShowFollowersModal(false)}
            onUserClick={(clickedUserId) => {
              handleUserClick(clickedUserId);
              setShowFollowersModal(false);
            }}
          />
        )}

        {showFollowingModal && (
          <FollowingModal
            userId={userId}
            onClose={() => setShowFollowingModal(false)}
            onUserClick={(clickedUserId) => {
              handleUserClick(clickedUserId);
              setShowFollowingModal(false);
            }}
          />
        )}

        {showXpHistory && (
          <XpHistoryModal
            open={showXpHistory}
            onClose={() => setShowXpHistory(false)}
            userId={userId}
            displayName={profile?.display_name ?? profile?.username ?? 'Cet utilisateur'}
          />
        )}
    </div>
  );
}
