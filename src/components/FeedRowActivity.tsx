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
    owner: {
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
  onActivityClick: (activityId: string) => void;
  formatTimeAgo: (dateString: string) => string;
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

export function FeedRowActivity({ event, onActorClick, onActivityClick, formatTimeAgo }: FeedRowActivityProps) {
  const actorName = event.actor?.display_name || event.actor?.username || 'Utilisateur';
  const ownerName = event.owner?.display_name || event.owner?.username || 'Utilisateur';
  const ActivityIcon = activityIcons[event.activity.type] || BookOpen;
  const activityLabel = activityLabels[event.activity.type] || 'Activité';

  // Build chip text
  const chipParts: string[] = [activityLabel];
  if (event.activity.pages_read && event.activity.pages_read > 0) {
    chipParts.push(`${event.activity.pages_read} pages`);
  }
  if (event.activity.duration_minutes && event.activity.duration_minutes > 0) {
    chipParts.push(`${event.activity.duration_minutes} min`);
  }
  const chipText = chipParts.join(' · ');

  // Clean activity title: remove "Read " prefix if present
  const cleanTitle = event.activity.title?.replace(/^Read\s+/i, '') || '';

  return (
    <div className="flex items-center gap-2.5 p-2.5 bg-white rounded-2xl shadow-sm">
      {/* Avatar */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onActorClick(event.actor.id);
        }}
        className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden shrink-0 hover:ring-2 hover:ring-primary transition cursor-pointer"
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
        <div className="flex items-start gap-1.5 mb-1">
          {event.event_type === 'activity_like' ? (
            <Heart className="w-3.5 h-3.5 text-red-500 fill-current shrink-0 mt-0.5" />
          ) : (
            <MessageCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-stone-900 line-clamp-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onActorClick(event.actor.id);
                }}
                className="font-semibold hover:underline cursor-pointer"
              >
                {actorName}
              </button>
              {' '}
              {event.event_type === 'activity_like' ? 'a aimé' : 'a commenté'}{' '}
              l'activité de{' '}
              <span className="text-stone-600">{ownerName}</span>
            </p>
            
            {/* Activity Chip */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onActivityClick(event.activity.id);
              }}
              className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-stone-200 bg-white hover:bg-stone-50 transition-colors cursor-pointer text-xs text-stone-700"
            >
              <ActivityIcon className="w-3 h-3 text-stone-500" />
              <span className="font-medium">{chipText}</span>
              {cleanTitle && (
                <>
                  <span className="text-stone-400">·</span>
                  <span className="text-stone-600 truncate max-w-[120px]">{cleanTitle}</span>
                </>
              )}
            </button>
          </div>
        </div>
        {event.event_type === 'activity_comment' && event.comment_content && (
          <p className="text-xs text-stone-600 line-clamp-1 ml-5 mt-1">
            "{event.comment_content}"
          </p>
        )}
        <p className="text-[10px] text-stone-400 mt-1 ml-5">{formatTimeAgo(event.created_at)}</p>
      </div>
    </div>
  );
}

