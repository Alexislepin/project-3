import { memo, useCallback, useMemo } from 'react';
import { ExploreBookCard } from './ExploreBookCard';
import { canonicalBookKey } from '../lib/bookSocial';

interface ExploreGridProps {
  exploreBooks: any[];
  exploreSocialCounts: any;
  booksInLibrary: Set<string>;
  addingBookId: string | null;
  isBookInLibrary: (book: any) => boolean;
  onOpenDetails: (book: any) => void;
  onAddToLibrary: (book: any) => void;
  onCountsChange: (bookKey: string, nextLikes: number, nextComments: number, nextLiked: boolean) => void;
  onOpenComments: (book: any) => void;
  onShowToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export const ExploreGrid = memo(function ExploreGrid({
  exploreBooks,
  exploreSocialCounts,
  booksInLibrary,
  addingBookId,
  isBookInLibrary,
  onOpenDetails,
  onAddToLibrary,
  onCountsChange,
  onOpenComments,
  onShowToast,
}: ExploreGridProps) {
  // Memoize converted books and keys
  const booksWithKeys = useMemo(() => {
    return exploreBooks.map((book, index) => {
      // Convert OpenLibraryDoc to GoogleBook for modals and actions
      const googleBookConverted = {
        id: book.key || book.id,
        title: book.title,
        authors: book.authors,
        thumbnail: book.cover_i 
          ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg?default=false` 
          : undefined,
        isbn: book.isbn,
        isbn13: book.isbn,
        isbn10: book.isbn,
        pageCount: book.number_of_pages_median || undefined,
        openLibraryKey: book.key,
        key: book.key,
      };
      
      // Book object for actions (use googleBookConverted for canonical key)
      const bookForActions = {
        id: book.key || book.id,
        key: book.key,
        isbn13: book.isbn,
        isbn10: book.isbn,
        isbn: book.isbn,
        title: book.title,
        author: book.authors,
        cover_url: googleBookConverted.thumbnail,
        openLibraryKey: book.key,
      };
      
      // Use canonical book key for social counts (ensures consistency with BookSocial)
      // This is the SINGLE source of truth for book_key across the app
      const bookKey = canonicalBookKey(googleBookConverted);
      
      // Use bookKey as stable key for React key (same as social counts)
      const stableKey = bookKey;
      
      const alreadyAdded = isBookInLibrary(googleBookConverted);
      const socialCounts = exploreSocialCounts[bookKey] || { likes: 0, comments: 0, isLiked: false };
      
      return {
        book,
        index,
        stableKey,
        googleBookConverted,
        bookForActions,
        bookKey,
        alreadyAdded,
        socialCounts,
      };
    });
  }, [exploreBooks, exploreSocialCounts, isBookInLibrary]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {booksWithKeys.map(({ book, stableKey, googleBookConverted, bookForActions, bookKey, alreadyAdded, socialCounts }) => (
        <ExploreBookCard
          key={stableKey}
          book={book}
          index={0} // Not used anymore
          stableKey={stableKey}
          googleBookConverted={googleBookConverted}
          bookForActions={bookForActions}
          bookKey={bookKey}
          alreadyAdded={alreadyAdded}
          socialCounts={socialCounts}
          addingBookId={addingBookId}
          onOpenDetails={onOpenDetails}
          onAddToLibrary={onAddToLibrary}
          onCountsChange={onCountsChange}
          onOpenComments={onOpenComments}
          onShowToast={onShowToast}
        />
      ))}
    </div>
  );
});

