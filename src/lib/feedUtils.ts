// Utility functions for feed grouping and processing

export interface GroupedEvent {
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
  source?: 'following' | 'discover';
  groupedLikes?: {
    actors: Array<{
      id: string;
      display_name?: string;
      username?: string;
      avatar_url?: string;
    }>;
    count: number;
  };
}

/**
 * Group likes by book_key within a 24h window
 * Comments are kept as individual items
 */
export function groupSocialEvents(events: GroupedEvent[]): GroupedEvent[] {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Separate likes and comments
  const likes: GroupedEvent[] = [];
  const comments: GroupedEvent[] = [];

  events.forEach(event => {
    if (event.event_type === 'book_comment') {
      comments.push(event);
    } else {
      likes.push(event);
    }
  });

  // Group likes by book_key within 24h window
  const likesByBook = new Map<string, GroupedEvent[]>();

  likes.forEach(like => {
    const eventDate = new Date(like.created_at);
    if (eventDate < twentyFourHoursAgo) {
      // Too old, keep as individual
      comments.push(like);
      return;
    }

    const key = like.book?.book_key || 'unknown';
    if (!likesByBook.has(key)) {
      likesByBook.set(key, []);
    }
    likesByBook.get(key)!.push(like);
  });

  // Create grouped like events
  const groupedLikes: GroupedEvent[] = [];

  likesByBook.forEach((bookLikes, bookKey) => {
    if (bookLikes.length === 1) {
      // Single like, keep as is
      comments.push(bookLikes[0]);
    } else {
      // Multiple likes, group them
      const sortedLikes = bookLikes.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const mostRecent = sortedLikes[0];

      groupedLikes.push({
        ...mostRecent,
        groupedLikes: {
          actors: sortedLikes.map(like => like.actor),
          count: sortedLikes.length,
        },
      });
    }
  });

  // Combine: comments first (priority), then grouped likes
  const result = [...comments, ...groupedLikes];

  // Sort by created_at desc
  return result.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Filter and limit discover events to comments only (max 5)
 */
export function filterDiscoverEvents(events: GroupedEvent[]): GroupedEvent[] {
  return events
    .filter(e => e.event_type === 'book_comment')
    .slice(0, 5);
}

