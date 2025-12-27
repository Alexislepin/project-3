import { Heart, MessageCircle } from 'lucide-react';
import { BookCover } from './BookCover';

interface FeedRowProps {
  event: {
    id: string;
    actor: {
      id: string;
      display_name?: string;
      username?: string;
      avatar_url?: string;
    };
    event_type: 'book_like' | 'book_comment';
    book: {
      book_key: string;
      title: string;
      author?: string;
      cover_url?: string;
    };
    comment_content?: string | null;
    created_at: string;
    groupedLikes?: {
      actors: Array<{ id: string; display_name?: string; username?: string; avatar_url?: string }>;
      count: number;
    };
  };
  onActorClick: (actorId: string) => void;
  onBookClick: () => void;
  formatTimeAgo: (dateString: string) => string;
}

export function FeedRow({ event, onActorClick, onBookClick, formatTimeAgo }: FeedRowProps) {
  const actorName = event.actor?.display_name || event.actor?.username || 'Utilisateur';

  // Grouped likes
  if (event.event_type === 'book_like' && event.groupedLikes) {
    const { actors, count } = event.groupedLikes;
    const firstActor = actors[0];
    const firstName = firstActor?.display_name || firstActor?.username || 'Utilisateur';
    const othersCount = count - 1;

    return (
      <div
        onClick={onBookClick}
        className="flex items-center gap-2.5 p-2.5 bg-white rounded-2xl shadow-sm hover:bg-gray-50 transition-colors cursor-pointer"
      >
        {/* Avatars stack */}
        <div className="flex -space-x-1.5 shrink-0">
          {actors.slice(0, 3).map((actor, idx) => (
            <button
              key={actor.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onActorClick(actor.id);
              }}
              className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden border-2 border-white hover:ring-2 hover:ring-primary transition shrink-0"
            >
              {actor.avatar_url ? (
                <img
                  src={actor.avatar_url}
                  alt={actor.display_name || actor.username || ''}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-semibold text-stone-600">
                  {(actor.display_name || actor.username || 'U').charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-stone-900 line-clamp-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onActorClick(firstActor.id);
              }}
              className="font-semibold hover:underline"
            >
              {firstName}
            </button>
            {othersCount > 0 && (
              <>
                {' '}
                <span className="font-medium">+ {othersCount} autre{othersCount > 1 ? 's' : ''}</span>
              </>
            )}
            {' '}ont aimé{' '}
            <span className="font-semibold">{event.book?.title || 'ce livre'}</span>
          </p>
          <p className="text-[10px] text-stone-400 mt-0.5">{formatTimeAgo(event.created_at)}</p>
        </div>

        {/* Book Cover */}
        {event.book?.cover_url && (
          <div className="w-10 h-14 shrink-0 rounded overflow-hidden">
            <BookCover
              coverUrl={event.book.cover_url}
              title={event.book.title || ''}
              author={event.book.author || ''}
              custom_cover_url={(event.book as any).custom_cover_url ?? null}
              openlibrary_cover_id={(event.book as any).openlibrary_cover_id ?? null}
              className="w-full h-full"
            />
          </div>
        )}
      </div>
    );
  }

  // Single event (comment or single like)
  return (
    <div
      onClick={onBookClick}
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
          {event.event_type === 'book_like' ? (
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
            {event.event_type === 'book_like' ? 'a aimé' : 'a commenté'}{' '}
            <span className="font-semibold">{event.book?.title || 'ce livre'}</span>
          </p>
        </div>
        {event.event_type === 'book_comment' && event.comment_content && (
          <p className="text-xs text-stone-600 line-clamp-1 ml-5">
            "{event.comment_content}"
          </p>
        )}
        <p className="text-[10px] text-stone-400 mt-0.5 ml-5">{formatTimeAgo(event.created_at)}</p>
      </div>

      {/* Book Cover */}
      {event.book?.cover_url && (
        <div className="w-10 h-14 shrink-0 rounded overflow-hidden">
          <BookCover
            coverUrl={event.book.cover_url}
            title={event.book.title || ''}
            author={event.book.author || ''}
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  );
}

