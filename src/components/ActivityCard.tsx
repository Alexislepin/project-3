import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, MessageCircle, BookOpen, Dumbbell, Brain, Target, Quote, X } from 'lucide-react';
import { formatDistanceToNow } from '../utils/dateUtils';
import { BookCover } from './BookCover';
import { ActivityMenu } from './ActivityMenu';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { resolveAvatarUrl, addCacheBuster } from '../lib/resolveImageUrl';
import { getReadingUI } from '../utils/formatReadingActivity';

interface ActivityQuote {
  text: string;
  page: number;
}

interface Activity {
  id: string;
  user: {
    id?: string;
    display_name: string;
    username: string;
    avatar_url?: string;
  };
  user_id?: string;
  type: 'reading' | 'workout' | 'learning' | 'habit';
  title: string;
  pages_read?: number;
  duration_minutes?: number;
  reading_speed_pph?: number | null;
  reading_pace_min_per_page?: number | null;
  reading_speed_wpm?: number | null;
  book?: {
    title: string;
    author: string;
    cover_url?: string;
    custom_cover_url?: string | null;
    openlibrary_cover_id?: number;
    isbn?: string;
    total_pages?: number | null;
  };
  book_id?: string;
  notes?: string;
  quotes?: ActivityQuote[];
  photos?: string[] | null;
  created_at: string;
  updated_at?: string | null;
  ended_at?: string | null;
  reactions_count: number;
  comments_count: number;
  user_has_reacted: boolean;
  current_page?: number | null;
}

interface ActivityCardProps {
  activity: Activity;
  onReact: () => void;
  onComment: () => void;
  onOpenLikers?: (activityId: string) => void;
  onEdit?: (activityId: string) => void;
  onDelete?: (activityId: string) => void;
  onUserClick?: (userId: string) => void;
  variant?: 'default' | 'compact';
}

const activityIcons = {
  reading: BookOpen,
  workout: Dumbbell,
  learning: Brain,
  habit: Target,
};

const activityLabels = {
  reading: 'Lecture',
  workout: 'Entraînement',
  learning: 'Apprentissage',
  habit: 'Habitude',
};


export function ActivityCard({ activity, onReact, onComment, onOpenLikers, onEdit, onDelete, onUserClick, variant = 'default' }: ActivityCardProps) {
  const { user } = useAuth();
  const Icon = activityIcons[activity.type];
  const label = activityLabels[activity.type];
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState<string | null>(null);
  const displayTimestamp = activity.ended_at || activity.updated_at || activity.created_at;

  // Resolve avatar URL (path -> public URL if needed)
  const avatarUrl = useMemo(() => {
    const resolved = resolveAvatarUrl(activity.user?.avatar_url, supabase);
    return addCacheBuster(resolved, undefined); // No cache key available for activity.user
  }, [activity.user?.avatar_url]);

  // Resolve all photo URLs (support full gallery)
  const photoUrls = useMemo(() => {
    if (!Array.isArray(activity.photos) || activity.photos.length === 0) return [];
    return activity.photos
      .map((photoPath) => {
        if (!photoPath) return null;
        if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) return photoPath;
        const { data } = supabase.storage.from('activity-photos').getPublicUrl(photoPath);
        return data?.publicUrl ?? null;
      })
      .filter((u): u is string => Boolean(u));
  }, [activity.photos]);

  // Check if this is a reading activity with a book
  const isReadingActivity = activity.type === 'reading' && (activity.book || activity.book_id);

  // Get reading UI data (premium layout)
  const readingUI = isReadingActivity ? getReadingUI({
    pages_read: activity.pages_read,
    duration_minutes: activity.duration_minutes,
    reading_speed_pph: activity.reading_speed_pph,
    book: activity.book,
  }) : null;

  const formatDuration = (minutes?: number | null) => {
    const totalSeconds = Math.max(0, Math.round((minutes ?? 0) * 60));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m > 0 && s > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  if (variant === 'compact') {
    return (
      <div className="bg-white rounded-xl p-3 border-0">
        <div className="flex items-start gap-3">
          {/* Cover or Icon */}
          {isReadingActivity && activity.book ? (
            <BookCover
              title={activity.book.title}
              author={activity.book.author}
              coverUrl={activity.book.cover_url ?? null}
              custom_cover_url={activity.book.custom_cover_url ?? null}
              openlibrary_cover_id={activity.book.openlibrary_cover_id ?? null}
              isbn={activity.book.isbn ?? null}
              book={activity.book}
              bookId={activity.book_id}
              className="w-12 h-16 rounded-lg shadow-sm shrink-0"
              showAddCoverButton={false}
            />
          ) : (
            <div className="w-12 h-16 shrink-0 rounded-lg bg-stone-100 flex items-center justify-center">
              <Icon className="w-6 h-6 text-stone-400" />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {isReadingActivity && readingUI ? (
              <>
                {/* Action label (short, no title) */}
                <p className="text-xs text-stone-500 mb-1.5">
                  {readingUI.actionLabel}
                </p>
                {/* Book title (main element) */}
                <h3 className="text-sm font-bold text-[rgb(var(--color-text))] leading-snug line-clamp-1 mb-1">
                  {readingUI.title}
                </h3>
                {/* Author (secondary) */}
                <p className="text-stone-500 text-xs line-clamp-1 mb-2">{readingUI.author}</p>
                {/* Stats chips */}
                {readingUI.statsChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {readingUI.statsChips.map((chip, idx) => {
                      const isSpeed = chip.label === 'pages/h';
                      const isPace = chip.label === 'min/page';
                      const highlight = isSpeed || isPace;
                      const chipClasses = highlight
                        ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-black text-[10px] font-semibold'
                        : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-stone-700 text-[10px] font-medium';
                      const labelClasses = highlight ? 'text-black' : 'text-stone-500';
                      return (
                        <span
                          key={idx}
                          className={chipClasses}
                        >
                          <span
                            className="font-semibold"
                            style={highlight ? { color: '#000' } : undefined}
                          >
                            {chip.value}
                          </span>
                          <span
                            className={labelClasses}
                            style={highlight ? { color: '#000' } : undefined}
                          >
                            {chip.label}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide bg-primary/15 text-stone-900 border border-primary/30">
                    <Icon className="w-3 h-3" />
                    {label}
                  </span>
                  {activity.pages_read && activity.pages_read > 0 && (
                    <span className="text-stone-400 text-[10px] font-medium">+{activity.pages_read} pages</span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-stone-900 leading-snug line-clamp-2">{activity.title}</h3>
              </>
            )}

            <p className="text-xs text-stone-400 mt-1.5">{formatDistanceToNow(displayTimestamp)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div 
      className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden border-0 border-none"
      onClick={(e) => {
        // Prevent card click from interfering with button clicks
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('a')) {
          return; // Let button/link handle it
        }
      }}
    >
      <div className="p-4 border-0 border-none border-transparent">
        {/* Header row: avatar + name + time + menu */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const userId = activity.user.id || activity.user_id;
              if (userId && onUserClick) {
                onUserClick(userId);
              }
            }}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity cursor-pointer"
          >
            <div className="w-9 h-9 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 font-medium flex-shrink-0 overflow-hidden">
              {avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:') || avatarUrl.startsWith('/')) ? (
                <img src={avatarUrl} alt={activity.user.display_name} className="w-full h-full object-cover" />
              ) : (
                activity.user.display_name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="font-semibold text-sm truncate"
                  style={{ color: 'rgb(var(--color-text))' }}
                >
                  {activity.user.display_name}
                </span>
                <span className="text-stone-400 text-xs truncate">@{activity.user.username}</span>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-stone-400 text-xs flex-shrink-0">{formatDistanceToNow(displayTimestamp)}</span>
            {user && onEdit && onDelete && (
              <ActivityMenu
                activityId={activity.id}
                userId={activity.user.id || activity.user_id || ''}
                currentUserId={user.id}
                onEdit={() => onEdit(activity.id)}
                onDelete={() => onDelete(activity.id)}
              />
            )}
          </div>
        </div>

        {/* Reading Activity Content (Premium Layout) */}
        {isReadingActivity && readingUI && activity.book ? (
          <div className="flex items-start gap-4 mb-3">
            <div className="flex-1 min-w-0">
              {/* Action label (short, no title duplication) */}
              <p
                className="text-sm mb-2"
                style={{ color: 'rgb(var(--color-text))' }}
              >
                {readingUI.actionLabel}
              </p>
              
              {/* Title (main element, large) */}
              <h3 className="text-lg font-bold text-[rgb(var(--color-text))] leading-tight line-clamp-2 mb-1.5">
                {readingUI.title}
              </h3>
              
              {/* Author (secondary) */}
              <p className="text-stone-500 text-sm line-clamp-1 mb-3">{readingUI.author}</p>

            {/* Stats chips (progression masquée tant qu'on ne stocke pas un snapshot par activité) */}
            {readingUI.statsChips.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                {readingUI.statsChips.map((chip, idx) => {
                  const isSpeed = chip.label === 'pages/h';
                  const isPace = chip.label === 'min/page' || chip.label === 's/page';
                  const highlight = isSpeed || isPace;
                  const chipClasses = highlight
                    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-semibold'
                    : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-stone-700 text-xs font-medium';
                  const labelClasses = highlight ? 'text-black' : 'text-stone-500';
                  return (
                    <span
                      key={idx}
                      className={chipClasses}
                    >
                      <span
                        className="font-bold text-stone-900"
                        style={highlight ? { color: '#000' } : undefined}
                      >
                        {chip.value}
                      </span>
                      <span
                        className={labelClasses}
                        style={highlight ? { color: '#000' } : undefined}
                      >
                        {chip.label}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
            </div>
            
            {/* Cover (small, rounded, with shadow) */}
            <BookCover
              title={activity.book.title}
              author={activity.book.author}
              coverUrl={activity.book.cover_url ?? null}
              custom_cover_url={activity.book.custom_cover_url ?? null}
              openlibrary_cover_id={activity.book.openlibrary_cover_id ?? null}
              isbn={activity.book.isbn ?? null}
              book={activity.book}
              bookId={activity.book_id}
              className="w-14 h-20 rounded-xl shadow-sm shrink-0"
              showAddCoverButton={false}
            />
          </div>
        ) : (
          <div className="mb-3">
            {/* Badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide bg-primary/15 text-stone-900 border border-primary/30">
                <Icon className="w-3 h-3" />
                {label}
              </span>
              {activity.pages_read && activity.pages_read > 0 && (
                <span className="text-stone-400 text-[10px] font-medium">{activity.pages_read} pages</span>
              )}
              {activity.duration_minutes && activity.duration_minutes > 0 && (
                <span className="text-stone-400 text-[10px] font-medium">{formatDuration(activity.duration_minutes)}</span>
              )}
            </div>
          
            {/* Title */}
            <h3 className="text-base font-bold text-stone-900 leading-snug line-clamp-2">{activity.title}</h3>
          </div>
        )}

        {/* Notes */}
        {activity.notes && (
          <div className="rounded-xl p-3 mb-3 bg-surface-2 border border-border">
            <p className="text-text-main-light text-sm leading-relaxed">{activity.notes}</p>
          </div>
        )}

        {/* Quotes */}
        {activity.quotes && activity.quotes.length > 0 && (
          <div className="mb-3 space-y-2">
            {activity.quotes.map((quote, index) => (
              <div
                key={index}
                className="border-l-4 border-primary pl-3 py-2 rounded-r-lg bg-surface border border-border/70"
              >
                <div className="flex items-start gap-2">
                  <Quote className="w-4 h-4 text-[rgba(230,255,0,1)] mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-main-light italic line-clamp-3">"{quote.text}"</p>
                    <p className="text-xs text-text-sub-light mt-1">Page {quote.page}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Photos grid (compact, under text) */}
        {photoUrls.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2 text-sm text-stone-500">
              <span className="font-semibold text-stone-700">Photos</span>
              <span className="text-xs text-stone-400">({photoUrls.length})</span>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {photoUrls.slice(0, 3).map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPhotoPreviewOpen(url);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-gray-50 hover:shadow-sm transition-shadow"
                >
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    draggable={false}
                    onMouseDown={(e) => {
                      // Empêche Safari/iOS d'ouvrir l'image en plein écran natif
                      e.preventDefault();
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center gap-4 pt-3 border-t border-stone-100">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[ActivityCard] Like button clicked', activity.id, 'onReact:', typeof onReact);
              if (onReact) {
                onReact();
              } else {
                console.error('[ActivityCard] onReact is not defined!');
              }
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              // Don't preventDefault here, just stop propagation
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Trigger onReact on touch end for mobile
              console.log('[ActivityCard] Like button touch end', activity.id);
              if (onReact) {
                onReact();
              }
            }}
            onTouchCancel={(e) => {
              e.stopPropagation();
            }}
            className={`flex items-center gap-1.5 transition-colors relative z-10 cursor-pointer pointer-events-auto ${
              activity.user_has_reacted
                ? 'text-red-500'
                : 'text-stone-500 hover:text-red-500'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <Heart
              className={activity.user_has_reacted ? "fill-red-500 text-red-500 w-5 h-5 pointer-events-none" : "w-5 h-5 pointer-events-none"}
            />
            {activity.reactions_count > 0 ? (
              onOpenLikers ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLikers(activity.id);
                  }}
                  className="text-sm font-medium hover:underline cursor-pointer"
                >
                  {activity.reactions_count}
                </span>
              ) : (
                <span className="text-xs font-medium">{activity.reactions_count}</span>
              )
            ) : null}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('[ActivityCard] Comment button clicked', activity.id);
              onComment();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
            }}
            className="flex items-center gap-1.5 text-stone-500 hover:text-stone-900 transition-colors relative z-10 cursor-pointer"
          >
            <MessageCircle className="w-4.5 h-4.5" />
            {activity.comments_count > 0 && (
              <span className="text-xs font-medium">{activity.comments_count}</span>
            )}
          </button>
        </div>
      </div>
    </div>

    {/* Lightbox photo preview */}
    {photoPreviewOpen && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[240] bg-black/80 flex items-center justify-center p-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }} // laisser de l'air au-dessus de la nav
        onClick={() => setPhotoPreviewOpen(null)}
      >
        <div className="relative max-w-5xl max-h-[75vh] w-full flex items-center justify-center">
          <img
            src={photoPreviewOpen}
            alt="Photo d'activité"
            className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setPhotoPreviewOpen(null)}
            className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            aria-label="Fermer la photo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
