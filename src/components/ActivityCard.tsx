import { Heart, MessageCircle, BookOpen, Dumbbell, Brain, Target, Quote } from 'lucide-react';
import { formatDistanceToNow } from '../utils/dateUtils';
import { BookCover } from './BookCover';
import { ActivityMenu } from './ActivityMenu';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

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
  book?: {
    title: string;
    author: string;
    cover_url?: string;
    openlibrary_cover_id?: number;
    isbn?: string;
  };
  book_id?: string;
  notes?: string;
  quotes?: ActivityQuote[];
  photos?: string[] | null;
  created_at: string;
  reactions_count: number;
  comments_count: number;
  user_has_reacted: boolean;
}

interface ActivityCardProps {
  activity: Activity;
  onReact: () => void;
  onComment: () => void;
  onOpenLikers?: (activityId: string) => void;
  onEdit?: (activityId: string) => void;
  onDelete?: (activityId: string) => void;
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

export function ActivityCard({ activity, onReact, onComment, onOpenLikers, onEdit, onDelete, variant = 'default' }: ActivityCardProps) {
  const { user } = useAuth();
  const Icon = activityIcons[activity.type];
  const label = activityLabels[activity.type];

  // Get photo URL from activities.photos array
  const photoPath =
    Array.isArray(activity.photos) && activity.photos.length > 0
      ? activity.photos[0]
      : null;

  const imageUrl = photoPath
    ? supabase.storage
        .from('activity-photos')
        .getPublicUrl(photoPath).data.publicUrl
    : null;

  // Check if this is a reading activity with a book
  const isReadingActivity = activity.type === 'reading' && (activity.book || activity.book_id);

  if (variant === 'compact') {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-3">
        <div className="flex items-start gap-3">
          {/* Cover or Icon */}
          {isReadingActivity && activity.book ? (
            <div className="w-12 h-16 shrink-0 rounded-lg overflow-hidden">
              <BookCover
                coverUrl={activity.book.cover_url}
                title={activity.book.title || ''}
                author={activity.book.author || ''}
                custom_cover_url={(activity.book as any).custom_cover_url ?? null}
                openlibrary_cover_id={activity.book.openlibrary_cover_id ?? null}
                className="w-full h-full"
              />
            </div>
          ) : (
            <div className="w-12 h-16 shrink-0 rounded-lg bg-stone-100 flex items-center justify-center">
              <Icon className="w-6 h-6 text-stone-400" />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide bg-primary/15 text-stone-900 border border-primary/30">
                <Icon className="w-3 h-3" />
                {label}
              </span>
              {activity.pages_read && activity.pages_read > 0 && (
                <span className="text-stone-400 text-[10px] font-medium">+{activity.pages_read} pages</span>
              )}
            </div>
            
            {isReadingActivity && activity.book ? (
              <>
                <h3 className="text-sm font-bold text-stone-900 leading-snug line-clamp-1 mb-0.5">
                  {activity.book.title}
                </h3>
                <p className="text-stone-500 text-xs line-clamp-1">{activity.book.author}</p>
              </>
            ) : (
              <h3 className="text-sm font-bold text-stone-900 leading-snug line-clamp-2">{activity.title}</h3>
            )}

            <p className="text-xs text-stone-400 mt-1.5">{formatDistanceToNow(activity.created_at)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm mb-3 overflow-hidden">
      {/* Photo - displayed above the card content (only if not a reading activity) */}
      {!isReadingActivity && imageUrl && (
        <div className="w-full aspect-video overflow-hidden bg-gray-100">
          <img
            src={imageUrl}
            alt="Photo de l'activité"
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error('[ActivityCard] Failed to load photo:', imageUrl);
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="p-4">
        {/* Header row: avatar + name + time + menu */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 font-medium flex-shrink-0 overflow-hidden">
              {activity.user.avatar_url ? (
                <img src={activity.user.avatar_url} alt={activity.user.display_name} className="w-full h-full object-cover" />
              ) : (
                activity.user.display_name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-stone-900 text-sm truncate">{activity.user.display_name}</span>
                <span className="text-stone-400 text-xs truncate">@{activity.user.username}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-stone-400 text-xs flex-shrink-0">{formatDistanceToNow(activity.created_at)}</span>
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

        {/* Badge + Content */}
        {isReadingActivity && activity.book ? (
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1 min-w-0">
              {/* Badge */}
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide bg-primary/15 text-stone-900 border border-primary/30">
                  <Icon className="w-3 h-3" />
                  {label}
                </span>
                {activity.pages_read && activity.pages_read > 0 && (
                  <span className="text-stone-400 text-[10px] font-medium">+{activity.pages_read} pages</span>
                )}
              </div>
              
              {/* Title */}
              <h3 className="text-base font-bold text-stone-900 leading-snug line-clamp-2 mb-1">
                {activity.book.title}
              </h3>
              
              {/* Author */}
              <p className="text-stone-500 text-sm line-clamp-1">{activity.book.author}</p>
            </div>
            
            {/* Cover */}
            {activity.book.cover_url && (
              <div className="w-12 h-16 shrink-0 rounded-lg overflow-hidden">
                <BookCover
                  coverUrl={activity.book.cover_url}
                  title={activity.book.title || ''}
                  author={activity.book.author || ''}
                  custom_cover_url={(activity.book as any).custom_cover_url ?? null}
                  openlibrary_cover_id={activity.book.openlibrary_cover_id ?? null}
                  className="w-full h-full"
                />
              </div>
            )}
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
                <span className="text-stone-400 text-[10px] font-medium">{activity.duration_minutes} min</span>
              )}
            </div>
          
            {/* Title */}
            <h3 className="text-base font-bold text-stone-900 leading-snug line-clamp-2">{activity.title}</h3>
          </div>
        )}

        {/* Notes */}
        {activity.notes && (
          <div className="bg-stone-50 rounded-xl p-3 mb-3">
            <p className="text-stone-700 text-sm leading-relaxed">{activity.notes}</p>
          </div>
        )}

        {/* Quotes */}
        {activity.quotes && activity.quotes.length > 0 && (
          <div className="mb-3 space-y-2">
            {activity.quotes.map((quote, index) => (
              <div key={index} className="border-l-4 border-primary pl-3 py-2 bg-gray-50 rounded-r-lg">
                <div className="flex items-start gap-2">
                  <Quote className="w-4 h-4 text-text-sub-light mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-main-light italic line-clamp-3">"{quote.text}"</p>
                    <p className="text-xs text-text-sub-light mt-1">Page {quote.page}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center gap-4 pt-3 border-t border-stone-100">
          <button
            onClick={onReact}
            className={`flex items-center gap-1.5 transition-colors ${
              activity.user_has_reacted
                ? 'text-red-500'
                : 'text-stone-500 hover:text-red-500'
            }`}
          >
            <Heart
              className={activity.user_has_reacted ? "fill-red-500 text-red-500 w-5 h-5" : "w-5 h-5"}
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
            onClick={onComment}
            className="flex items-center gap-1.5 text-stone-500 hover:text-stone-900 transition-colors"
          >
            <MessageCircle className="w-4.5 h-4.5" />
            {activity.comments_count > 0 && (
              <span className="text-xs font-medium">{activity.comments_count}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
