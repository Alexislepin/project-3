import { supabase } from './supabase';
import { canonicalBookKey, toggleBookLike as toggleBookLikeRPC } from './bookSocial';
import { socialEvents } from './events';

interface ToggleBookLikeOptions {
  book: any; // Book object (id/key/isbn/title/authors/coverUrl etc)
  userId: string;
  currentLikesCount: number;
  currentCommentsCount: number;
  currentlyLiked: boolean;
  onSuccess?: (newLikesCount: number, newCommentsCount: number, newLiked: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Fonction partagée pour toggle like/unlike d'un livre
 * Uses RPC toggle_book_like only - never touches book_likes directly
 * 
 * @returns Promise<{ newLikesCount: number; newCommentsCount: number; newLiked: boolean }>
 */
export async function toggleBookLike({
  book,
  userId,
  currentLikesCount,
  currentCommentsCount,
  currentlyLiked,
  onSuccess,
  onError,
}: ToggleBookLikeOptions): Promise<{
  newLikesCount: number;
  newCommentsCount: number;
  newLiked: boolean;
}> {
  try {
    // CRITICAL: Calculate canonical key
    const bookKey = canonicalBookKey(book);
    if (!bookKey || bookKey === 'unknown') {
      console.warn('[toggleBookLike] Missing or invalid bookKey:', { bookKey });
      const error = new Error('Missing or invalid bookKey');
      onError?.(error);
      return {
        newLikesCount: currentLikesCount,
        newCommentsCount: currentCommentsCount,
        newLiked: currentlyLiked,
      };
    }

    // CRITICAL: Use RPC only - delegate to bookSocial.toggleBookLike
    const result = await toggleBookLikeRPC(bookKey, userId, book);

    // Get updated likes count from RPC response via event or current count
    // The RPC returns { liked: boolean, created: boolean }
    // We use the liked boolean to update UI state
    const newLiked = result.liked;
    const newCount = newLiked ? currentLikesCount + 1 : Math.max(0, currentLikesCount - 1);

    const finalResult = {
      newLikesCount: newCount,
      newCommentsCount: currentCommentsCount,
      newLiked,
    };

    // Emit social event (the RPC already dispatches 'book-social-counts-changed')
    socialEvents.emitSocialChanged(bookKey);

    onSuccess?.(finalResult.newLikesCount, finalResult.newCommentsCount, finalResult.newLiked);
    return finalResult;
  } catch (error: any) {
    console.error('[toggleBookLike] error:', error);
    onError?.(error);
    // Return current state on error
    return {
      newLikesCount: currentLikesCount,
      newCommentsCount: currentCommentsCount,
      newLiked: currentlyLiked,
    };
  }
}

