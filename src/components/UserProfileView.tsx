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
import { TABBAR_HEIGHT } from '../lib/layoutConstants';
import { fetchWeeklyActivity, weeklyActivityToPagesArray, formatWeekRangeLabel } from '../lib/weeklyActivity';

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
  const [libraryMode, setLibraryMode] = useState<'all' | 'reading'>('all');
  const [showLikedBooks, setShowLikedBooks] = useState(false);
  const [showUserActivities, setShowUserActivities] = useState(false);
  const [showXpHistory, setShowXpHistory] = useState(false);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [weeklyWeekOffset, setWeeklyWeekOffset] = useState(0);
  const [weeklyRangeLabel, setWeeklyRangeLabel] = useState<string>('');
  const [weeklyLoading, setWeeklyLoading] = useState(false);
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
  const isOwner = user?.id === userId;
  const getAllowedVisibilities = (overrideIsFollowing?: boolean): ('public' | 'followers' | 'private')[] => {
    const canSeeFollowers = overrideIsFollowing ?? isFollowing;
    if (isOwner) return ['public', 'followers', 'private'];
    return canSeeFollowers ? ['public', 'followers'] : ['public'];
  };

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
        const following = await checkFollowing();
        const visibilities = getAllowedVisibilities(following);

        await Promise.all([
          loadProfile(),
          loadStats(visibilities),
          loadWeeklyActivity(0, visibilities),
          loadReadingStats(visibilities),
          loadLikedBooks(),
          loadCurrentlyReading(),
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

  const loadStats = async (visibilities = getAllowedVisibilities()) => {
    try {
      const [followers, following, activities, books, likes] = await Promise.all([
        countRows('follows', q => q.eq('following_id', userId)), // followers = ceux qui suivent cet user
        countRows('follows', q => q.eq('follower_id', userId)),  // following = ceux que cet user suit
        countRows('activities', q => {
          q = q.eq('user_id', userId);
          return visibilities.length === 1 ? q.eq('visibility', visibilities[0]) : q.in('visibility', visibilities);
        }),
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

  const loadWeeklyActivity = async (weekOffset = weeklyWeekOffset, visibilities = getAllowedVisibilities()) => {
    try {
      setWeeklyLoading(true);
      const result = await fetchWeeklyActivity(userId, { weekOffset, visibilities });
      const weekData = weeklyActivityToPagesArray(result.days);
      setWeeklyActivity(weekData);
      if (result.weekStart && result.weekEnd) {
        setWeeklyRangeLabel(
          formatWeekRangeLabel(new Date(result.weekStart), new Date(result.weekEnd))
        );
      }
    } catch (e) {
      console.error('[loadWeeklyActivity] Unexpected:', e);
      // garder les données affichées pour éviter le flash
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handlePrevWeek = () => {
    setWeeklyWeekOffset((prev) => {
      const next = prev + 1;
      loadWeeklyActivity(next);
      return next;
    });
  };

  const handleNextWeek = () => {
    setWeeklyWeekOffset((prev) => {
      if (prev === 0) return prev;
      const next = prev - 1;
      loadWeeklyActivity(next);
      return next;
    });
  };

  const loadReadingStats = async (visibilities = getAllowedVisibilities()) => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceISO = since.toISOString();

    let query = supabase
      .from('activities')
      .select('pages_read, duration_minutes, reading_speed_pph, reading_pace_min_per_page, created_at, photos')
      .eq('user_id', userId)
      .eq('type', 'reading');

    query =
      visibilities.length === 1
        ? query.eq('visibility', visibilities[0])
        : query.in('visibility', visibilities);

    const { data: allActivities, error: allErr } = await query.order('created_at', { ascending: false });

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
    if (!userId) return;

    try {
      // ✅ Utiliser book_uuid (UUID) avec join direct sur books via FK (même logique que Profile)
      // ✅ SOFT DELETE: Filtrer seulement les likes actifs (deleted_at IS NULL)
      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select(`
          id,
          created_at,
          book_uuid,
          book_key,
          books:books!book_likes_book_uuid_fkey (
            id,
            title,
            author,
            cover_url,
            isbn,
            openlibrary_cover_id,
            google_books_id,
            openlibrary_work_key
          )
        `)
        .eq('user_id', userId)
        .is('deleted_at', null) // ✅ Seulement les likes actifs
        .not('book_uuid', 'is', null) // ✅ Cache les likes legacy (sans book_uuid)
        .order('created_at', { ascending: false })
        .limit(60);

      if (likesError) {
        console.error('[loadLikedBooks] book_likes error:', likesError);
        setLikedBooks([]);
        return;
      }

      if (!likesData || likesData.length === 0) {
        setLikedBooks([]);
        return;
      }

      // ✅ Charger les covers custom depuis book_covers OU user_books.custom_cover_url
      const bookIds = (likesData ?? [])
        .map(x => x.book_uuid)
        .filter((id): id is string => !!id);

      // Essayer book_covers d'abord (table recommandée)
      const { data: coversData, error: coversError } = await supabase
        .from('book_covers')
        .select('book_id, cover_url')
        .eq('user_id', userId)
        .in('book_id', bookIds);

      // Si book_covers n'existe pas ou est vide, essayer user_books.custom_cover_url
      let coverMap = new Map<string, string | null>();
      if (!coversError && coversData && coversData.length > 0) {
        coverMap = new Map((coversData ?? []).map((c: any) => [c.book_id, c.cover_url]));
      } else {
        // Fallback: charger depuis user_books.custom_cover_url
        const { data: userBooksData } = await supabase
          .from('user_books')
          .select('book_id, custom_cover_url')
          .eq('user_id', userId)
          .in('book_id', bookIds);

        if (userBooksData) {
          coverMap = new Map((userBooksData ?? []).map((ub: any) => [ub.book_id, ub.custom_cover_url]));
        }
      }

      // ✅ Construire les items même si books join est null (fallback)
      const cleaned = (likesData ?? []).map((x: any) => {
        if (x.books && x.book_uuid) {
          // Cas normal : join réussi
          return {
            liked_at: x.created_at,
            book: x.books,
            book_id: x.book_uuid,
            book_key: x.book_key,
            actor_custom_cover_url: coverMap.get(x.book_uuid) ?? null,
          };
        } else {
          // Fallback : construire un book object minimal depuis book_key
          const bookKey = x.book_key || '';
          let title = 'Métadonnées en cours…';
          let author = '—';
          let isbn: string | null = null;
          
          if (bookKey.startsWith('isbn:')) {
            isbn = bookKey.replace(/^isbn:/, '').replace(/[-\s]/g, '');
          }
          
          return {
            liked_at: x.created_at,
            book: {
              id: x.book_uuid || bookKey, // Use book_uuid if available, else book_key as id
              title,
              author,
              cover_url: null,
              isbn,
              openlibrary_cover_id: null,
              google_books_id: null,
              openlibrary_work_key: bookKey.startsWith('ol:') || bookKey.startsWith('/works/') ? bookKey : null,
            },
            book_id: x.book_uuid || bookKey,
            book_key: bookKey,
            actor_custom_cover_url: x.book_uuid ? (coverMap.get(x.book_uuid) ?? null) : null,
          };
        }
      });

      setLikedBooks(cleaned);
      
      // ✅ Source de vérité unique : stats.likes = cleaned.length
      setStats(prev => ({ ...prev, likes: cleaned.length }));
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

  const checkFollowing = async (): Promise<boolean> => {
    if (!user || userId === user.id) {
      setIsFollowing(false);
      return false;
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
      return false;
    }

    const following = !!data;
    console.log('[UserProfileView] checkFollowing result:', { userId, isFollowing: following, data });
    setIsFollowing(following);
    return following;
  };

  const handleFollowToggle = async () => {
    if (!user || userId === user.id) return;
    if (followLoading) return;

    setFollowLoading(true);

    try {
      const nextIsFollowing = !isFollowing;
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
        // Insert dans follows (trigger désactivé, on gère manuellement)
        const { error: followError } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: userId });

        if (followError) {
          console.error('Erreur lors du follow:', followError);
          // Si c'est un doublon, on continue quand même
          if (followError.code !== '23505') {
            return;
          }
        }

        // Créer manuellement la notification (trigger désactivé)
        await supabase
          .from('notifications')
          .insert({
            user_id: userId,
            actor_id: user.id,
            type: 'follow',
            read: false,
            created_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error && error.code !== '23505') {
              console.log('Info: notification non créée:', error.message);
            }
          });

        setIsFollowing(true);
        console.log('[UserProfileView] Follow créé avec succès !');
      }

      const visibilities = getAllowedVisibilities(nextIsFollowing);
      await Promise.all([
        loadStats(visibilities),
        loadWeeklyActivity(weeklyWeekOffset, visibilities),
        loadReadingStats(visibilities),
      ]);
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

  // ✅ Format interest tags (même logique que Profile)
  const formatInterestTag = (tag: string): { label: string; tone?: 'default' | 'accent' } => {
    const raw = (tag || '').trim();
    if (!raw) return { label: '' };

    const cleanSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

    // goal:1_books_month  -> Objectif: 1 livre/mois
    if (/^goal:/i.test(raw)) {
      const v = raw.replace(/^goal:/i, '').trim(); // "1_books_month"
      const m = v.match(/^(\d+)_books?_month$/i);
      if (m) {
        const n = Number(m[1]);
        return { label: `Objectif: ${n} ${n === 1 ? 'livre' : 'livres'}/mois`, tone: 'accent' };
      }
      return { label: 'Objectif', tone: 'accent' };
    }

    // Niveau: restarting / level: beginner
    if (/^(niveau|level)\s*:/i.test(raw)) {
      const v = raw.replace(/^(niveau|level)\s*:/i, '').trim().toLowerCase();
      const map: Record<string, string> = {
        restarting: 'Débutant',
        beginner: 'Débutant',
        intermediate: 'Intermédiaire',
        advanced: 'Avancé',
      };
      return { label: `Niveau: ${map[v] || v.charAt(0).toUpperCase() + v.slice(1)}`, tone: 'default' };
    }

    // generic cleanup
    let label = raw.replace(/[_-]+/g, ' ');
    label = cleanSpaces(label);
    label = label.charAt(0).toUpperCase() + label.slice(1);

    // truncate hard (avoid huge pills)
    if (label.length > 22) label = label.slice(0, 21) + '…';

    return { label, tone: 'default' };
  };

  if (showLibrary) {
    return (
      <UserLibraryView
        userId={userId}
        userName={profile.display_name}
        onClose={() => setShowLibrary(false)}
        mode={libraryMode === 'reading' ? 'reading' : 'all'}
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
        viewerIsFollowing={isFollowing || isOwner}
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
          paddingBottom: `calc(24px + ${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
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
        weeklyRangeLabel={weeklyRangeLabel}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        isCurrentWeek={weeklyWeekOffset === 0}
        weeklyLoading={weeklyLoading}
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
        onNavigateToLibrary={() => {
          setLibraryMode('all');
          setShowLibrary(true);
        }}
        onShowReadingLibrary={() => {
          setLibraryMode('reading');
          setShowLibrary(true);
        }}
        onShowAllLikedBooks={() => setShowLikedBooks(true)}
        onShowFollowers={() => setShowFollowersModal(true)}
        onShowFollowing={() => setShowFollowingModal(true)}
        onShowMyActivities={() => setShowUserActivities(true)}
        mode="user"
        viewedUserId={userId}
        formatInterestTag={formatInterestTag}
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
