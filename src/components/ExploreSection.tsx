import { ExploreBookCard } from './ExploreBookCard';
import { canonicalBookKey } from '../lib/bookSocial';
import type { OpenLibraryDoc } from '../lib/openLibraryBrowse';

interface ExploreSectionProps {
  title: string;
  icon: string;
  books: OpenLibraryDoc[];
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

export function ExploreSection({
  title,
  icon,
  books,
  exploreSocialCounts,
  booksInLibrary,
  addingBookId,
  isBookInLibrary,
  onOpenDetails,
  onAddToLibrary,
  onCountsChange,
  onOpenComments,
  onShowToast,
}: ExploreSectionProps) {
  if (books.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="text-lg">{icon}</span>}
        <h3 className="text-base font-bold text-text-main-light">{title}</h3>
      </div>
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex gap-3" style={{ width: 'max-content' }}>
          {books.map((book, idx) => {
            const isbn = Array.isArray(book.isbn) ? book.isbn[0] : book.isbn;
            const bookForCanonical = {
              id: book.key || book.id,
              key: book.key,
              isbn: isbn,
              isbn13: isbn,
              isbn10: isbn,
              openLibraryKey: book.key,
            };
            const bookKey = canonicalBookKey(bookForCanonical);
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
            return (
              <div
                key={book.key || book.id || idx}
                className="flex-shrink-0 w-32"
              >
                <ExploreBookCard
                  book={book}
                  index={idx}
                  stableKey={bookKey}
                  googleBookConverted={googleBookConverted}
                  bookForActions={googleBookConverted}
                  bookKey={bookKey}
                  alreadyAdded={isBookInLibrary(googleBookConverted)}
                  socialCounts={exploreSocialCounts[bookKey] || { likes: 0, comments: 0, isLiked: false }}
                  addingBookId={addingBookId}
                  onOpenDetails={onOpenDetails}
                  onAddToLibrary={onAddToLibrary}
                  onCountsChange={onCountsChange}
                  onOpenComments={onOpenComments}
                  onShowToast={onShowToast}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

