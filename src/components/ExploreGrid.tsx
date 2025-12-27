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
      // Handle ISBN as string or array (OpenLibrary often returns array)
      const isbn = Array.isArray(book.isbn) ? book.isbn[0] : book.isbn;
      
      // Convert OpenLibraryDoc to GoogleBook for modals and actions
      const googleBookConverted = {
        id: book.key || book.id,
        title: book.title,
        authors: book.authors,
        thumbnail: book.cover_i 
          ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg?default=false` 
          : undefined,
        isbn: isbn,
        isbn13: isbn,
        isbn10: isbn,
        pageCount: book.number_of_pages_median || undefined,
        openLibraryKey: book.key,
        key: book.key,
      };
      
      // Book object for actions (use googleBookConverted for canonical key)
      const bookForActions = {
        id: book.key || book.id,
        key: book.key,
        isbn13: isbn,
        isbn10: isbn,
        isbn: isbn,
        title: book.title,
        author: book.authors,
        cover_url: googleBookConverted.thumbnail,
        openLibraryKey: book.key,
      };
      
      // Use canonical book key for social counts (ensures consistency with BookSocial)
      // Pass openLibraryKey explicitly to ensure priority
      const bookForCanonical = {
        ...googleBookConverted,
        openLibraryKey: book.key,
        key: book.key,
      };
      const bookKey = canonicalBookKey(bookForCanonical);
      
      // Debug log (temporary)
      console.debug('[ExploreGrid] key', book.title, bookKey, { key: book.key, isbn: book.isbn });
      
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
      {booksWithKeys.map(({ book, index, stableKey, googleBookConverted, bookForActions, bookKey, alreadyAdded, socialCounts }) => (
        <ExploreBookCard
          key={stableKey}
          book={book}
          index={index}
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

