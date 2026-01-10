import { memo, useCallback } from 'react';
import { BookCover } from './BookCover';
import type { SearchResult } from '../hooks/useExplorerSearch';

interface SearchResultCardProps {
  book: SearchResult;
  isInLibrary: boolean;
  onOpenDetails: (book: SearchResult) => void;
}

/**
 * Large book card for search results
 * No "Add" button - clicking opens BookDetailsModal where user can add
 */
export const SearchResultCard = memo(function SearchResultCard({
  book,
  isInLibrary,
  onOpenDetails,
}: SearchResultCardProps) {
  const handleCoverClick = useCallback(() => {
    onOpenDetails(book);
  }, [book, onOpenDetails]);

  return (
    <div
      className="group relative bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer active:scale-[0.98]"
      onClick={handleCoverClick}
    >
      {/* Cover Image */}
      <div className="relative w-full aspect-[3/4] bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
        <BookCover
          coverUrl={book.thumbnail}
          title={book.title}
          author={book.authors}
          isbn={book.isbn || undefined}
          isbn13={book.isbn13}
          isbn10={book.isbn10}
          cover_i={(book as any).cover_i}
          openlibrary_cover_id={(book as any).cover_i}
          googleCoverUrl={book.googleCoverUrl}
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

