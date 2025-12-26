import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Flame, BookOpen, Clock, LogOut, Edit, Users, Bell, UserPlus, Settings } from 'lucide-react';
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

interface ProfileProps {
  onNavigateToLibrary: () => void;
}

export function Profile({ onNavigateToLibrary }: ProfileProps) {
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
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [likedBooks, setLikedBooks] = useState<any[]>([]);
  const [selectedLikedBook, setSelectedLikedBook] = useState<any | null>(null);
  const [showAllLikedBooks, setShowAllLikedBooks] = useState(false);
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
      console.log('[loadWeeklyActivity] No profileId, skipping');
      setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
      return;
    }

    try {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      startOfWeek.setHours(0, 0, 0, 0);

      const start = startOfWeek.toISOString();
      if (!start || isNaN(new Date(start).getTime())) {
        console.error('[loadWeeklyActivity] Invalid start date:', start);
        setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
        return;
      }

      const { data: activities, error } = await supabase
        .from('activities')
        .select('pages_read, created_at')
        .eq('user_id', profileId)
        .gte('created_at', start)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[loadWeeklyActivity] activity_events error', {
          error,
          message: error.message,
          details: (error as any).details,
          hint: (error as any).hint,
          code: (error as any).code,
          profileId,
          start,
          end: today.toISOString(),
          queryContext: 'loadWeeklyActivity',
        });
        // Fallback: set empty activity data and continue render
        setWeeklyActivity([0, 0, 0, 0, 0, 0, 0]);
        return;
      }

      const weekData = [0, 0, 0, 0, 0, 0, 0];

      if (activities && activities.length > 0) {
        activities.forEach((activity) => {
          if (!activity.created_at) return;
          const activityDate = new Date(activity.created_at);
          if (isNaN(activityDate.getTime())) return;
          const dayIndex = activityDate.getDay();
          const pagesRead = activity.pages_read || 0;
          weekData[dayIndex] += pagesRead;
        });
      }

      setWeeklyActivity([...weekData]);
    } catch (err: any) {
      console.error('[loadWeeklyActivity] Unexpected error:', err);
      // Fallback: set empty activity data and continue render
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

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background-light">
        <div className="text-text-sub-light">Chargement du profil...</div>
      </div>
    );
  }

  if (showClubs) {
    return (
      <div className="max-w-2xl mx-auto">
        <AppHeader
          title="Retour au profil"
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
        title="Profil"
        rightActions={
          <>
            <button
              onClick={() => setShowSearchUsers(true)}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
              title="Ajouter des amis"
            >
              <UserPlus className="w-5 h-5 text-text-sub-light" />
            </button>
            <button
              onClick={() => setShowNotifications(true)}
              className="p-2 hover:bg-black/5 rounded-full transition-colors relative"
              title="Notifications"
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
              title="Se déconnecter"
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
              Modifier le profil
            </button>
            <button
              onClick={() => setShowNotificationSettings(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-card-light border-2 border-gray-200 text-text-main-light rounded-xl hover:bg-gray-50 transition-colors font-medium"
              title="Paramètres de notifications"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2.5 mb-5">
          <button
            onClick={() => setShowFollowersModal(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.followers}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center">Abonnés</p>
          </button>

          <button
            onClick={() => setShowFollowingModal(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.following}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center">Suivis</p>
          </button>

          <button
            onClick={onNavigateToLibrary}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.books}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center">Livres</p>
          </button>

          <button
            onClick={() => setShowAllLikedBooks(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.likes}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center">Aimés</p>
          </button>

          <div className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-primary text-black border border-primary shadow-md relative overflow-hidden aspect-square">
            <div className="absolute inset-0 opacity-10 flex items-center justify-center rotate-12">
              <Flame className="w-16 h-16" />
            </div>
            <p className="text-2xl font-bold leading-none relative z-10">{profile.current_streak}</p>
            <p className="text-[10px] text-black/70 font-bold relative z-10 text-center">Série</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-text-sub-light mb-1">
              <BookOpen className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">Pages</p>
            </div>
            <p className="text-3xl font-bold leading-none text-text-main-light">
              {(profile.total_pages_read / 1000).toFixed(1)}k
            </p>
            <p className="text-xs text-text-sub-light">Total lues</p>
          </div>

          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-text-sub-light mb-1">
              <Clock className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">Heures</p>
            </div>
            <p className="text-3xl font-bold leading-none text-text-main-light">{profile.total_hours_logged}</p>
            <p className="text-xs text-text-sub-light">Temps passé</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4 px-1">
            <h4 className="text-sm font-bold uppercase tracking-wider text-text-sub-light">Activité hebdomadaire</h4>
            <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded text-gray-600">
              {weeklyActivity.reduce((a, b) => a + b, 0)} Pages
            </span>
          </div>
          <div className="bg-card-light p-6 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex gap-4">
              <div className="flex flex-col justify-between h-40 py-1">
                {(() => {
                  const maxPages = Math.max(...weeklyActivity, 10);
                  const step = Math.ceil(maxPages / 4);
                  const yLabels = [step * 4, step * 3, step * 2, step, 0];
                  console.log('Rendering chart - weeklyActivity:', weeklyActivity, 'maxPages:', maxPages);
                  return yLabels.map((value, idx) => (
                    <span key={idx} className="text-[10px] text-gray-400 font-medium">{value}</span>
                  ));
                })()}
              </div>

              <div className="flex-1 flex items-end justify-between h-40 gap-2">
                {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, index) => {
                  const maxPages = Math.max(...weeklyActivity, 10);
                  const pages = weeklyActivity[index];
                  const heightPercent = maxPages > 0 ? (pages / maxPages) * 100 : 0;
                  console.log(`Day ${day} (${index}): pages=${pages}, height=${heightPercent}%`);
                  const today = new Date().getDay();
                  const isToday = index === today;

                  return (
                    <div key={index} className="flex flex-col items-center gap-2 flex-1 group">
                      <div className="w-full bg-gray-100 rounded-t-lg relative h-full flex items-end overflow-hidden">
                        {pages > 0 ? (
                          <div
                            className={`w-full rounded-t-lg transition-all duration-300 relative ${
                              isToday
                                ? 'bg-primary shadow-[0_0_15px_rgba(249,245,6,0.4)]'
                                : 'bg-primary/60 group-hover:bg-primary'
                            }`}
                            style={{ height: `${Math.max(heightPercent, 10)}%` }}
                          >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-text-main-light opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-white px-2 py-0.5 rounded shadow-sm">
                              {pages}p
                            </span>
                          </div>
                        ) : (
                          <div className="w-full h-1 bg-gray-200 rounded-t-lg"></div>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-text-main-light' : 'text-gray-400'}`}>
                        {day}
                      </span>
                    </div>
                  );
                })}
              </div>
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
                  const progress = book.total_pages > 0 ? Math.round((item.current_page / book.total_pages) * 100) : 0;
                  return (
                    <button
                      key={book.id}
                      onClick={() => setSelectedBookId(book.id)}
                      className="flex flex-col items-center shrink-0"
                      style={{ width: '64px' }}
                    >
                      <div className="relative w-16 h-24 mb-2 rounded-lg overflow-hidden shadow-md group cursor-pointer hover:shadow-xl transition-shadow">
                        <BookCover
                          coverUrl={book.cover_url}
                          title={book.title}
                          author={book.author || 'Auteur inconnu'}
                          className="w-full h-full"
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub-light">Livres aimés</h2>
            {likedBooks.length > 8 && (
              <button
                onClick={() => setShowAllLikedBooks(true)}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Voir plus
              </button>
            )}
          </div>
          
          {likedBooks.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-text-sub-light opacity-50" />
              <p className="text-sm text-text-sub-light">Aucun livre aimé pour l'instant</p>
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
                      console.log('[Profile] Opening liked book modal:', bookObj);
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
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub-light mb-3">Centres d'intérêt</h2>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest: string) => (
                <span
                  key={interest}
                  className="px-3 py-1.5 bg-gray-100 text-text-main-light rounded-lg text-sm font-medium"
                >
                  {interest}
                </span>
              ))}
            </div>
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
                <h3 className="font-bold text-text-main-light mb-0.5">Mes clubs</h3>
                <p className="text-sm text-text-sub-light">
                  {clubCount === 0 ? 'Rejoignez des clubs de lecture' : `${clubCount} club${clubCount !== 1 ? 's' : ''}`}
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

      {showSearchUsers && (
        <SearchUsersModal 
          onClose={() => {
            setShowSearchUsers(false);
          }}
          onUserClick={(userId) => {
            console.log('Clic sur profil:', userId);
            setShowSearchUsers(false);
            setViewingUserId(userId);
          }}
        />
      )}

      {selectedBookId && (
        <BookDetailsWithManagement
          bookId={selectedBookId}
          onClose={() => {
            setSelectedBookId(null);
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
              title="Tous les livres aimés"
              showBack
              onBack={() => setShowAllLikedBooks(false)}
            />
            <div className="p-4">
              {likedBooks.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 mx-auto mb-4 text-text-sub-light opacity-50" />
                  <p className="text-lg font-medium text-text-main-light mb-2">Aucun livre aimé</p>
                  <p className="text-sm text-text-sub-light">Commencez à liker des livres pour les voir ici</p>
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
                          console.log('[Profile] Opening liked book modal (all):', bookObj);
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
