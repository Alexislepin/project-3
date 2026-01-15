import { memo, useCallback } from 'react';
import { BookCover } from './BookCover';
import type { SearchResult } from '../hooks/useExplorerSearch';

interface SearchResultCardProps {
  book: SearchResult;
  isInLibrary: boolean;
  customCoverUrlOverride?: string | null; // User's custom cover (from their library) to override default
  onOpenDetails: (book: SearchResult) => void;
}

/**
 * Large book card for search results
 * No "Add" button - clicking opens BookDetailsModal where user can add
 */
export const SearchResultCard = memo(function SearchResultCard({
  book,
  isInLibrary,
  customCoverUrlOverride,
  onOpenDetails,
}: SearchResultCardProps) {
  const handleCoverClick = useCallback(() => {
    onOpenDetails(book);
  }, [book, onOpenDetails]);

  // Derive bookKey from ISBN for pooled cover lookup
  const cleanIsbn = (book.isbn13 || book.isbn10 || book.isbn)?.replace(/[-\s]/g, '');
  const bookKey = cleanIsbn && cleanIsbn.length >= 10 ? `isbn:${cleanIsbn}` : null;

  // Pass cover props with correct priority:
  // - customCoverUrlOverride (highest priority - user's custom cover from their library)
  // - openlibrary_cover_id: from cover_i if available (OpenLibrary search results)
  // - coverUrl: from thumbnail if available - but only if no custom override
  // - googleCoverUrl: ONLY if no custom override AND thumbnail is null/empty AND no openlibrary_cover_id
  const openLibraryCoverId = (book as any).cover_i && typeof (book as any).cover_i === 'number' && (book as any).cover_i > 0
    ? (book as any).cover_i
    : null;
  const hasThumbnail = book.thumbnail && !book.thumbnail.includes('placeholder') && !book.thumbnail.includes('image_not_available');
  
  // googleCoverUrl should only be used as last resort (and only if no custom override)
  const googleCoverUrlToPass = (!customCoverUrlOverride && !hasThumbnail && !openLibraryCoverId && book.googleCoverUrl)
    ? book.googleCoverUrl
    : null;

  return (
    <div
      className="group relative bg-card-light rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer active:scale-[0.98]"
      onClick={handleCoverClick}
    >
      {/* Cover Image */}
      <div className="relative w-full aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        <BookCover
          bookKey={bookKey || undefined}
          book={book}
          custom_cover_url={customCoverUrlOverride || null}
          coverUrl={customCoverUrlOverride ? null : (hasThumbnail ? book.thumbnail : null)}
          title={book.title}
          author={book.authors}
          isbn={book.isbn || undefined}
          isbn13={book.isbn13}
          isbn10={book.isbn10}
          cover_i={openLibraryCoverId}
          openlibrary_cover_id={openLibraryCoverId}
          googleCoverUrl={customCoverUrlOverride ? null : googleCoverUrlToPass}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-bold text-lg text-text-main-light mb-1 line-clamp-2 leading-tight">
          {book.title}
        </h3>
        <p className="text-sm text-text-sub-light mb-3 line-clamp-1">
          {book.authors || 'Auteur inconnu'}
        </p>

        {/* Meta info */}
        <div className="flex items-center gap-2">
          {book.pageCount && (
            <span className="text-xs text-text-sub-light bg-gray-100 px-2 py-1 rounded-full">
              {book.pageCount} pages
            </span>
          )}
          {book.isbn && (
            <span className="text-xs text-text-sub-light bg-gray-100 px-2 py-1 rounded-full">
              ISBN: {book.isbn}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

