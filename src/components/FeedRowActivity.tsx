import { Heart, MessageCircle } from 'lucide-react';
import { BookOpen, Dumbbell, Brain, Target } from 'lucide-react';

interface FeedRowActivityProps {
  event: {
    id: string;
    actor: {
      id: string;
      display_name?: string;
      username?: string;
      avatar_url?: string;
    };
    event_type: 'activity_like' | 'activity_comment';
    activity: {
      id: string;
      type: 'reading' | 'workout' | 'learning' | 'habit';
      title: string;
      pages_read?: number;
      duration_minutes?: number;
      created_at: string;
    };
    comment_content?: string | null;
    created_at: string;
  };
  onActorClick: (actorId: string) => void;
  onActivityClick: () => void;
  formatTimeAgo: (dateString: string) => string;
}

const activityIcons = {
  reading: BookOpen,
  workout: Dumbbell,
  learning: Brain,
  habit: Target,
};

export function FeedRowActivity({ event, onActorClick, onActivityClick, formatTimeAgo }: FeedRowActivityProps) {
  const actorName = event.actor?.display_name || event.actor?.username || 'Utilisateur';
  const ActivityIcon = activityIcons[event.activity.type] || BookOpen;

  return (
    <div
      onClick={onActivityClick}
      className="flex items-center gap-2.5 p-2.5 bg-white rounded-2xl shadow-sm hover:bg-gray-50 transition-colors cursor-pointer"
    >
      {/* Avatar */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onActorClick(event.actor.id);
        }}
        className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden shrink-0 hover:ring-2 hover:ring-primary transition"
      >
        {event.actor?.avatar_url ? (
          <img
            src={event.actor.avatar_url}
            alt={actorName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-semibold text-stone-600">
            {actorName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5 mb-0.5">
          {event.event_type === 'activity_like' ? (
            <Heart className="w-3.5 h-3.5 text-red-500 fill-current shrink-0 mt-0.5" />
          ) : (
            <MessageCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          )}
          <p className="text-sm text-stone-900 line-clamp-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onActorClick(event.actor.id);
              }}
              className="font-semibold hover:underline"
            >
              {actorName}
            </button>
            {' '}
            {event.event_type === 'activity_like' ? 'a aimé' : 'a commenté'}{' '}
            <span className="font-semibold">{event.activity.title}</span>
          </p>
        </div>
        {event.event_type === 'activity_comment' && event.comment_content && (
          <p className="text-xs text-stone-600 line-clamp-1 ml-5">
            "{event.comment_content}"
          </p>
        )}
        <div className="flex items-center gap-2 ml-5 mt-0.5">
          <div className="flex items-center gap-1">
            <ActivityIcon className="w-3 h-3 text-stone-400" />
            <span className="text-[10px] text-stone-400">
              {event.activity.pages_read && event.activity.pages_read > 0 && `${event.activity.pages_read} pages`}
              {event.activity.pages_read && event.activity.pages_read > 0 && event.activity.duration_minutes && event.activity.duration_minutes > 0 && ' • '}
              {event.activity.duration_minutes && event.activity.duration_minutes > 0 && `${event.activity.duration_minutes} min`}
            </span>
          </div>
          <span className="text-[10px] text-stone-400">• {formatTimeAgo(event.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

