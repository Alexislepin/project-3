import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { debugError } from '../utils/logger';
import { LogOut, Edit, Bell, UserPlus, HelpCircle, BookOpen, Shield, Bug, ArrowRight, Sun, Moon, Sparkles } from 'lucide-react';
import { Clubs } from './Clubs';
import { EditProfileModal } from '../components/EditProfileModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { SearchUsersModal } from '../components/SearchUsersModal';
import { FollowersModal } from '../components/FollowersModal';
import { FollowingModal } from '../components/FollowingModal';
import { UserProfileView } from '../components/UserProfileView';
import { BookCover } from '../components/BookCover';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { AppHeader } from '../components/AppHeader';
import { HelpCenterModal } from '../components/HelpCenterModal';
import { ProfileLayout } from '../components/ProfileLayout';
import { computeReadingStats, computePR } from '../lib/readingStats';
import { ActivityFocus } from '../lib/activityFocus';
import { isRealReadingSession } from '../lib/readingSessions';
import { LevelProgressBar } from '../components/LevelProgressBar';
import { LevelDetailsModal } from '../components/LevelDetailsModal';
import { fetchStreakInfo } from '../lib/streakService';
import { MyActivities } from './MyActivities';
import { countRows } from '../lib/supabaseCounts';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';
import { XpHistoryModal } from '../components/XpHistoryModal';
import { fetchWeeklyActivity, weeklyActivityToPagesArray, formatWeekRangeLabel } from '../lib/weeklyActivity';
import { resolveBookCover } from '../lib/bookCover';
import { canonicalBookKey } from '../lib/bookSocial';
import { useTheme } from '../contexts/ThemeContext';

interface ProfileProps {
  onNavigateToLibrary: () => void;
  onRestartTour: () => void;
}

export function Profile({ onNavigateToLibrary, onRestartTour }: ProfileProps) {
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
  const [weeklyWeekOffset, setWeeklyWeekOffset] = useState(0);
  const [weeklyRangeLabel, setWeeklyRangeLabel] = useState<string>('');
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
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
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [helpCenterView, setHelpCenterView] = useState<'home' | 'faq' | 'privacy' | 'bug'>('home');
  const [showXpHistory, setShowXpHistory] = useState(false);
  const [showLevelDetails, setShowLevelDetails] = useState(false);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [readingSpeed7d, setReadingSpeed7d] = useState<number | null>(null); // pages/h
  const [readingPace7d, setReadingPace7d] = useState<number | null>(null);  // min/page
  const [readingSpeedPR, setReadingSpeedPR] = useState<number | null>(null); // max pages/h
  const [readingPacePR, setReadingPacePR] = useState<number | null>(null);  // best (min) min/page
  const [bestSessionMinutes, setBestSessionMinutes] = useState<number | null>(null);
  const [hasSessions7d, setHasSessions7d] = useState(false);
  const [hasAnySessions, setHasAnySessions] = useState(false);
  const [totalPages7d, setTotalPages7d] = useState(0);
  const [totalMinutes7d, setTotalMinutes7d] = useState(0);
  const [totalPagesAllTime, setTotalPagesAllTime] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const { user, signOut } = useAuth();
  const { mode: themeMode, resolved: resolvedTheme, setMode: setThemeMode } = useTheme();

  // Request guards to prevent stale requests from overwriting state
  const statsReqRef = useRef(0);
  const likedReqRef = useRef(0);
  const weeklyReqRef = useRef(0);
  const readingReqRef = useRef(0);
  
  // Debounce pour éviter les races sur les likes
  const likeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    loadWeeklyActivity(0);
    loadCurrentlyReading();
    loadLikedBooks();
    loadUnreadNotificationsCount();
    loadReadingStats();
    loadStreak();

    const interval = setInterval(() => {
      loadUnreadNotificationsCount();
    }, 30000);

    const handleBookLikeChanged = (event: any) => {
      const { book_key, book_uuid, liked } = event.detail || {};
      
      // ✅ Update optimistic immédiat UNIQUEMENT pour UNLIKE (safe)
      if (book_key && liked === false) {
        // UNLIKE : retirer immédiatement l'item
        setLikedBooks(prev => prev.filter(item => {
          if (book_uuid && item.book_id === book_uuid) return false;
          if (item.book_key === book_key) return false;
          return true;
        }));
        // Décrémenter stats.likes (sans passer sous 0)
        setStats(prev => ({
          ...prev,
          likes: Math.max(0, prev.likes - 1)
        }));
      }
      
      // ✅ Pour LIKE : ne pas faire d'optimistic add (évite les placeholders "Métadonnées en cours…")
      // ✅ Debounce le refresh pour éviter les races
      if (likeRefreshTimeoutRef.current) {
        clearTimeout(likeRefreshTimeoutRef.current);
      }
      likeRefreshTimeoutRef.current = setTimeout(() => {
        loadLikedBooks();
        loadStats();
      }, 200);
    };

    // Also listen to book-social-counts-changed for consistency (dispatched by toggleBookLike RPC)
    const handleBookSocialCountsChanged = (event: any) => {
      const { bookKey, isLiked } = event.detail || {};
      
      // Only refresh if it's an unlike (to avoid placeholders for likes)
      if (bookKey && isLiked === false) {
        if (likeRefreshTimeoutRef.current) {
          clearTimeout(likeRefreshTimeoutRef.current);
        }
        likeRefreshTimeoutRef.current = setTimeout(() => {
          loadLikedBooks();
          loadStats();
        }, 200);
      }
    };

    const handleActivityCreated = () => {
      loadProfile();
      loadStats();
      loadWeeklyActivity();
      loadReadingStats();
      loadStreak();
    };

    const handleXpUpdated = async (event?: any) => {
      // ✅ Source de vérité unique : refresh depuis DB uniquement
      // ❌ Ne pas modifier le state local directement
      console.log('[Profile] xp-updated event received', event?.detail);
      if (user?.id) {
        await refreshProfile(user.id);
        // Also reload local profile to ensure UI updates
        loadProfile();
      }
    };

    window.addEventListener('book-like-changed', handleBookLikeChanged);
    window.addEventListener('book-social-counts-changed', handleBookSocialCountsChanged);
    window.addEventListener('activity-created', handleActivityCreated);
    window.addEventListener('xp-updated', handleXpUpdated);

    return () => {
      clearInterval(interval);
      if (likeRefreshTimeoutRef.current) {
        clearTimeout(likeRefreshTimeoutRef.current);
      }
      window.removeEventListener('book-like-changed', handleBookLikeChanged);
      window.removeEventListener('book-social-counts-changed', handleBookSocialCountsChanged);
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
      const [followers, following, activities, books] = await Promise.all([
        countRows('follows', q => q.eq('following_id', profileId)), // followers = ceux qui me suivent
        countRows('follows', q => q.eq('follower_id', profileId)),  // following = ceux que je suis
        countRows('activities', q => q.eq('user_id', profileId)),
        countRows('user_books', q => q.eq('user_id', profileId)),
        // ✅ likes est maintenant calculé depuis likedBooks.length (source de vérité unique)
    ]);

      if (reqId !== statsReqRef.current) return; // ✅ ignore stale
      console.log('[loadStats counts]', { profileId, followers, following, activities, books });
      // ✅ Garder likes depuis le state actuel (calculé depuis likedBooks)
      setStats(prev => ({ followers, following, activities, books, likes: prev.likes }));
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
    // Filter to only real reading sessions (pages > 0 AND duration > 0)
    const sessions = all.filter(isRealReadingSession);

    // total pages all time (single source of truth: real sessions only)
    const totalPagesAll = sessions.reduce((acc: number, a: any) => acc + (Number(a.pages_read) || 0), 0);
    setTotalPagesAllTime(totalPagesAll);

    // total minutes (real sessions only)
    const totalMins = sessions.reduce((acc: number, a: any) => acc + (Number(a.duration_minutes) || 0), 0);
    setTotalMinutes(totalMins);

    // Check if user has any real sessions
    const hasAny = sessions.length > 0;
    setHasAnySessions(hasAny);

    // Compute PR using centralized function (real sessions only)
    const prResult = computePR(sessions, 30);
    setReadingSpeedPR(prResult.speedPph);
    setReadingPacePR(prResult.paceMinPerPage);
    
    // Find the best session minutes (the session that achieved the PR)
    if (prResult.speedPph != null && prResult.paceMinPerPage != null) {
      const now = new Date();
      const lookbackDate = new Date(now);
      lookbackDate.setDate(lookbackDate.getDate() - 30);
      
      const recentActivities = sessions.filter((a: any) => {
        if (!a.created_at) return false;
        return new Date(a.created_at) >= lookbackDate;
      });
      
      let bestSessionMins: number | null = null;
      
      for (const a of recentActivities) {
        const pages = Number(a.pages_read) || 0;
        const mins = Number(a.duration_minutes) || 0;
        
        if (mins < 1 || pages < 5) continue;
        
        // Check if this session matches the PR
        let sessionPPH: number | null = null;
        if (a.reading_speed_pph != null) {
          sessionPPH = Number(a.reading_speed_pph);
        } else {
          sessionPPH = pages / (mins / 60);
        }
        
        // If this session's speed matches the PR (within tolerance), use its minutes
        if (sessionPPH != null && Math.abs(sessionPPH - prResult.speedPph) < 0.1) {
          bestSessionMins = mins;
          break;
        }
      }
      
      // Fallback: if no exact match, use the session with highest speed
      if (bestSessionMins == null) {
        let maxPPH = 0;
        for (const a of recentActivities) {
          const pages = Number(a.pages_read) || 0;
          const mins = Number(a.duration_minutes) || 0;
          if (mins < 1 || pages < 5) continue;
          
          const pph = a.reading_speed_pph != null ? Number(a.reading_speed_pph) : pages / (mins / 60);
          if (pph > maxPPH) {
            maxPPH = pph;
            bestSessionMins = mins;
          }
        }
      }
      
      setBestSessionMinutes(bestSessionMins);
    } else {
      setBestSessionMinutes(null);
    }

    // 2) 7d stats using centralized function (real sessions only)
    const last7d = sessions.filter((a: any) => a.created_at && new Date(a.created_at) >= new Date(sinceISO));

    const sumPages7d = last7d.reduce((acc: number, a: any) => acc + (Number(a.pages_read) || 0), 0);
    const sumMins7d  = last7d.reduce((acc: number, a: any) => acc + (Number(a.duration_minutes) || 0), 0);

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

  const loadWeeklyActivity = async (weekOffset = weeklyWeekOffset) => {
    if (!user?.id) return;
    const profileId = user.id;

    const reqId = ++weeklyReqRef.current;
    setWeeklyLoading(true);

    try {
      // Use the centralized helper function
      const result = await fetchWeeklyActivity(profileId, { weekOffset });

      if (reqId !== weeklyReqRef.current) return; // ✅ ignore stale

      // Convert to pages array for backward compatibility
      const weekData = weeklyActivityToPagesArray(result.days);
      setWeeklyActivity(weekData);
      if (result.weekStart && result.weekEnd) {
        setWeeklyRangeLabel(
          formatWeekRangeLabel(new Date(result.weekStart), new Date(result.weekEnd))
        );
      }
    } catch (e) {
      console.error('[loadWeeklyActivity] Unexpected:', e);
      // Ne pas écraser les données actuelles pour éviter un flash
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

  const loadStreak = async () => {
    if (!user?.id) return;

    try {
      // Use unified streak service (single source of truth)
      const info = await fetchStreakInfo(user.id);
      setStreakDays(info.streak);
      // Note: DB update is handled by fetchStreakInfo to avoid concurrent updates
    } catch (error) {
      console.error('[Profile] loadStreak exception:', error);
      // ✅ ne pas reset à 0 (sinon "flash 0")
    }
  };

  const loadLikedBooks = async () => {
    if (!user?.id) return;
    const profileId = user.id;

    const reqId = ++likedReqRef.current;
    console.log('[loadLikedBooks] req', reqId);

    try {
      // ✅ Utiliser book_uuid (UUID) avec join direct sur books via FK
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
        .eq('user_id', profileId)
        .is('deleted_at', null) // ✅ Seulement les likes actifs
        .not('book_uuid', 'is', null) // ✅ Cache les likes legacy (sans book_uuid)
        .order('created_at', { ascending: false })
        .limit(60);

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

      // ✅ Charger les covers custom depuis book_covers OU user_books.custom_cover_url
      const bookIds = (likesData ?? [])
        .map(x => x.book_uuid)
        .filter((id): id is string => !!id);

      // Essayer book_covers d'abord (table recommandée)
      const { data: coversData, error: coversError } = await supabase
        .from('book_covers')
        .select('book_id, cover_url')
        .eq('user_id', profileId)
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
          .eq('user_id', profileId)
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

      if (reqId !== likedReqRef.current) return; // ✅ ignore stale
      setLikedBooks(cleaned);
      
      // ✅ Source de vérité unique : stats.likes = cleaned.length
      setStats(prev => ({ ...prev, likes: cleaned.length }));
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
    <div className="h-screen max-w-2xl mx-auto overflow-hidden mb-5">
      {/* Fixed Header - now truly fixed via AppHeader component */}
        <AppHeader
          title={t('profile.title')}
          rightActions={
            <>
              <button
                onClick={() => setShowSearchUsers(true)}
                data-tour-target="profile-add-friend"
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
                onClick={() => setThemeMode(themeMode === 'light' ? 'dark' : 'light')}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
                title={`Thème : ${themeMode}`}
              >
                {resolvedTheme === 'dark' ? (
                  <Moon className="w-5 h-5 text-text-sub-light" />
                ) : (
                  <Sun className="w-5 h-5 text-text-sub-light" />
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
        className="h-full overflow-y-auto safe-bottom-content"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y', // Allow vertical panning only
          paddingBottom: `calc(32px + ${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
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
                onClick={() => setShowXpHistory(true)}
              />
            </div>
            <button
              onClick={() => setShowLevelDetails(true)}
              className="mt-2 text-xs text-stone-500 underline hover:text-stone-700 transition-colors cursor-pointer"
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
        bestSessionMinutes={bestSessionMinutes}
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
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-accent rounded-xl hover:brightness-95 transition-colors font-medium"
            >
              <Edit className="w-4 h-4" />
              {t('profile.edit')}
            </button>
            <button
              onClick={() => setShowHelpCenter(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface border-2 border-border text-text-main rounded-xl hover:bg-surface-2 transition-colors font-medium"
              title="Centre d'aide"
            >
              <HelpCircle className="w-4 h-4" />
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

      {/* Centre d'aide - 3 cartes cliquables en bas */}
      <div 
        className="px-4 pt-4 space-y-4"
        style={{
          paddingBottom: `calc(24px + ${TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`,
        }}
      >
        <div
          onClick={() => {
            setHelpCenterView('faq');
            setShowHelpCenter(true);
          }}
          className="flex items-center justify-between p-4 bg-card-light rounded-xl border border-gray-200 cursor-pointer hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <HelpCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-text-main-light">Aide (FAQ)</h3>
              <p className="text-sm text-text-sub-light">Questions fréquentes</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-text-sub-light" />
        </div>

        <div
          onClick={onRestartTour}
          data-tour-target="profile-restart-tour"
          className="flex items-center justify-between p-4 bg-card-light rounded-xl border border-gray-200 cursor-pointer hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <Sparkles className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-text-main-light">Relancer le tutoriel</h3>
              <p className="text-sm text-text-sub-light">Revoir le guide pas à pas</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-text-sub-light" />
        </div>

        <div
          onClick={() => {
            setHelpCenterView('privacy');
            setShowHelpCenter(true);
          }}
          className="flex items-center justify-between p-4 bg-card-light rounded-xl border border-gray-200 cursor-pointer hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-text-main-light">Confidentialité</h3>
              <p className="text-sm text-text-sub-light">Données et vie privée</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-text-sub-light" />
        </div>

        <div
          onClick={() => {
            setHelpCenterView('bug');
            setShowHelpCenter(true);
          }}
          className="flex items-center justify-between p-4 bg-card-light rounded-xl border border-gray-200 cursor-pointer hover:bg-surface-2 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <Bug className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-text-main-light">Signaler un bug</h3>
              <p className="text-sm text-text-sub-light">Problème technique ?</p>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-text-sub-light" />
        </div>
      </div>
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

      {showHelpCenter && (
        <HelpCenterModal
          open={showHelpCenter}
          onClose={() => {
            setShowHelpCenter(false);
            setHelpCenterView('home'); // Reset view when closing
          }}
          initialView={helpCenterView}
          onOpenScanner={() => {
            window.dispatchEvent(new CustomEvent('open-scanner'));
          }}
          onOpenXpInfo={() => {
            setShowHelpCenter(false);
            setShowLevelDetails(true);
          }}
          onOpenManualAdd={() => {
            window.dispatchEvent(new CustomEvent('open-manual-add'));
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
            <div className="p-4 mb-5">
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

                    // Priority 1: Use openlibrary_work_key from books table
                    if (book.openlibrary_work_key && book.openlibrary_work_key.startsWith('/works/')) {
                      openLibraryKey = book.openlibrary_work_key;
                    } else if (bookKey.startsWith('ol:') || bookKey.startsWith('/works/')) {
                      // Fallback: Extract from item.book_key
                      const keyPart = bookKey.replace(/^ol:/, '').replace(/^\/works\//, '');
                      openLibraryKey = keyPart ? `/works/${keyPart}` : undefined;
                    }

                    // Priority 2: Extract ISBN from books table
                    const bookIsbn = book.isbn;
                    if (bookIsbn) {
                      const cleanIsbn = bookIsbn.replace(/[-\s]/g, '');
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

                    // ✅ Utiliser resolveBookCover (fonction canonique)
                    const cover = resolveBookCover({
                      customCoverUrl: item.actor_custom_cover_url || null,
                      coverUrl: book?.cover_url || null,
                    });

                    // Safe title/author (avoid displaying placeholder values)
                    const safeTitle =
                      !book.title || book.title === '(OpenLibrary book)' ? 'Métadonnées en cours…' : book.title;

                    const safeAuthor =
                      !book.author || book.author === 'Auteur inconnu' ? 'Métadonnées en cours…' : book.author;

                    return (
                      <button
                        key={item.book_id || item.book_key}
                        onClick={() => {
                          const bookObj = {
                            id: item.book_id,            // ✅ UUID
                            book_uuid: item.book_id,     // ✅ explicite
                            book_key: item.book_key,
                            title: safeTitle,
                            author: safeAuthor,
                            cover_url: cover ?? null,
                            thumbnail: cover ?? null,
                            custom_cover_url: item.actor_custom_cover_url || null, // ✅ Passer custom_cover_url
                            openLibraryKey,
                            isbn13,
                            isbn10,
                            openlibrary_cover_id: book.openlibrary_cover_id || null,
                            google_books_id: book.google_books_id || null,
                            openlibrary_work_key: book.openlibrary_work_key || null,
                          };
                          setSelectedLikedBook(bookObj);
                        }}
                        className="flex flex-col items-center"
                      >
                        <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-md cursor-pointer hover:shadow-xl transition-shadow">
                          <BookCover
                            custom_cover_url={item.actor_custom_cover_url || null}
                            coverUrl={cover || undefined}
                            title={safeTitle}
                            author={safeAuthor}
                            className="w-full h-full"
                            isbn={book.isbn || null}
                            isbn13={isbn13}
                            isbn10={isbn10}
                            openlibrary_cover_id={book.openlibrary_cover_id || null}
                            googleCoverUrl={book.google_books_id ? `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : null}
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
