import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Flame, BookOpen, Clock, UserPlus, UserCheck, Heart } from 'lucide-react';
import { FollowersModal } from './FollowersModal';
import { FollowingModal } from './FollowingModal';
import { UserLibraryView } from './UserLibraryView';
import { BookCover } from './BookCover';
import { BookDetailsModal } from './BookDetailsModal';
import { AppHeader } from './AppHeader';

interface UserProfileViewProps {
  userId: string;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

export function UserProfileView({ userId, onClose, onUserClick }: UserProfileViewProps) {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, activities: 0, books: 0, likedBooks: 0 });
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLikedBooks, setShowLikedBooks] = useState(false);
  const [readingPreviewBooks, setReadingPreviewBooks] = useState<any[]>([]);
  const [likedPreviewBooks, setLikedPreviewBooks] = useState<any[]>([]);
  const [selectedBook, setSelectedBook] = useState<any | null>(null);
  const { user } = useAuth();

  const handleUserClick = (clickedUserId: string) => {
    if (onUserClick) {
      onUserClick(clickedUserId);
    }
    // Si pas de callback, on ne fait rien (l'utilisateur reste sur le même profil)
  };

  useEffect(() => {
    let mounted = true;

    const loadAll = async () => {
      if (!userId || !user) return;

      console.log('UserProfileView useEffect triggered:', { userId, currentUserId: user.id });
      setLoading(true);
      // Ne pas réinitialiser isFollowing ici pour éviter le flash
      // checkFollowing() va mettre à jour la valeur correcte

      // Chargement séquentiel pour éviter les race conditions
      try {
        await loadProfile();
        if (!mounted) return;

        await loadStats();
        if (!mounted) return;

        await loadPreviewBooks();
        if (!mounted) return;

        await checkFollowing();
        if (!mounted) return;
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
    const { count: followersCount, error: followersError } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    if (followersError) {
      console.error('=== FOLLOWS ERROR (UserProfileView - followersCount) ===');
      console.error('Full error:', followersError);
      console.error('Message:', followersError.message);
      console.error('Details:', followersError.details);
      console.error('Hint:', followersError.hint);
      console.error('Code:', followersError.code);
      console.error('Query:', `follows?select=*&following_id=eq.${userId}`);
    }

    const { count: followingCount, error: followingError } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    if (followingError) {
      console.error('=== FOLLOWS ERROR (UserProfileView - followingCount) ===');
      console.error('Full error:', followingError);
      console.error('Message:', followingError.message);
      console.error('Details:', followingError.details);
      console.error('Hint:', followingError.hint);
      console.error('Code:', followingError.code);
      console.error('Query:', `follows?select=*&follower_id=eq.${userId}`);
    }

    const { count: activitiesCount } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('visibility', 'public');

    // Pour les livres, on récupère les données au lieu d'utiliser count
    // car les politiques RLS peuvent bloquer count mais permettre select
    // On compte les book_key uniques si la colonne existe, sinon on compte les rows
    const { data: userBooks, error: booksError } = await supabase
      .from('user_books')
      .select('book_id, book:books(book_key)')
      .eq('user_id', userId);

    console.log('=== DEBUG User Books ===');
    console.log('UserId:', userId);
    console.log('Current user:', user?.id);
    console.log('Books data:', userBooks);
    console.log('Books error:', booksError);
    if (booksError) {
      console.error('ERROR DETAILS:', {
        message: booksError.message,
        details: booksError.details,
        hint: booksError.hint,
        code: booksError.code
      });
    }

    // Compter les book_key uniques si disponibles, sinon compter les book_id uniques
    let booksCount = 0;
    if (userBooks && userBooks.length > 0) {
      const uniqueBookKeys = new Set<string>();
      userBooks.forEach((ub: any) => {
        if (ub.book?.book_key) {
          uniqueBookKeys.add(ub.book.book_key);
        } else if (ub.book_id) {
          uniqueBookKeys.add(String(ub.book_id));
        }
      });
      booksCount = uniqueBookKeys.size;
    }

    // Compter les livres likés depuis activity_events
    const { data: likedEvents, error: likedError } = await supabase
      .from('activity_events')
      .select('book_key')
      .eq('actor_id', userId)
      .eq('event_type', 'book_like');

    let likedCount = 0;
    if (likedEvents && likedEvents.length > 0) {
      const uniqueLikedKeys = new Set(likedEvents.map(e => e.book_key).filter(Boolean));
      likedCount = uniqueLikedKeys.size;
    }

    if (likedError) {
      console.error('[loadStats] Error fetching liked books:', likedError);
    }

    setStats({
      followers: followersCount || 0,
      following: followingCount || 0,
      activities: activitiesCount || 0,
      books: booksCount,
      likedBooks: likedCount,
    });
  };

  const loadPreviewBooks = async () => {
    // Load reading preview (max 8)
    const { data: readingBooks } = await supabase
      .from('user_books')
      .select('book_id, book:books(book_key, title, author, cover_url)')
      .eq('user_id', userId)
      .eq('status', 'reading')
      .order('updated_at', { ascending: false })
      .limit(8);

    if (readingBooks && readingBooks.length > 0) {
      // Use book data directly if available, otherwise fetch from books_cache
      const previewData = readingBooks
        .map((ub: any) => {
          if (ub.book?.book_key) {
            return {
              book_key: ub.book.book_key,
              title: ub.book.title,
              author: ub.book.author,
              cover_url: ub.book.cover_url,
            };
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, 8);

      setReadingPreviewBooks(previewData);
    } else {
      setReadingPreviewBooks([]);
    }

    // Load liked preview (max 8)
    const { data: likedEvents } = await supabase
      .from('activity_events')
      .select('book_key')
      .eq('actor_id', userId)
      .eq('event_type', 'book_like')
      .order('created_at', { ascending: false })
      .limit(8);

    const likedBookKeys = likedEvents?.map(e => e.book_key).filter(Boolean) || [];

    if (likedBookKeys.length > 0) {
      const { data: booksData, error } = await supabase
        .from('books_cache')
        .select('book_key, title, author, cover_url')
        .in('book_key', likedBookKeys);

      if (error) {
        console.error('[loadPreviewBooks] Error fetching liked books from cache:', error);
        setLikedPreviewBooks([]);
      } else {
        setLikedPreviewBooks(booksData?.slice(0, 8) || []);
      }
    } else {
      setLikedPreviewBooks([]);
    }
  };

  const checkFollowing = async () => {
    if (!user || userId === user.id) {
      console.log('checkFollowing skipped:', { hasUser: !!user, userId, currentUserId: user?.id });
      return;
    }

    const { data, error } = await supabase
      .from('follows')
      .select('follower_id, following_id') // ✅ pas de "id" car PK composite
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
        // ✅ upsert empêche le 409 si déjà existant
        const { error: followError } = await supabase
          .from('follows')
          .upsert(
            { follower_id: user.id, following_id: userId },
            { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
          );

        // Fallback si supabase renvoie quand même 409 dans certains cas
        if (followError && (followError as any).code !== '23505') {
          console.error('Erreur lors du follow:', followError);
          return;
        }

        setIsFollowing(true);
      }

      // Refresh stats + status (safe)
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

  // Si on affiche la bibliothèque, on montre UserLibraryView
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

  // Si on affiche les livres likés, on montre UserLibraryView en mode liked
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

  return (
    <div className="max-w-2xl mx-auto">
      <AppHeader
        title="Profil"
        showBack
        onBack={onClose}
      />

      <div className="px-4 pt-4 pb-6 no-scrollbar">
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
          {!isOwnProfile && (
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
          )}
        </div>

        <div className="grid grid-cols-5 gap-2.5 mb-5">
          {/* Abonnés */}
          <button
            onClick={() => setShowFollowersModal(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.followers}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center">Abonnés</p>
          </button>

          {/* Abonnements */}
          <button
            onClick={() => setShowFollowingModal(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.following}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">
              Suivis
            </p>
          </button>

          {/* Livres */}
          <button
            onClick={() => setShowLibrary(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.books}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center">Livres</p>
          </button>

          {/* Likés */}
          <button
            onClick={() => setShowLikedBooks(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-card-light border border-gray-200 shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main-light">{stats.likedBooks ?? 0}</p>
            <p className="text-[10px] text-text-sub-light font-medium text-center">Likés</p>
          </button>

          {/* Série (avec flamme derrière) */}
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
              {profile.total_pages_read ? (profile.total_pages_read / 1000).toFixed(1) + 'k' : '0'}
            </p>
            <p className="text-xs text-text-sub-light">Total lues</p>
          </div>

          <div className="flex flex-col gap-1 rounded-xl p-5 bg-card-light border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-text-sub-light mb-1">
              <Clock className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">Heures</p>
            </div>
            <p className="text-3xl font-bold leading-none text-text-main-light">
              {profile.total_hours_logged || 0}
            </p>
            <p className="text-xs text-text-sub-light">Temps passé</p>
          </div>
        </div>

        {/* Lectures en cours preview */}
        {readingPreviewBooks.length > 0 && (
          <div className="bg-card-light rounded-xl border border-gray-200 p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub-light">Lectures en cours</h2>
              <button
                onClick={() => setShowLibrary(true)}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Voir tout
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {readingPreviewBooks.slice(0, 8).map((book) => (
                <button
                  key={book.book_key}
                  onClick={() => {
                    setSelectedBook({
                      id: book.book_key,
                      title: book.title || 'Titre inconnu',
                      author: book.author || 'Auteur inconnu',
                      cover_url: book.cover_url || null,
                      thumbnail: book.cover_url || null,
                    });
                  }}
                  className="flex flex-col items-center"
                >
                  <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-md cursor-pointer hover:shadow-xl transition-shadow">
                    <BookCover
                      coverUrl={book.cover_url}
                      title={book.title || ''}
                      author={book.author || ''}
                      className="w-full h-full"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Livres likés preview */}
        {likedPreviewBooks.length > 0 && (
          <div className="bg-card-light rounded-xl border border-gray-200 p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub-light flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500 fill-current" />
                Livres likés
              </h2>
              <button
                onClick={() => setShowLikedBooks(true)}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Voir tout
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {likedPreviewBooks.slice(0, 8).map((book) => (
                <button
                  key={book.book_key}
                  onClick={() => {
                    setSelectedBook({
                      id: book.book_key,
                      title: book.title || 'Titre inconnu',
                      author: book.author || 'Auteur inconnu',
                      cover_url: book.cover_url || null,
                      thumbnail: book.cover_url || null,
                    });
                  }}
                  className="flex flex-col items-center"
                >
                  <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden shadow-md cursor-pointer hover:shadow-xl transition-shadow">
                    <BookCover
                      coverUrl={book.cover_url}
                      title={book.title || ''}
                      author={book.author || ''}
                      className="w-full h-full"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

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

        {selectedBook && (
          <BookDetailsModal
            book={selectedBook}
            onClose={() => setSelectedBook(null)}
          />
        )}
      </div>
    </div>
  );
}

