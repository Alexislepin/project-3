import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { debugError } from '../utils/logger';
import { LogOut, Edit, Bell, UserPlus, Settings, Globe, BookOpen } from 'lucide-react';
import { setAppLanguage } from '../lib/appLanguage';
import { Clubs } from './Clubs';
import { EditProfileModal } from '../components/EditProfileModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { NotificationSettingsModal } from '../components/NotificationSettingsModal';
import { SearchUsersModal } from '../components/SearchUsersModal';
import { FollowersModal } from '../components/FollowersModal';
import { FollowingModal } from '../components/FollowingModal';
import { UserProfileView } from '../components/UserProfileView';
import { BookCover } from '../components/BookCover';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { AppHeader } from '../components/AppHeader';
import { LanguageSelectorModal } from '../components/LanguageSelectorModal';
import { ProfileLayout } from '../components/ProfileLayout';
import { computeReadingStats, computePR } from '../lib/readingStats';
import { LevelProgressBar } from '../components/LevelProgressBar';
import { LevelDetailsModal } from '../components/LevelDetailsModal';
import { computeStreakFromActivities } from '../lib/readingStreak';
import { MyActivities } from './MyActivities';
import { countRows } from '../lib/supabaseCounts';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';
import { XpHistoryModal } from '../components/XpHistoryModal';
import { fetchWeeklyActivity, weeklyActivityToPagesArray } from '../lib/weeklyActivity';

interface ProfileProps {
  onNavigateToLibrary: () => void;
}

export function Profile({ onNavigateToLibrary }: ProfileProps) {
  const { t } = useTranslation();
  const { profile: contextProfile, refreshProfile, profileLoading: contextProfileLoading } = useAuth();
  const [profile, setProfile] = useState<any>(contextProfile);
  const [stats, setStats] = useState({ followers: 0, following: 0, activities: 0, books: 0, likes: 0 });
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showClubs, setShowClubs] = useState(false);
  const [clubCount, setClubCount] = useState(0);
  const [showMyActivities, setShowMyActivities] = useState(false);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showSearchUsers, setShowSearchUsers] = useState(false);
  const [currentlyReading, setCurrentlyReading] = useState<any[]>([]);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [activityFocus, setActivityFocus] = useState<ActivityFocus | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [likedBooks, setLikedBooks] = useState<any[]>([]);
  const [showAllLikedBooks, setShowAllLikedBooks] = useState(false);
  const [selectedLikedBook, setSelectedLikedBook] = useState<any | null>(null);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [showXpHistory, setShowXpHistory] = useState(false);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [readingSpeed7d, setReadingSpeed7d] = useState<number | null>(null); // pages/h
  const [readingPace7d, setReadingPace7d] = useState<number | null>(null);  // min/page
  const [readingSpeedPR, setReadingSpeedPR] = useState<number | null>(null); // max pages/h
  const [readingPacePR, setReadingPacePR] = useState<number | null>(null);  // best (min) min/page
  const [hasSessions7d, setHasSessions7d] = useState(false);
  const [hasAnySessions, setHasAnySessions] = useState(false);
  const [totalPages7d, setTotalPages7d] = useState(0);
  const [totalMinutes7d, setTotalMinutes7d] = useState(0);
  const [totalPagesAllTime, setTotalPagesAllTime] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const { user, signOut } = useAuth();

  // Request guards to prevent stale requests from overwriting state
  const statsReqRef = useRef(0);
  const likedReqRef = useRef(0);
  const weeklyReqRef = useRef(0);
  const readingReqRef = useRef(0);
  const streakReqRef = useRef(0);

  // Sync with context profile
  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile);
      setProfileError(null);
    }
  }, [contextProfile]);

  useEffect(() => {
    if (!user?.id) return;

    // Use context profile if available, otherwise try to load
    if (contextProfile) {
      setProfile(contextProfile);
      setLoading(false);
    } else if (!contextProfileLoading) {
      // Only load if context is not loading
      loadProfile();
    }

    loadStats();
    loadClubCount();
    loadWeeklyActivity();
    loadCurrentlyReading();
    loadLikedBooks();
    loadUnreadNotificationsCount();
    loadReadingStats();
    loadStreak();

    const interval = setInterval(() => {
      loadUnreadNotificationsCount();
    }, 30000);

    const handleBookLikeChanged = () => {
      loadLikedBooks();
      loadStats();
    };

    const handleActivityCreated = () => {
      loadProfile();
      loadStats();
      loadWeeklyActivity();
      loadReadingStats();
      loadStreak();
    };

    const handleXpUpdated = async () => {
      // ✅ Source de vérité unique : refresh depuis DB uniquement
      // ❌ Ne pas modifier le state local directement
      if (user?.id) {
        await refreshProfile(user.id);
      }
    };

    window.addEventListener('book-like-changed', handleBookLikeChanged);
    window.addEventListener('activity-created', handleActivityCreated);
    window.addEventListener('xp-updated', handleXpUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('book-like-changed', handleBookLikeChanged);
      window.removeEventListener('activity-created', handleActivityCreated);
      window.removeEventListener('xp-updated', handleXpUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, contextProfile, contextProfileLoading]); // ✅ RETIRER viewingUserId

  const loadProfile = async () => {
    if (!user) return;

    setLoading(true);
    setProfileError(null);

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        debugError('[Profile] Error loading profile:', error);
        setProfileError('Erreur lors du chargement du profil');
        // Try to refresh from context
        await refreshProfile(user.id);
      } else if (data) {
        setProfile(data);
        setProfileError(null);
      } else {
        setProfileError('Profil introuvable');
        // Try to refresh from context
        await refreshProfile(user.id);
      }
    } catch (err: any) {
      debugError('[Profile] Error in loadProfile:', err);
      setProfileError('Erreur lors du chargement du profil');
      // Try to refresh from context
      if (user?.id) {
        await refreshProfile(user.id);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!user?.id) return;
    const profileId = user.id;

    const reqId = ++statsReqRef.current;
    try {
      const [followers, following, activities, books, likes] = await Promise.all([
        countRows('follows', q => q.eq('following_id', profileId)), // followers = ceux qui me suivent
        countRows('follows', q => q.eq('follower_id', profileId)),  // following = ceux que je suis
        countRows('activities', q => q.eq('user_id', profileId)),
        countRows('user_books', q => q.eq('user_id', profileId)),
        countRows('book_likes', q => q.eq('user_id', profileId)),
    ]);

      if (reqId !== statsReqRef.current) return; // ✅ ignore stale
      console.log('[loadStats counts]', { profileId, followers, following, activities, books, likes });
      setStats({ followers, following, activities, books, likes });
    } catch (e: any) {
      console.error('[loadStats] FAILED', e);
      // ✅ ne pas reset à 0 (sinon "flash 0")
    }
  };

  const loadReadingStats = async () => {
    if (!user?.id) return;
    const profileId = user.id;

    const reqId = ++readingReqRef.current;

    // last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceISO = since.toISOString();

    // 1) Total time (ALL TIME) -> fix "0 min"
    const { data: allActivities, error: allErr } = await supabase
      .from('activities')
      .select('pages_read, duration_minutes, reading_speed_pph, reading_pace_min_per_page, created_at, photos')
      .eq('user_id', profileId)
      .eq('type', 'reading')
      .order('created_at', { ascending: false });

    if (reqId !== readingReqRef.current) return; // ✅ ignore stale

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

    // total pages all time (single source of truth: activities)
    const totalPagesAll = all.reduce((acc, a) => acc + (Number(a.pages_read) || 0), 0);
    setTotalPagesAllTime(totalPagesAll);

    // total minutes
    const totalMins = all.reduce((acc, a) => acc + (Number(a.duration_minutes) || 0), 0);
    setTotalMinutes(totalMins);

    // Check if user has any sessions
    const hasAny = all.some(a => (Number(a.pages_read) > 0 || Number(a.duration_minutes) > 0));
    setHasAnySessions(hasAny);

    // Compute PR using centralized function
    const prResult = computePR(all, 30);
    setReadingSpeedPR(prResult.speedPph);
    setReadingPacePR(prResult.paceMinPerPage);

    // 2) 7d stats using centralized function
    const last7d = all.filter(a => a.created_at && new Date(a.created_at) >= new Date(sinceISO));

    const sumPages7d = last7d.reduce((acc, a) => acc + (Number(a.pages_read) || 0), 0);
    const sumMins7d  = last7d.reduce((acc, a) => acc + (Number(a.duration_minutes) || 0), 0);

    if (reqId !== readingReqRef.current) return; // ✅ ignore stale

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

  const loadClubCount = async () => {
    if (!user) return;

    // ✅ Remove count: 'exact' to avoid HEAD requests
    const { data } = await supabase
      .from('club_members')
      .select('id')
      .eq('user_id', user.id);

    setClubCount(data?.length || 0);
  };

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

  const loadWeeklyActivity = async () => {
    if (!user?.id) return;
    const profileId = user.id;

    const reqId = ++weeklyReqRef.current;

    try {
      // Use the centralized helper function
      const result = await fetchWeeklyActivity(profileId);

      if (reqId !== weeklyReqRef.current) return; // ✅ ignore stale

      // Convert to pages array for backward compatibility
      const weekData = weeklyActivityToPagesArray(result.days);
      setWeeklyActivity(weekData);
    } catch (e) {
      console.error('[loadWeeklyActivity] Unexpected:', e);
      setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
    }
  };

  const loadStreak = async () => {
    if (!user?.id) return;
    const profileId = user.id;

    const reqId = ++streakReqRef.current;

    try {
      // Load last 200 reading activities (wide range, we'll filter in local timezone)
      const { data: activities, error } = await supabase
        .from('activities')
        .select('created_at, pages_read, duration_minutes, type, photos')
        .eq('user_id', profileId)
        .eq('type', 'reading')
        .order('created_at', { ascending: false })
        .limit(200);

      if (reqId !== streakReqRef.current) return; // ✅ ignore stale

      if (error) {
        console.error('[loadStreak] Error:', error);
        setStreakDays(0);
        return;
      }

      // Compute streak from activities (local timezone)
      const streak = computeStreakFromActivities(activities || []);
      
      if (reqId !== streakReqRef.current) return; // ✅ ignore stale
      setStreakDays(streak);

      // Update profile's current_streak (always self profile)
        await supabase
          .from('user_profiles')
          .update({ current_streak: streak })
          .eq('id', user.id);
    } catch (error) {
      console.error('[loadStreak] Exception:', error);
      // ✅ ne pas reset à 0 (sinon "flash 0")
    }
  };

  const loadLikedBooks = async () => {
    if (!user?.id) return;
    const profileId = user.id;

    const reqId = ++likedReqRef.current;

    try {
      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select('book_key, created_at')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (reqId !== likedReqRef.current) return; // ✅ ignore stale

      if (likesError) {
        console.error('[loadLikedBooks] book_likes error:', likesError);
        setLikedBooks([]);
        return;
      }

      if (!likesData || likesData.length === 0) {
        setLikedBooks([]);
        return;
      }

      console.log('[loadLikedBooks] likes:', likesData.length);

      // Normalize variants (works + isbn)
      const normalizeKey = (key: string): string[] => {
        if (!key) return [];
        const k = key.trim();

        const out = new Set<string>();
        out.add(k);

        // ol:/works/.. -> /works/..
        if (k.startsWith('ol:/works/')) out.add(k.replace(/^ol:/, ''));

        // ol:OLxxxxW -> /works/OLxxxxW
        if (k.startsWith('ol:') && !k.startsWith('ol:/works/')) out.add(`/works/${k.replace(/^ol:/, '')}`);

        // /works/.. already ok
        if (k.startsWith('/works/')) out.add(k);

        // isbn:... keep as-is too (if you store isbn in cache)
        if (k.startsWith('isbn:')) out.add(k);

        return Array.from(out);
      };

      const rawKeys = likesData.map(l => l.book_key).filter(Boolean);
      const candidateKeys = Array.from(new Set(rawKeys.flatMap(normalizeKey)));

      console.log('[loadLikedBooks] candidateKeys sample:', candidateKeys.slice(0, 10));

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

      console.log('[loadLikedBooks] books_cache fetched:', (booksData ?? []).length);

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

      if (reqId !== likedReqRef.current) return; // ✅ ignore stale
      setLikedBooks(combined);
    } catch (error) {
      console.error('[loadLikedBooks] Unexpected error:', error);
      setLikedBooks([]);
    }
  };

  const loadCurrentlyReading = async () => {
    if (!user) return;

    const { data, error } = await supabase
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
          edition,
          openlibrary_cover_id
        ),
        custom_cover_url
      `)
      .eq('user_id', user.id)
      .eq('status', 'reading')
      .order('updated_at', { ascending: false });

    console.log('[user_books fetch Profile]', { statusFilter: 'reading', data, error });

    if (data) {
      console.log('[user_books fetch Profile] Data received:', data.length, 'books');
      setCurrentlyReading(data);
    } else {
      setCurrentlyReading([]);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

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

  // Show loading only if context is loading or local loading (and no error)
  if (contextProfileLoading || (loading && !profile && !profileError)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light">
        <div className="text-text-sub-light">{t('common.loadingProfile')}</div>
      </div>
    );
  }

  // Show error state if profile is missing and we have an error
  if (!profile && profileError) {
    return (
      <div className="min-h-screen bg-background-light flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <p className="text-text-main-light font-semibold mb-2">{profileError}</p>
          <button
            onClick={() => {
              if (user?.id) {
                setLoading(true);
                setProfileError(null);
                refreshProfile(user.id).then(() => {
                  setLoading(false);
                });
              }
            }}
            className="mt-4 px-4 py-2 bg-primary text-black rounded-lg font-medium hover:brightness-95"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // Fallback: if no profile and no error, try to load
  if (!profile && !loading) {
    loadProfile();
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light">
        <div className="text-text-sub-light">{t('common.loadingProfile')}</div>
      </div>
    );
  }

  if (showClubs) {
    return (
      <div className="max-w-2xl mx-auto">
        <AppHeader
          title={t('common.backToProfile')}
          showBack
          onBack={() => {
            setShowClubs(false);
            loadClubCount();
          }}
        />
        <div className="no-scrollbar">
          <Clubs />
        </div>
      </div>
    );
  }

  if (showMyActivities) {
  return (
      <MyActivities
        onClose={() => {
          setShowMyActivities(false);
          loadStats();
        }}
      />
    );
  }

  return (
    <div className="h-screen max-w-2xl mx-auto overflow-hidden">
      {/* Fixed Header - now truly fixed via AppHeader component */}
        <AppHeader
          title={t('profile.title')}
          rightActions={
            <>
              <button
                onClick={() => setShowSearchUsers(true)}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
                title={t('profile.followers')}
              >
                <UserPlus className="w-5 h-5 text-text-sub-light" />
              </button>
              <button
                onClick={() => setShowNotifications(true)}
                className="p-2 hover:bg-black/5 rounded-full transition-colors relative"
                title={t('common.notifications')}
              >
                <Bell className="w-5 h-5 text-text-sub-light" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleSignOut}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
                title={t('common.signOut')}
              >
                <LogOut className="w-5 h-5 text-text-sub-light" />
              </button>
            </>
          }
        />

      {/* ✅ SCROLL ICI - Single scrollable container with proper padding */}
      <div
        className="h-full overflow-y-auto"
        style={{
          paddingBottom: `calc(${TABBAR_HEIGHT}px + env(safe-area-inset-bottom) + 32px)`,
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y', // Allow vertical panning only
        }}
      >
        {/* Level Progress Bar */}
        {contextProfile?.xp_total !== undefined && (
          <div className="px-4 pt-4 pb-2">
            <div
              role="button"
              tabIndex={0}
              className="w-full cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Profile] Opening XP history modal');
                setShowXpHistory(true);
                requestAnimationFrame(() => {
                  console.log('[Profile] showXpHistory should be true now');
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  console.log('[Profile] Opening XP history modal (keyboard)');
                  setShowXpHistory(true);
                }
              }}
            >
              <LevelProgressBar 
                xpTotal={contextProfile.xp_total || 0} 
                variant="full"
                onClick={() => setShowLevelDetails(true)}
              />
            </div>
            <button
              onClick={() => setShowLevelDetails(true)}
              className="mt-3 text-base font-medium text-stone-600 underline hover:text-stone-800 transition-colors cursor-pointer w-full text-center"
              type="button"
            >
              Découvrir comment fonctionnent les niveaux
            </button>
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
        hasSessions7d={hasSessions7d}
        hasAnySessions={hasAnySessions}
        totalPages7d={totalPages7d}
        totalPagesAllTime={totalPagesAllTime}
        totalMinutes7d={totalMinutes7d}
        streakDays={streakDays}
        currentlyReading={currentlyReading}
        likedBooks={likedBooks}
        interests={profile.interests}
        clubCount={clubCount}
        actionButtons={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors font-medium"
            >
              <Edit className="w-4 h-4" />
              {t('profile.edit')}
            </button>
            <button
              onClick={() => setShowNotificationSettings(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-card-light border-2 border-gray-200 text-text-main-light rounded-xl hover:bg-gray-50 transition-colors font-medium"
              title={t('common.settings')}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowLanguageSelector(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-card-light border-2 border-gray-200 text-text-main-light rounded-xl hover:bg-gray-50 transition-colors font-medium"
              title={t('onboarding.language.title')}
            >
              <Globe className="w-4 h-4" />
            </button>
          </div>
        }
        onNavigateToLibrary={onNavigateToLibrary}
        onShowAllLikedBooks={() => setShowAllLikedBooks(true)}
        onShowFollowers={() => setShowFollowersModal(true)}
        onShowFollowing={() => setShowFollowingModal(true)}
        onShowClubs={() => setShowClubs(true)}
        onShowMyActivities={() => setShowMyActivities(true)}
        mode="self"
        viewedUserId={user?.id}
        formatInterestTag={formatInterestTag}
      />
      </div>

      {isEditModalOpen && (
        <EditProfileModal
          profile={profile}
          onClose={() => setIsEditModalOpen(false)}
          onSave={() => {
            loadProfile();
            loadStats();
          }}
        />
      )}

      {showNotifications && (
        <NotificationsModal 
          onClose={() => {
            setShowNotifications(false);
            loadUnreadNotificationsCount();
          }}
          onUserClick={(userId) => {
            setViewingUserId(userId);
            setShowNotifications(false);
          }}
          onOpenMyActivity={(activityId, commentId, notifType) => {
            // Ouvrir MON profil avec focus sur MON activité
            setShowNotifications(false);
            setViewingUserId(user?.id || null);
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

      {showNotificationSettings && (
        <NotificationSettingsModal onClose={() => setShowNotificationSettings(false)} />
      )}

      {showLanguageSelector && (
        <LanguageSelectorModal
          onClose={() => setShowLanguageSelector(false)}
          onLanguageChange={async (lang: 'fr' | 'en') => {
            // Use centralized function (single source of truth)
            await setAppLanguage(lang);
            setShowLanguageSelector(false);
          }}
        />
      )}

      {showLevelDetails && (
        <LevelDetailsModal onClose={() => setShowLevelDetails(false)} />
      )}

      {showXpHistory && (
        <XpHistoryModal
          open={showXpHistory}
          onClose={() => setShowXpHistory(false)}
          userId={user?.id}
          displayName={profile?.display_name ?? profile?.username ?? 'Toi'}
        />
      )}

      {showSearchUsers && (
        <SearchUsersModal 
          onClose={() => {
            setShowSearchUsers(false);
          }}
          onUserClick={(userId) => {
            setShowSearchUsers(false);
            setViewingUserId(userId);
          }}
        />
      )}


      {showAllLikedBooks && (
        <div className="fixed inset-0 bg-background-light z-[200] overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <AppHeader
              title={t('profile.allLikedBooks')}
              showBack
              onBack={() => setShowAllLikedBooks(false)}
            />
            <div className="p-4">
              {likedBooks.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-text-sub-light opacity-50" />
                  <p className="text-lg font-medium text-text-main-light mb-2">{t('profile.noLikedBooks')}</p>
                  <p className="text-sm text-text-sub-light">{t('profile.startLikingBooks')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {likedBooks.map((item) => {
                    const book = item.book;
                    if (!book) return null;

                    // Compute all cover-related values BEFORE return
                    const bookKey = item.book_key || '';
                    let isbn13: string | undefined;
                    let isbn10: string | undefined;
                    let openLibraryKey: string | undefined;

                    // Priority 1: Use book_key from books_cache (format: /works/OLxxxxW)
                    if (book.book_key && book.book_key.startsWith('/works/')) {
                      openLibraryKey = book.book_key;
                    } else if (bookKey.startsWith('ol:') || bookKey.startsWith('/works/')) {
                      // Fallback: Extract from item.book_key
                      const keyPart = bookKey.replace(/^ol:/, '').replace(/^\/works\//, '');
                      openLibraryKey = keyPart ? `/works/${keyPart}` : undefined;
                    }

                    // Priority 2: Extract ISBN from books_cache first
                    const cacheIsbn = book.isbn;
                    if (cacheIsbn) {
                      const cleanIsbn = cacheIsbn.replace(/[-\s]/g, '');
                      if (cleanIsbn.length === 13) {
                        isbn13 = cleanIsbn;
                      } else if (cleanIsbn.length === 10) {
                        isbn10 = cleanIsbn;
                      }
                    } else if (bookKey.startsWith('isbn:')) {
                      // Fallback: Extract from book_key
                      const isbn = bookKey.replace(/^isbn:/, '').replace(/[-\s]/g, '');
                      if (isbn.length === 13) {
                        isbn13 = isbn;
                      } else if (isbn.length === 10) {
                        isbn10 = isbn;
                      }
                    }


                    return (
                      <button
                        key={item.book_key}
                        onClick={() => {
                          const bookObj = {
                            id: item.book_key,         // Use book_key as id (not UUID)
                            book_key: item.book_key,  // string (ol:/works... or isbn:...)
                            title: book.title ?? 'Titre inconnu',
                            author: book.author ?? 'Auteur inconnu',
                            cover_url: book.cover_url ?? null,
                            thumbnail: book.cover_url ?? null,
                            openLibraryKey,
                            isbn13,
                            isbn10,
                          };
                          setSelectedLikedBook(bookObj);
                        }}
                        className="flex flex-col items-center"
                      >
                        <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-md cursor-pointer hover:shadow-xl transition-shadow">
                          <BookCover
                            coverUrl={book.cover_url || undefined}
                            title={book.title || ''}
                            author={book.author || ''}
                            className="w-full h-full"
                            isbn13={isbn13}
                            isbn10={isbn10}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFollowersModal && user && (
        <FollowersModal
          userId={user.id}
          onClose={() => setShowFollowersModal(false)}
          onUserClick={(userId) => {
            setViewingUserId(userId);
          }}
        />
      )}

      {showFollowingModal && user && (
        <FollowingModal
          userId={user.id}
          onClose={() => setShowFollowingModal(false)}
          onUserClick={(userId) => {
            setViewingUserId(userId);
          }}
        />
      )}

      {viewingUserId && (
        <div className="fixed inset-0 bg-background-light z-[200] overflow-y-auto" data-profile-view="true">
          <UserProfileView
            userId={viewingUserId}
            onClose={() => {
              setViewingUserId(null);
              setActivityFocus(null);
            }}
            onUserClick={(newUserId) => {
              setViewingUserId(newUserId);
              loadStats();
            }}
            activityFocus={activityFocus}
            onFocusConsumed={() => setActivityFocus(null)}
          />
        </div>
      )}

      {selectedLikedBook && (
        <BookDetailsModal
          book={selectedLikedBook}
          onClose={() => setSelectedLikedBook(null)}
        />
      )}
    </div>
  );
}
