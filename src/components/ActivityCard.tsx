import { Heart, MessageCircle, BookOpen, Dumbbell, Brain, Target, Quote } from 'lucide-react';
import { formatDistanceToNow } from '../utils/dateUtils';

interface ActivityQuote {
  text: string;
  page: number;
}

interface Activity {
  id: string;
  user: {
    display_name: string;
    username: string;
    avatar_url?: string;
  };
  type: 'reading' | 'workout' | 'learning' | 'habit';
  title: string;
  pages_read?: number;
  duration_minutes?: number;
  book?: {
    title: string;
    author: string;
    cover_url?: string;
  };
  notes?: string;
  quotes?: ActivityQuote[];
  created_at: string;
  reactions_count: number;
  comments_count: number;
  user_has_reacted: boolean;
}

interface ActivityCardProps {
  activity: Activity;
  onReact: () => void;
  onComment: () => void;
}

const activityIcons = {
  reading: BookOpen,
  workout: Dumbbell,
  learning: Brain,
  habit: Target,
};

export function ActivityCard({ activity, onReact, onComment }: ActivityCardProps) {
  const Icon = activityIcons[activity.type];

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-stone-200 rounded-full flex items-center justify-center text-stone-600 font-medium flex-shrink-0 overflow-hidden">
          {activity.user.avatar_url ? (
            <img src={activity.user.avatar_url} alt={activity.user.display_name} className="w-full h-full object-cover" />
          ) : (
            activity.user.display_name.charAt(0).toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-stone-900">{activity.user.display_name}</span>
            <span className="text-stone-500 text-sm">@{activity.user.username}</span>
          </div>
          <div className="flex items-center gap-1 text-stone-500 text-sm">
            <Icon className="w-4 h-4" />
            <span>{formatDistanceToNow(activity.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="mb-3">
        {activity.type === 'reading' && activity.book ? (
          <div className="mb-3">
            <div className="flex items-baseline gap-2 mb-1">
              <h3 className="text-lg">
                <span className="text-stone-600">a lu </span>
                <span className="font-bold text-stone-900">{activity.book.title}</span>
              </h3>
              {activity.pages_read && activity.pages_read > 0 && (
                <span className="text-stone-500 text-sm font-medium">· {activity.pages_read} pages</span>
              )}
            </div>
            <p className="text-stone-500 text-sm">de {activity.book.author}</p>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-stone-900 mb-2">{activity.title}</h3>
            {((activity.pages_read && activity.pages_read > 0) || (activity.duration_minutes && activity.duration_minutes > 0)) && (
              <div className="flex gap-4 mb-3">
                {activity.pages_read && activity.pages_read > 0 && (
                  <span className="text-stone-600 text-sm font-medium">{activity.pages_read} pages</span>
                )}
                {activity.duration_minutes && activity.duration_minutes > 0 && (
                  <span className="text-stone-600 text-sm font-medium">{activity.duration_minutes} min</span>
                )}
              </div>
            )}
          </>
        )}

        {activity.notes && (
          <div className="bg-stone-50 rounded-lg p-3 mb-3">
            <p className="text-stone-700 text-sm leading-relaxed">{activity.notes}</p>
          </div>
        )}

        {activity.quotes && activity.quotes.length > 0 && (
          <div className="mt-3 space-y-2">
            {activity.quotes.map((quote, index) => (
              <div key={index} className="border-l-4 border-primary pl-3 py-2 bg-gray-50 rounded-r-lg">
                <div className="flex items-start gap-2">
                  <Quote className="w-4 h-4 text-text-sub-light mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-main-light italic">"{quote.text}"</p>
                    <p className="text-xs text-text-sub-light mt-1">Page {quote.page}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
            className="w-5 h-5"
            fill={activity.user_has_reacted ? 'currentColor' : 'none'}
          />
          {activity.reactions_count > 0 && (
            <span className="text-sm font-medium">{activity.reactions_count}</span>
          )}
        </button>

        <button
          onClick={onComment}
          className="flex items-center gap-1.5 text-stone-500 hover:text-stone-900 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          {activity.comments_count > 0 && (
            <span className="text-sm font-medium">{activity.comments_count}</span>
          )}
        </button>
      </div>
    </div>
  );
}
