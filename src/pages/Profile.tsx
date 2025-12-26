import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Flame, BookOpen, Clock, LogOut, Edit, Users, Bell, UserPlus, Settings, Globe } from 'lucide-react';
import { setAppLanguage } from '../lib/appLanguage';
import { Clubs } from './Clubs';
import { EditProfileModal } from '../components/EditProfileModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { NotificationSettingsModal } from '../components/NotificationSettingsModal';
import { SearchUsersModal } from '../components/SearchUsersModal';
import { BookDetailsWithManagement } from '../components/BookDetailsWithManagement';
import { FollowersModal } from '../components/FollowersModal';
import { FollowingModal } from '../components/FollowingModal';
import { UserProfileView } from '../components/UserProfileView';
import { BookCover } from '../components/BookCover';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { AppHeader } from '../components/AppHeader';
import { LanguageSelectorModal } from '../components/LanguageSelectorModal';

interface ProfileProps {
  onNavigateToLibrary: () => void;
}

export function Profile({ onNavigateToLibrary }: ProfileProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, activities: 0, books: 0, likes: 0 });
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showClubs, setShowClubs] = useState(false);
  const [clubCount, setClubCount] = useState(0);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showSearchUsers, setShowSearchUsers] = useState(false);
  const [currentlyReading, setCurrentlyReading] = useState<any[]>([]);
  const [selectedUserBook, setSelectedUserBook] = useState<any | null>(null);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [likedBooks, setLikedBooks] = useState<any[]>([]);
  const [selectedLikedBook, setSelectedLikedBook] = useState<any | null>(null);
  const [showAllLikedBooks, setShowAllLikedBooks] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const { user, signOut } = useAuth();

  useEffect(() => {
    loadProfile();
    loadStats();
    loadClubCount();
    loadWeeklyActivity();
    loadCurrentlyReading();
    loadLikedBooks();
    loadUnreadNotificationsCount();

    const interval = setInterval(() => {
      loadWeeklyActivity();
      loadStats();
      loadUnreadNotificationsCount();
    }, 30000);

    // Listen for book-like-changed events to refresh liked books and stats
    const handleBookLikeChanged = () => {
      console.log('[Profile] Book like changed, refreshing liked books and stats...');
      loadLikedBooks();
      loadStats(); // Also refresh stats to update likes count
    };
    
    window.addEventListener('book-like-changed', handleBookLikeChanged);

    return () => {
      clearInterval(interval);
      window.removeEventListener('book-like-changed', handleBookLikeChanged);
    };
  }, [user, viewingUserId]);

  const loadProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    if (!user) return;

    const profileId = viewingUserId || user.id;

    const { count: followersCount } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', profileId);

    const { count: followingCount } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', profileId);

    const { count: activitiesCount } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profileId);

    const { count: booksCount } = await supabase
      .from('user_books')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profileId);

    const { count: likesCount } = await supabase
      .from('book_likes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profileId);

    setStats({
      followers: followersCount || 0,
      following: followingCount || 0,
      activities: activitiesCount || 0,
      books: booksCount || 0,
      likes: likesCount || 0,
    });
  };

  const loadClubCount = async () => {
    if (!user) return;

    const { count } = await supabase
      .from('club_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    setClubCount(count || 0);
  };

  const loadUnreadNotificationsCount = async () => {
    if (!user) return;

    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);

    setUnreadNotificationsCount(count || 0);
  };

  const loadWeeklyActivity = async () => {
    const profileId = viewingUserId || user?.id;
    if (!profileId) {
      setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
      return;
    }

    try {
      const now = new Date();

      // Start of week (Monday 00:00 local)
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay(); // 0=Sun ... 6=Sat
      const diffToMonday = (day + 6) % 7; // Mon=0, Tue=1, ... Sun=6
      startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);
      startOfWeek.setHours(0, 0, 0, 0);

      const startISO = startOfWeek.toISOString();

      const { data: activities, error } = await supabase
        .from('activities')
        .select('pages_read, created_at')
        .eq('user_id', profileId)
        .gte('created_at', startISO)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[loadWeeklyActivity] Error:', error);
        setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
        return;
      }

      const weekData = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun

      for (const a of activities ?? []) {
        if (!a.created_at) continue;

        const d = new Date(a.created_at);

        // Convert to "Monday-based" index (Mon=0 ... Sun=6)
        const js = d.getDay(); // Sun=0..Sat=6
        const idx = (js + 6) % 7;

        weekData[idx] += Number(a.pages_read) || 0;
      }

      setWeeklyActivity(weekData);
    } catch (e) {
      console.error('[loadWeeklyActivity] Unexpected:', e);
      setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
    }
  };

  const loadLikedBooks = async () => {
    if (!user) return;

    try {
      const profileId = viewingUserId || user.id;

      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select('book_key, created_at')
        .eq('user_id', profileId)
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
          edition
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'reading')
      .limit(4);

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

  if (loading || !profile) {
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

  return (
    <div className="max-w-2xl mx-auto">
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

      <div className="px-4 pt-4 pb-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-4">
            <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center text-4xl font-bold text-text-main-light border-4 border-white shadow-lg overflow-hidden">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
              ) : (
                profile.display_name.charAt(0).toUpperCase()
              )}
            </div>
            {profile.current_streak > 0 && (
              <div className="absolute bottom-0 right-0 bg-primary text-black rounded-full p-1.5 border-4 border-background-light flex items-center justify-center">
                <Flame className="w-5 h-5 fill-black" />
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">{profile.display_name}</h1>
          <p className="text-text-sub-light text-sm mb-3">@{profile.username}</p>
          {profile.bio && (
            <p className="text-text-sub-light text-sm max-w-md mb-4">{profile.bio}</p>
          )}
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
        </div>

        <div className="grid grid-cols-5 gap-2.5 mb-5">
          <button
            onClick={() => setShowFollowersModal(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.followers}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center whitespace-nowrap">{t('profile.followers')}</p>
          </button>

          <button
            onClick={() => setShowFollowingModal(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.following}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center whitespace-nowrap">{t('profile.following')}</p>
          </button>

          <button
            onClick={onNavigateToLibrary}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.books}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center whitespace-nowrap">{t('profile.booksShort')}</p>
          </button>

          <button
            onClick={() => setShowAllLikedBooks(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.likes}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center whitespace-nowrap">{t('profile.likedBooks')}</p>
          </button>

          <div className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-primary text-black border border-primary shadow-md relative overflow-hidden aspect-square">
            <div className="absolute inset-0 opacity-10 flex items-center justify-center rotate-12">
              <Flame className="w-16 h-16" />
            </div>
            <p className="text-2xl font-bold leading-none relative z-10">{profile.current_streak}</p>
            <p className="text-[10px] text-black/70 font-bold relative z-10 text-center">{t('profile.streak')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-text-sub-light mb-1">
              <BookOpen className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">{t('profile.pages')}</p>
            </div>
            <p className="text-3xl font-bold leading-none text-text-main-light">
              {(profile.total_pages_read / 1000).toFixed(1)}k
            </p>
            <p className="text-xs text-text-sub-light">{t('profile.totalRead')}</p>
          </div>

          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-text-sub-light mb-1">
              <Clock className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">{t('profile.hours')}</p>
            </div>
            <p className="text-3xl font-bold leading-none text-text-main-light">{profile.total_hours_logged}</p>
            <p className="text-xs text-text-sub-light">{t('profile.timeSpent')}</p>
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-3 px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub-light">
              {t('profile.weeklyActivity')}
            </h4>
            <span className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded-lg text-gray-700">
              {weeklyActivity.reduce((a, b) => a + b, 0)} {t('library.pages')}
            </span>
          </div>

          <div className="bg-card-light px-4 py-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex items-end justify-between gap-2">
              {(() => {
                const maxPages = Math.max(...weeklyActivity, 10);
                const dayShort = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

                return weeklyActivity.map((pages, index) => {
                  const height = Math.round((pages / maxPages) * 100);

                  const isToday = (() => {
                    const today = new Date();
                    const todayIdx = (today.getDay() + 6) % 7;
                    return index === todayIdx;
                  })();

                  return (
                    <div key={index} className="flex flex-col items-center gap-2 flex-1">
                      {/* Barre */}
                      <div className="w-full h-24 bg-gray-100 rounded-xl flex items-end overflow-hidden">
                        <div
                          className={`w-full transition-all duration-500 ${isToday ? 'bg-primary' : 'bg-primary/50'}`}
                          style={{
                            height: pages > 0 ? `${Math.max(height, 10)}%` : '6px',
                          }}
                          title={`${pages} pages`}
                        />
                      </div>

                      {/* Label */}
                      <div className="flex flex-col items-center leading-none">
                        <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-text-main-light' : 'text-gray-400'}`}>
                          {dayShort[index]}
                        </span>
                        {/* petit chiffre optionnel en dessous (super lisible) */}
                        <span className="text-[10px] text-gray-400 font-medium mt-1">
                          {pages || ''}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {currentlyReading.length > 0 && (
          <div className="bg-card-light rounded-xl border border-gray-200 p-5 shadow-sm mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub-light mb-4">En cours de lecture</h2>
            <div className="overflow-x-auto -mx-5 px-5 scrollbar-hide">
              <div className="flex flex-nowrap gap-3">
                {currentlyReading.map((item: any) => {
                  const book = item.book;
                  if (!book) {
                    console.warn('CurrentlyReading item without book data:', item);
                    return null;
                  }
                  const progress = (book.total_pages && book.total_pages > 0) ? Math.round((item.current_page / book.total_pages) * 100) : 0;
                  
                  // Extract ISBN for BookCover fallback
                  const rawIsbn = (book.isbn || '').replace(/[-\s]/g, '');
                  const isbn13 = rawIsbn.length === 13 ? rawIsbn : undefined;
                  const isbn10 = rawIsbn.length === 10 ? rawIsbn : undefined;
                  
                  return (
                    <button
                      key={book.id}
                      onClick={() => setSelectedUserBook(item)}
                      className="flex flex-col items-center shrink-0"
                      style={{ width: '64px' }}
                    >
                      <div className="relative w-16 h-24 mb-2 rounded-lg overflow-hidden shadow-md group cursor-pointer hover:shadow-xl transition-shadow">
                        <BookCover
                          coverUrl={book.cover_url || undefined}
                          title={book.title}
                          author={book.author || 'Auteur inconnu'}
                          className="w-full h-full"
                          isbn13={isbn13}
                          isbn10={isbn10}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end p-2">
                          <div className="text-white text-xs font-bold mb-1">{progress}%</div>
                          <div className="text-white text-[9px] text-center line-clamp-2 font-medium">{book.title}</div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="bg-card-light rounded-xl border border-gray-200 p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub-light">{t('profile.likedBooksTitle')}</h2>
            {likedBooks.length > 8 && (
              <button
                onClick={() => setShowAllLikedBooks(true)}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {t('common.viewMore')}
              </button>
            )}
          </div>
          
          {likedBooks.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-text-sub-light opacity-50" />
              <p className="text-sm text-text-sub-light">{t('profile.noLikedBooksYet')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {likedBooks.slice(0, 8).map((item) => {
                const book = item.book;
                if (!book) return null;

                // Parser book_key pour extraire openLibraryKey, isbn, etc.
                const bookKey = item.book_key || '';
                let openLibraryKey: string | undefined;
                let isbn13: string | undefined;
                let isbn10: string | undefined;

                // Priority 1: Use book_key from books_cache (format: /works/OLxxxxW)
                if (book.book_key && book.book_key.startsWith('/works/')) {
                  openLibraryKey = book.book_key;
                } else if (bookKey.startsWith('ol:') || bookKey.startsWith('/works/')) {
                  // Fallback: Extract from item.book_key
                  const keyPart = bookKey.replace(/^ol:/, '').replace(/^\/works\//, '');
                  openLibraryKey = keyPart ? `/works/${keyPart}` : undefined;
                }

                // Priority 2: Extract ISBN from books_cache
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
                      // Create book object for modal
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

        {profile.interests && profile.interests.length > 0 && (
          <div className="bg-card-light rounded-xl border border-gray-200 p-5 shadow-sm mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub-light mb-3">
              {t('profile.interests')}
            </h2>

            {(() => {
              const interests: string[] = Array.isArray(profile.interests) ? profile.interests : [];
              const shown = interests.slice(0, 6);
              const extra = Math.max(0, interests.length - shown.length);

              return (
                <div className="flex flex-wrap gap-2">
                  {shown.map((interest: string) => {
                    const ft = formatInterestTag(interest);
                    const isAccent = ft.tone === 'accent';

                    return (
                      <span
                        key={interest}
                        className={[
                          "px-3 py-1.5 rounded-full text-xs font-semibold border max-w-full truncate",
                          isAccent
                            ? "bg-primary/20 border-primary/30 text-text-main-light"
                            : "bg-gray-100 border-gray-200 text-text-main-light",
                        ].join(' ')}
                        title={interest}
                      >
                        {ft.label}
                      </span>
                    );
                  })}

                  {extra > 0 && (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-gray-100 border-gray-200 text-text-main-light">
                      +{extra}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <button
          onClick={() => setShowClubs(true)}
          className="w-full bg-card-light rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all hover:border-lime-300"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-lime-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-lime-800" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-text-main-light mb-0.5">{t('profile.myClubs')}</h3>
                <p className="text-sm text-text-sub-light">
                  {clubCount === 0 ? t('profile.joinReadingClubs') : `${clubCount} club${clubCount !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <svg className="w-5 h-5 text-text-sub-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
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

      {selectedUserBook?.book?.id && (
        <BookDetailsWithManagement
          bookId={selectedUserBook.book.id}
          userBookId={selectedUserBook.id}
          currentPage={selectedUserBook.current_page || 0}
          onClose={() => {
            setSelectedUserBook(null);
            loadCurrentlyReading();
            loadStats();
          }}
        />
      )}

      {selectedLikedBook && (
        <BookDetailsModal
          book={selectedLikedBook}
          onClose={() => setSelectedLikedBook(null)}
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
                          setShowAllLikedBooks(false);
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
              loadStats();
            }}
            onUserClick={(newUserId) => {
              setViewingUserId(newUserId);
              loadStats();
            }}
          />
        </div>
      )}
    </div>
  );
}
