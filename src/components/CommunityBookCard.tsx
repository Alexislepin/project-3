import { memo, useCallback } from 'react';
import { BookCover } from './BookCover';
import { Heart, MessageCircle } from 'lucide-react';
import { canonicalBookKey } from '../lib/bookSocial';
import type { CommunityBookRow } from '../hooks/useCommunityFeed';

interface CommunityBookCardProps {
  book: CommunityBookRow;
  socialCounts: { likes: number; comments: number; isLiked: boolean };
  isInLibrary: boolean;
  isLiking: boolean; // Indicates if like toggle is in-flight
  customCoverUrlOverride?: string | null; // User's custom cover (from their library) to override default
  onOpenDetails: (book: CommunityBookRow) => void;
  onToggleLike: (bookKey: string) => void;
  onOpenComments: (book: CommunityBookRow) => void;
  onOpenLikers: (book: CommunityBookRow) => void; // Opens who liked modal
}

/**
 * Helper to detect low-quality cover URLs that should be replaced
 */
function isBadCoverUrl(url: string | null): boolean {
  if (!url) return true;
  // Low-res OpenLibrary S.jpg thumbnails
  if (url.includes('openlibrary.org') && url.includes('-S.jpg')) return true;
  // Known placeholder patterns
  if (url.includes('placeholder')) return true;
  return false;
}

/**
 * Community book card with always-visible footer (Instagram/Strava style)
 * Features:
 * - Large cover image
 * - Footer always visible with heart, likes count (clickable), and comments
 * - Clean design without overlays on hover
 */
export const CommunityBookCard = memo(function CommunityBookCard({
  book,
  socialCounts,
  isInLibrary,
  isLiking,
  customCoverUrlOverride,
  onOpenDetails,
  onToggleLike,
  onOpenComments,
  onOpenLikers,
}: CommunityBookCardProps) {
  const bookKey = canonicalBookKey({ book_key: book.book_key }) || book.book_key;

  const handleCoverClick = useCallback(() => {
    onOpenDetails(book);
  }, [book, onOpenDetails]);

  const handleLikeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLiking) return; // Prevent spam clicks
    onToggleLike(bookKey);
  }, [bookKey, onToggleLike, isLiking]);

  const handleLikesCountClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenLikers(book);
  }, [book, onOpenLikers]);

  const handleCommentsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenComments(book);
  }, [book, onOpenComments]);

  // Pass cover props with correct priority:
  // - customCoverUrlOverride (highest priority - user's custom cover from their library)
  // - coverUrl = book.cover_url (from DB, if not bad) - but only if no custom override
  // - googleCoverUrl = ONLY if no custom override AND book.cover_url is null/empty AND no openlibrary_cover_id
  const hasValidCoverUrl = book.cover_url && !isBadCoverUrl(book.cover_url);
  const hasOpenLibraryCoverId = book.openlibrary_cover_id && book.openlibrary_cover_id > 0;
  
  // googleCoverUrl should only be used as last resort (and only if no custom override)
  const googleCoverUrl = (!customCoverUrlOverride && !hasValidCoverUrl && !hasOpenLibraryCoverId && book.google_books_id)
    ? `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`
    : null;

  return (
    <div
      className="group relative bg-card-light rounded-2xl overflow-hidden shadow-sm transition-all duration-300 cursor-pointer active:scale-[0.98] flex flex-col h-full"
      onClick={handleCoverClick}
    >
      {/* Cover Image */}
      <div className="relative w-full aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden flex-shrink-0">
        <BookCover
          bookKey={bookKey || undefined}
          book={book}
          custom_cover_url={customCoverUrlOverride || null}
          coverUrl={customCoverUrlOverride ? null : (hasValidCoverUrl ? book.cover_url : null)}
          title={book.title || ''}
          author={book.author || ''}
          isbn={book.isbn || null}
          openlibrary_cover_id={book.openlibrary_cover_id}
          googleCoverUrl={customCoverUrlOverride ? null : googleCoverUrl}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
        {/* Title and Author - Fixed height to ensure footer alignment */}
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="font-bold text-base text-text-main-light mb-1 line-clamp-2 leading-tight min-h-[2.5rem]">
            {book.title || 'Titre inconnu'}
          </h3>
          <p className="text-sm text-text-sub-light line-clamp-1 min-h-[1.25rem]">
            {book.author || 'Auteur inconnu'}
          </p>
        </div>

        {/* Meta info (pages) */}
        {book.total_pages && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-text-sub-light px-2 py-1 rounded-full dark:bg-gray-100 dark:text-gray-900">
              {book.total_pages} pages
            </span>
          </div>
        )}

        {/* Spacer to push footer to bottom */}
        <div className="flex-1 min-h-[0.5rem]" />

        {/* Footer: Always visible social actions (Instagram/Strava style) - Pinned to bottom */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-gray-100 mt-auto flex-shrink-0">
          {/* Heart button (toggle like) - Fixed height */}
          <button
            onClick={handleLikeClick}
            disabled={isLiking}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-90 flex-shrink-0 ${
              socialCounts.isLiked
                ? 'bg-red-50 text-red-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } ${isLiking ? 'opacity-50 cursor-wait' : ''}`}
            title={socialCounts.isLiked ? 'Ne plus aimer' : 'Aimer'}
          >
            <Heart className={`w-5 h-5 ${socialCounts.isLiked ? 'fill-current' : ''}`} />
          </button>

          {/* Likes count button (opens likers modal) - Fixed height */}
          <button
            onClick={handleLikesCountClick}
            disabled={socialCounts.likes === 0}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-xl transition-all active:scale-95 flex-shrink-0 ${
              socialCounts.likes > 0
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-gray-50 text-gray-400 cursor-not-allowed'
            }`}
            title={socialCounts.likes > 0 ? `${socialCounts.likes} ${socialCounts.likes === 1 ? 'personne aime' : 'personnes aiment'}` : 'Aucun like'}
          >
            <span className="text-sm font-semibold">{socialCounts.likes}</span>
          </button>

          {/* Comments button - Fixed height */}
          <button
            onClick={handleCommentsClick}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all active:scale-95 flex-shrink-0"
            title={`${socialCounts.comments} ${socialCounts.comments === 1 ? 'commentaire' : 'commentaires'}`}
          >
            <MessageCircle className="w-4 h-4" />
            {socialCounts.comments > 0 && (
              <span className="text-sm font-semibold">{socialCounts.comments}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
