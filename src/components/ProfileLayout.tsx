import { useState, useEffect, useMemo } from 'react';
import { Flame, BookOpen, Clock, Users, Activity, ChevronRight, ChevronLeft } from 'lucide-react';
import { BookCover } from './BookCover';
import { BookDetailsModal } from './BookDetailsModal';
import { BookDetailsWithManagement } from './BookDetailsWithManagement';
import { useTranslation } from 'react-i18next';
import { computeReadingStats, formatStatValue } from '../lib/readingStats';
import { ActivityCard } from './ActivityCard';
import { supabase } from '../lib/supabase';
import { formatPagesCount } from '../utils/formatPages';
import { TABBAR_HEIGHT } from '../lib/layoutConstants';
import { resolveAvatarUrl, addCacheBuster } from '../lib/resolveImageUrl';
import { resolveBookCover } from '../lib/bookCover';

interface ProfileLayoutProps {
  profile: any;
  stats: {
    followers: number;
    following: number;
    books: number;
    likes: number;
    activities?: number;
  };
  weeklyActivity: number[];
  weeklyRangeLabel?: string;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  isCurrentWeek?: boolean;
  weeklyLoading?: boolean;
  weeklyRangeLabel?: string;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  isCurrentWeek?: boolean;
  totalMinutes: number;
  readingSpeed7d: number | null;
  readingPace7d: number | null;
  readingSpeedPR: number | null;
  readingPacePR: number | null;
  bestSessionMinutes?: number | null;
  hasSessions7d?: boolean;
  hasAnySessions?: boolean;
  totalPages7d?: number;
  totalPagesAllTime?: number;
  totalMinutes7d?: number;
  streakDays?: number;
  currentlyReading: any[];
  likedBooks: any[];
  interests?: string[];
  clubCount?: number;
  actionButtons?: React.ReactNode;
  onNavigateToLibrary?: () => void;
  onShowAllLikedBooks?: () => void;
  onShowReadingLibrary?: () => void;
  onShowFollowers?: () => void;
  onShowFollowing?: () => void;
  onShowClubs?: () => void;
  onShowMyActivities?: () => void;
  formatInterestTag?: (tag: string) => { label: string; tone?: 'default' | 'accent' } | { label: string };
  mode?: 'self' | 'user';
  viewedUserId?: string;
}

export function ProfileLayout({
  profile,
  stats,
  weeklyActivity,
  weeklyRangeLabel,
  onPrevWeek,
  onNextWeek,
  isCurrentWeek = true,
  weeklyLoading = false,
  totalMinutes,
  readingSpeed7d,
  readingPace7d,
  readingSpeedPR,
  readingPacePR,
  bestSessionMinutes,
  hasSessions7d = false,
  hasAnySessions = false,
  totalPages7d = 0,
  totalPagesAllTime = 0,
  totalMinutes7d = 0,
  streakDays = 0,
  currentlyReading,
  likedBooks,
  interests,
  clubCount,
  actionButtons,
  onNavigateToLibrary,
  onShowAllLikedBooks,
  onShowFollowers,
  onShowFollowing,
  onShowClubs,
  onShowMyActivities,
  onShowReadingLibrary,
  formatInterestTag,
  mode = 'self',
  viewedUserId,
}: ProfileLayoutProps) {
  const { t } = useTranslation();
  const [selectedUserBook, setSelectedUserBook] = useState<any | null>(null);
  const [selectedLikedBook, setSelectedLikedBook] = useState<any | null>(null);
  const [selectedReadingBook, setSelectedReadingBook] = useState<any | null>(null);
  const [showAllCurrentlyReading, setShowAllCurrentlyReading] = useState(false);
  const displayName = profile?.display_name || profile?.username || 'Utilisateur';
  const sectionLabel = (selfLabel: string, otherLabel: string) =>
    mode === 'self' ? selfLabel : `${otherLabel} ${displayName}`;
  const [lastActivity, setLastActivity] = useState<any | null>(null);
  const [loadingLastActivity, setLoadingLastActivity] = useState(false);

  // Resolve avatar URL (path -> public URL if needed)
  const avatarUrl = useMemo(() => {
    const resolved = resolveAvatarUrl(profile?.avatar_url, supabase);
    return addCacheBuster(resolved, profile?.updated_at);
  }, [profile?.avatar_url, profile?.updated_at]);

  // Load last activity
  useEffect(() => {
    const loadLastActivity = async () => {
      if (!onShowMyActivities) return;
      
      const targetUserId = mode === 'self' ? profile?.id : viewedUserId;
      if (!targetUserId) return;

      setLoadingLastActivity(true);
      try {
        const { data, error } = await supabase
          .from('activities')
          .select(`
            *,
            user_id,
            photos,
            user_profiles!activities_user_id_fkey(id, username, display_name, avatar_url),
            books!activities_book_id_fkey(title, author, cover_url, openlibrary_cover_id, isbn)
          `)
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[ProfileLayout] Error loading last activity:', error);
          setLastActivity(null);
          return;
        }

        if (data) {
          // Fetch custom_cover_url if book_id exists
          if (data.book_id) {
            const { data: userBook } = await supabase
              .from('user_books')
              .select('custom_cover_url')
              .eq('user_id', targetUserId)
              .eq('book_id', data.book_id)
              .maybeSingle();

            if (userBook && data.books) {
              (data.books as any).custom_cover_url = userBook.custom_cover_url;
            }
          }

          // Fetch reactions and comments count
          const [reactionsRes, commentsRes] = await Promise.all([
            supabase
              .from('activity_reactions')
              .select('id')
              .eq('activity_id', data.id),
            supabase
              .from('activity_comments')
              .select('id')
              .eq('activity_id', data.id),
          ]);

          const activityWithCounts = {
            id: data.id,
            user: data.user_profiles,
            user_id: data.user_id,
            type: data.type,
            title: data.title,
            pages_read: data.pages_read,
            duration_minutes: data.duration_minutes,
            notes: data.notes,
            quotes: data.quotes || [],
            book: data.books,
            created_at: data.created_at,
            reactions_count: reactionsRes.data?.length || 0,
            comments_count: commentsRes.data?.length || 0,
            user_has_reacted: false, // Will be set if needed
          };

          setLastActivity(activityWithCounts);
        } else {
          setLastActivity(null);
        }
      } catch (error) {
        console.error('[ProfileLayout] Error loading last activity:', error);
        setLastActivity(null);
      } finally {
        setLoadingLastActivity(false);
      }
    };

    loadLastActivity();
  }, [profile?.id, viewedUserId, mode, onShowMyActivities]);

  return (
    <>
      <div className="px-4 pt-4">
        <div className="flex flex-col items-center text-center mb-6" style={{ paddingTop: '8px' }}>
          <div className="relative mb-4">
            <div className="w-32 h-32 bg-surface-2 rounded-full flex items-center justify-center text-4xl font-bold text-text-main border-4 border-surface shadow-lg overflow-hidden">
              {avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:') || avatarUrl.startsWith('/')) ? (
                <img src={avatarUrl} alt={profile.display_name} className="w-full h-full object-cover" />
              ) : (
                profile.display_name.charAt(0).toUpperCase()
              )}
            </div>
            {(() => {
              const streakValue = Number.isFinite(streakDays) ? streakDays : 0;
              return (
                <div className={`absolute bottom-0 right-0 rounded-full p-1.5 border-4 border-surface flex items-center justify-center ${
                  streakValue > 0 ? 'bg-primary text-black' : 'bg-surface-2 text-text-muted'
                }`}>
                  <Flame className={`w-5 h-5 ${streakValue > 0 ? 'fill-black' : ''}`} />
                </div>
              );
            })()}
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            {profile.display_name || profile.username || 'Utilisateur'}
          </h1>
          {profile.username && (
            <p className="text-sm text-text-sub mb-3">
              @{profile.username}
            </p>
          )}
          {profile.bio && (
            <p className="text-text-sub text-sm max-w-md mb-4">{profile.bio}</p>
          )}
          {actionButtons && (
            <div className="flex items-center gap-3">
              {actionButtons}
            </div>
          )}
        </div>

        <div className="grid grid-cols-5 gap-2.5 mb-5">
          <button
            onClick={onShowFollowers}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-surface border border-border shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main">{stats.followers}</p>
            <p className="text-[10px] text-text-sub font-medium text-center whitespace-nowrap">{t('profile.followers')}</p>
          </button>

          <button
            onClick={onShowFollowing}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-surface border border-border shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main">{stats.following}</p>
            <p className="text-[10px] text-text-sub font-medium text-center whitespace-nowrap">{t('profile.following')}</p>
          </button>

          <button
            onClick={onNavigateToLibrary}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-surface border border-border shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main">{stats.books}</p>
            <p className="text-[10px] text-text-sub font-medium text-center whitespace-nowrap">{t('profile.booksShort')}</p>
          </button>

          <button
            onClick={onShowAllLikedBooks}
            className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-surface border border-border shadow-sm hover:shadow-md transition-all aspect-square"
          >
            <p className="text-2xl font-bold leading-none text-text-main">{stats.likes}</p>
            <p className="text-[10px] text-text-sub font-medium text-center whitespace-nowrap">{t('profile.likedBooks')}</p>
          </button>

          <div className="flex flex-col items-center justify-center gap-1 rounded-xl p-3 bg-primary text-black border border-primary shadow-md relative overflow-hidden aspect-square">
            <div className="absolute inset-0 opacity-10 flex items-center justify-center rotate-12">
              <Flame className="w-16 h-16" />
            </div>
            <p className="text-2xl font-bold leading-none relative z-10">{streakDays}</p>
            <p className="text-[10px] text-[#000] font-bold relative z-10 text-center">{t('profile.streak')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex flex-col gap-1 rounded-xl p-5 bg-surface border border-border shadow-sm">
            <div className="flex items-center gap-2 text-text-sub mb-1">
              <BookOpen className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">{t('profile.pages')}</p>
            </div>
            <p className="text-3xl font-bold leading-none text-text-main">
              {formatPagesCount(totalPagesAllTime)}
            </p>
            <p className="text-xs text-text-sub">{t('profile.totalRead')}</p>
          </div>

          <div className="flex flex-col gap-1 rounded-xl p-5 bg-surface border border-border shadow-sm">
            <div className="flex items-center gap-2 text-text-sub mb-1">
              <Clock className="w-5 h-5" />
              <p className="text-xs font-bold uppercase tracking-wide">{t('profile.hours')}</p>
            </div>
            <p className="text-3xl font-bold leading-none text-text-main">
              {totalMinutes < 60 ? `${totalMinutes} min` : `${(totalMinutes / 60).toFixed(1)} h`}
            </p>
            <p className="text-xs text-text-sub">{t('profile.timeSpent')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="flex flex-col gap-1 rounded-xl p-5 bg-surface border border-border shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-wide text-text-sub">Vitesse (7 jours)</p>
              <span className="text-[10px] font-bold bg-surface-2 px-2 py-1 rounded-lg text-text-main">p/h</span>
            </div>
            {(() => {
              if (!hasSessions7d) {
                return (
                  <p className="text-sm text-text-sub leading-relaxed">
                    Aucune session sur cette période
                  </p>
                );
              }
              
              const stats7d = computeReadingStats(totalPages7d, totalMinutes7d);
              
              if (stats7d.speed.type === 'value') {
                return (
                  <>
                    <p className="text-3xl font-bold leading-none text-text-main">
                      {stats7d.speed.formattedValue}
                    </p>
                    {stats7d.pace.type === 'value' && (
                    <p className="text-xs text-text-sub">
                        {stats7d.pace.formattedValue} {stats7d.pace.unit}
                      </p>
                    )}
                    {stats7d.speed.context && (
                    <p className="text-[10px] text-text-muted mt-1">
                        {stats7d.speed.context}
                      </p>
                    )}
                  </>
                );
              }
              
              return (
              <p className="text-sm text-text-sub leading-relaxed">
                  {stats7d.speed.message}
                </p>
              );
            })()}
          </div>

        <div className="flex flex-col gap-1 rounded-xl p-5 bg-surface border border-border shadow-sm">
            <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold uppercase tracking-wide text-text-sub">Meilleure session</p>
            <span className="text-[10px] font-bold bg-surface-2 px-2 py-1 rounded-lg text-text-main">p/h</span>
            </div>
            {(() => {
              if (!hasAnySessions) {
                return (
                <p className="text-sm text-text-sub leading-relaxed">
                    Commence une session pour établir ton premier record
                  </p>
                );
              }
              
              const hasValidPR = readingSpeedPR != null && readingPacePR != null && readingPacePR > 0;
              
              if (!hasValidPR) {
                return (
                <p className="text-sm text-text-sub leading-relaxed">
                    Pas encore de record personnel
                  </p>
                );
              }
              
              return (
                <>
                <p className="text-3xl font-bold leading-none text-text-main">
                    {readingSpeedPR != null ? formatStatValue(readingSpeedPR) : '—'}
                  </p>
                <p className="text-xs text-text-sub">
                    Meilleure vitesse sur une session
                  </p>
                  {bestSessionMinutes != null && bestSessionMinutes > 0 ? (
                  <p className="text-[10px] text-text-muted mt-0.5">
                      Basé sur {Math.round(bestSessionMinutes)} min de lecture
                    </p>
                  ) : (
                  <p className="text-[10px] text-text-muted mt-0.5">
                      Record sur une session
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Activités section - moved BEFORE weekly activity */}
        {onShowMyActivities && (
          <div className="bg-surface rounded-xl border border-border p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub">
                {sectionLabel('Mes activités', 'Activités de')}
              </h2>
              <button
                onClick={onShowMyActivities}
                className="px-3 py-1 rounded-full bg-primary text-black font-semibold text-sm hover:brightness-95 transition-colors flex items-center gap-1.5"
              >
                Voir tout
                <ChevronRight className="w-3.5 h-3.5 text-[#000]" />
              </button>
            </div>
            
            {loadingLastActivity ? (
              <div className="text-center py-6 text-text-sub text-sm">Chargement...</div>
            ) : lastActivity ? (
              <ActivityCard
                activity={lastActivity}
                onReact={() => {}}
                onComment={() => {}}
                variant="compact"
              />
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-text-sub">
                  {mode === 'self' 
                    ? 'Aucune activité pour l\'instant. Commencez une session de lecture !'
                    : 'Aucune activité publique'}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mb-5">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
                {t('profile.weeklyActivity')}
              </h4>
              {weeklyRangeLabel && (
                <span className="text-[10px] font-semibold text-text-muted">
                  {weeklyRangeLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onPrevWeek}
                  className="p-1 rounded-md border border-border text-text-sub hover:bg-surface-2 transition-colors"
                  aria-label="Semaine précédente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onNextWeek}
                  disabled={isCurrentWeek}
                  className={`p-1 rounded-md border border-border text-text-sub hover:bg-surface-2 transition-colors ${isCurrentWeek ? 'opacity-40 cursor-not-allowed' : ''}`}
                  aria-label="Semaine suivante"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <span className="text-xs font-semibold bg-surface-2 px-2 py-1 rounded-lg text-text-main">
                {weeklyActivity.reduce((a, b) => a + b, 0)} {t('library.pages')}
              </span>
            </div>
          </div>

          <div className="bg-surface px-4 py-4 rounded-2xl border border-border shadow-sm">
            {weeklyLoading && (
              <div className="text-center text-xs text-text-sub mb-2">Mise à jour…</div>
            )}
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
                      <div className="w-full h-24 bg-surface-2 rounded-xl flex items-end overflow-hidden">
                        <div
                          className={`w-full transition-all duration-500 ${isToday ? 'bg-primary' : 'bg-primary/50'}`}
                          style={{
                            height: pages > 0 ? `${Math.max(height, 10)}%` : '6px',
                          }}
                          title={`${pages} pages`}
                        />
                      </div>

                      <div className="flex flex-col items-center leading-none">
                        <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-text-main' : 'text-text-muted'}`}>
                          {dayShort[index]}
                        </span>
                        <span className="text-[10px] text-text-muted font-medium mt-1">
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
          <div className="bg-surface rounded-xl border border-border p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub">
                {sectionLabel('Livres en cours', 'Livres en cours de')}
              </h2>
              {currentlyReading.length > 0 && onShowReadingLibrary && (
                <button
                  onClick={onShowReadingLibrary}
                  className="px-3 py-1 rounded-full bg-primary text-black font-semibold text-xs hover:brightness-95 transition-colors flex items-center gap-1.5"
                >
                  Voir tout
                  <ChevronRight className="w-3 h-3 text-[rgb(0,0,0)]" />
                </button>
              )}
            </div>
            <div className="overflow-x-auto -mx-5 px-5 scrollbar-hide">
              <div className="flex flex-nowrap gap-3 snap-x snap-mandatory">
                {currentlyReading.slice(0, 5).map((item: any) => {
                  const book = item.book;
                  if (!book) {
                    console.warn('CurrentlyReading item without book data:', item);
                    return null;
                  }
                  const progress = (book.total_pages && book.total_pages > 0) ? Math.round((item.current_page / book.total_pages) * 100) : 0;
                  
                  const rawIsbn = (book.isbn || '').replace(/[-\s]/g, '');
                  const isbn13 = rawIsbn.length === 13 ? rawIsbn : undefined;
                  const isbn10 = rawIsbn.length === 10 ? rawIsbn : undefined;
                  
                  // ✅ Use canonical cover resolver with full fallbacks (custom / OL / Google)
                  const coverUrl = resolveBookCover({
                    // For carousel, prefer the stored cover (ignore any legacy custom gradient)
                    customCoverUrl: null,
                    coverUrl: book?.cover_url || null,
                  });

                  return (
                    <button
                      key={book.id}
                      onClick={() => {
                        const coverResolved = resolveBookCover({
                          customCoverUrl: (item as any).custom_cover_url || null,
                          coverUrl: book?.cover_url || null,
                          openLibraryCoverId: book?.openlibrary_cover_id || null,
                          openLibraryWorkKey: (book as any)?.openlibrary_work_key || null,
                          googleBooksId: book?.google_books_id || null,
                        });
                        setSelectedReadingBook({
                          id: book.id,
                          title: book.title,
                          author: book.author,
                          cover_url: book?.cover_url || coverResolved,
                          thumbnail: book?.cover_url || coverResolved,
                          custom_cover_url: null,
                          openlibrary_cover_id: book?.openlibrary_cover_id || null,
                          openlibrary_work_key: (book as any)?.openlibrary_work_key || null,
                          google_books_id: book?.google_books_id || null,
                          isbn: book?.isbn || null,
                          book_key: (book as any)?.book_key || null,
                        });
                      }}
                      className="flex flex-col items-center shrink-0 snap-start"
                      style={{ width: '64px' }}
                    >
                      <div className="relative w-16 h-24 mb-2 rounded-lg overflow-hidden shadow-md group cursor-pointer hover:shadow-xl transition-shadow">
                        <BookCover
                          custom_cover_url={(item as any).custom_cover_url || null}
                          coverUrl={coverUrl || null}
                          title={book.title}
                          author={book.author || 'Auteur inconnu'}
                          className="w-full h-full"
                          isbn={book.isbn || null}
                          isbn13={isbn13}
                          isbn10={isbn10}
                          cover_i={book.openlibrary_cover_id || null}
                          openlibrary_cover_id={book.openlibrary_cover_id || null}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end p-2">
                          <div className="text-white text-xs font-bold mb-1">{progress}%</div>
                          <div className="text-white text-[9px] text-center line-clamp-2 font-medium">{book.title}</div>
                        </div>
                      </div>
                      <div className="w-full bg-surface-2 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
                <div className="w-5 shrink-0" />
              </div>
            </div>
          </div>
        )}

        <div className="bg-surface rounded-xl border border-border p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub">
              {sectionLabel('Mes livres aimés', 'Livres aimés par')}
            </h2>
            {likedBooks.length > 8 && (
              <button
                onClick={onShowAllLikedBooks}
                className="px-3 py-1 rounded-full bg-primary text-black font-semibold text-xs hover:brightness-95 transition-colors flex items-center gap-1.5"
              >
                Voir tout
                <ChevronRight className="w-3 h-3 text-[rgb(0,0,0)]" />
              </button>
            )}
          </div>
          
          {likedBooks.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-text-sub opacity-50" />
              <p className="text-sm text-text-sub">{t('profile.noLikedBooksYet')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {likedBooks.slice(0, 8).map((item) => {
                const book = item.book;
                if (!book) return null;

                const bookKey = item.book_key || '';
                let openLibraryKey: string | undefined;
                let isbn13: string | undefined;
                let isbn10: string | undefined;

                if (book.book_key && book.book_key.startsWith('/works/')) {
                  openLibraryKey = book.book_key;
                } else if (bookKey.startsWith('ol:') || bookKey.startsWith('/works/')) {
                  const keyPart = bookKey.replace(/^ol:/, '').replace(/^\/works\//, '');
                  openLibraryKey = keyPart ? `/works/${keyPart}` : undefined;
                }

                const cacheIsbn = book.isbn;
                if (cacheIsbn) {
                  const cleanIsbn = cacheIsbn.replace(/[-\s]/g, '');
                  if (cleanIsbn.length === 13) {
                    isbn13 = cleanIsbn;
                  } else if (cleanIsbn.length === 10) {
                    isbn10 = cleanIsbn;
                  }
                } else if (bookKey.startsWith('isbn:')) {
                  const isbn = bookKey.replace(/^isbn:/, '').replace(/[-\s]/g, '');
                  if (isbn.length === 13) {
                    isbn13 = isbn;
                  } else if (isbn.length === 10) {
                    isbn10 = isbn;
                  }
                }

                // ✅ Utiliser resolveBookCover (fonction canonique)
                const coverUrl = resolveBookCover({
                  customCoverUrl: item.actor_custom_cover_url || null,
                  coverUrl: book?.cover_url || null,
                });

                return (
                  <button
                    key={item.book_key}
                    onClick={() => {
                      const bookObj = {
                        id: item.book_id,            // ✅ UUID
                        book_uuid: item.book_id,     // ✅ explicite
                        book_key: item.book_key,
                        title: book.title ?? 'Métadonnées en cours…',
                        author: book.author ?? 'Métadonnées en cours…',
                        cover_url: coverUrl,
                        thumbnail: coverUrl,
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
                        coverUrl={coverUrl || undefined}
                        title={book.title || 'Livre'}
                        author={book.author || ''}
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

        {interests && interests.length > 0 && (
          <div className="bg-surface rounded-xl border border-border p-5 shadow-sm mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-sub mb-3">
              {sectionLabel('Mes préférences', 'Préférences de')}
            </h2>

            {(() => {
              const interestsList: string[] = Array.isArray(interests) ? interests : [];
              const shown = interestsList.slice(0, 10);
              const extra = Math.max(0, interestsList.length - shown.length);
              const formatTag = formatInterestTag || ((tag: string) => ({ label: tag }));

              return (
                <div className="flex flex-wrap gap-2">
                  {shown.map((interest: string) => {
                    const ft = formatTag(interest);
                    const isAccent = 'tone' in ft && ft.tone === 'accent';

                    return (
                      <span
                        key={interest}
                        className={[
                          "px-3 py-1.5 rounded-full text-xs font-semibold border max-w-full truncate",
                          isAccent
                            ? "bg-primary/20 border-primary/30 text-text-main"
                            : "bg-surface-2 border-border text-text-main",
                        ].join(' ')}
                        title={interest}
                      >
                        {ft.label}
                      </span>
                    );
                  })}

                  {extra > 0 && (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-surface-2 border-border text-text-main">
                      +{extra}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {clubCount !== undefined && onShowClubs && (
          <button
            onClick={onShowClubs}
            className="w-full bg-surface rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all hover:border-lime-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/15 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-text-main" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-text-main mb-0.5">{t('profile.myClubs')}</h3>
                  <p className="text-sm text-text-sub">
                    {clubCount === 0 ? t('profile.joinReadingClubs') : `${clubCount} club${clubCount !== 1 ? 's' : ''}`}
                </p>
                </div>
              </div>
              <svg className="w-5 h-5 text-text-sub" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {selectedUserBook?.book?.id && (
        <BookDetailsWithManagement
          bookId={selectedUserBook.book.id}
          userBookId={selectedUserBook.id}
          currentPage={selectedUserBook.current_page || 0}
          onClose={() => {
            setSelectedUserBook(null);
          }}
        />
      )}

      {selectedLikedBook && (
        <BookDetailsModal
          book={selectedLikedBook}
          onClose={() => setSelectedLikedBook(null)}
          showAddButton
          onAddToLibrary={() => {
            window.dispatchEvent(new CustomEvent('open-manual-add'));
          }}
        />
      )}

      {selectedReadingBook && (
        <BookDetailsModal
          book={selectedReadingBook}
          onClose={() => setSelectedReadingBook(null)}
          showAddButton
          onAddToLibrary={() => {
            window.dispatchEvent(new CustomEvent('open-manual-add'));
          }}
        />
      )}
    </>
  );
}

