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

  // Resolve cover URL with same logic as Library
  // Priority: cover_url (if not bad) > openlibrary_cover_id > googleCoverUrl > ISBN fallback
  let resolvedCoverUrl: string | null = null;
  
  if (book.cover_url && !isBadCoverUrl(book.cover_url)) {
    resolvedCoverUrl = book.cover_url;
  }
  
  const googleCoverUrl = book.google_books_id 
    ? `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`
    : null;

  return (
    <div
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98]"
      onClick={handleCoverClick}
    >
      {/* Cover Image */}
      <div className="relative w-full aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        <BookCover
          coverUrl={resolvedCoverUrl}
          title={book.title || ''}
          author={book.author || ''}
          isbn={book.isbn || null}
          openlibrary_cover_id={book.openlibrary_cover_id}
          googleCoverUrl={googleCoverUrl}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3">
        {/* Title and Author */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base text-text-main-light mb-1 line-clamp-2 leading-tight">
            {book.title || 'Titre inconnu'}
          </h3>
          <p className="text-sm text-text-sub-light line-clamp-1">
            {book.author || 'Auteur inconnu'}
          </p>
        </div>

        {/* Meta info (pages) */}
        {book.total_pages && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-sub-light bg-gray-100 px-2 py-1 rounded-full">
              {book.total_pages} pages
            </span>
          </div>
        )}

        {/* Footer: Always visible social actions (Instagram/Strava style) - Centered */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-gray-100">
          {/* Heart button (toggle like) */}
          <button
            onClick={handleLikeClick}
            disabled={isLiking}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-90 ${
              socialCounts.isLiked
                ? 'bg-red-50 text-red-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } ${isLiking ? 'opacity-50 cursor-wait' : ''}`}
            title={socialCounts.isLiked ? 'Ne plus aimer' : 'Aimer'}
          >
            <Heart className={`w-5 h-5 ${socialCounts.isLiked ? 'fill-current' : ''}`} />
          </button>

          {/* Likes count button (opens likers modal) */}
          <button
            onClick={handleLikesCountClick}
            disabled={socialCounts.likes === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all active:scale-95 ${
              socialCounts.likes > 0
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-gray-50 text-gray-400 cursor-not-allowed'
            }`}
            title={socialCounts.likes > 0 ? `${socialCounts.likes} ${socialCounts.likes === 1 ? 'personne aime' : 'personnes aiment'}` : 'Aucun like'}
          >
            <span className="text-sm font-semibold">{socialCounts.likes}</span>
          </button>

          {/* Comments button */}
          <button
            onClick={handleCommentsClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all active:scale-95"
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
