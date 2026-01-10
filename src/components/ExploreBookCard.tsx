import { memo, useMemo, useCallback } from 'react';
import { BookCover } from './BookCover';
import { getStableBookKey } from '../lib/bookSocial';

interface ExploreBookCardProps {
  book: any; // OpenLibraryDoc
  index: number;
  stableKey: string;
  googleBookConverted: any;
  bookForActions: any;
  bookKey: string;
  alreadyAdded: boolean;
  socialCounts: { likes: number; comments: number; isLiked: boolean };
  addingBookId: string | null;
  onOpenDetails: (book: any) => void;
  onAddToLibrary: (book: any) => void;
  onCountsChange: (bookKey: string, nextLikes: number, nextComments: number, nextLiked: boolean) => void;
  onOpenComments: (book: any) => void;
  onShowToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  showPages?: boolean; // Afficher le nombre de pages (default: true)
}

export const ExploreBookCard = memo(function ExploreBookCard({
  book,
  stableKey,
  googleBookConverted,
  bookForActions,
  bookKey,
  alreadyAdded,
  socialCounts,
  addingBookId,
  onOpenDetails,
  onAddToLibrary,
  onCountsChange,
  onOpenComments,
  onShowToast,
  showPages = true,
}: ExploreBookCardProps) {
  const handleCoverClick = useCallback(() => {
    onOpenDetails(googleBookConverted);
  }, [googleBookConverted, onOpenDetails]);

  const handleTitleClick = useCallback(() => {
    onOpenDetails(googleBookConverted);
  }, [googleBookConverted, onOpenDetails]);

  const handleAddClick = useCallback(() => {
    onAddToLibrary(googleBookConverted);
  }, [googleBookConverted, onAddToLibrary]);

  const handleCountsChange = useCallback((nextLikes: number, nextComments: number, nextLiked: boolean) => {
    onCountsChange(bookKey, nextLikes, nextComments, nextLiked);
  }, [bookKey, onCountsChange]);

  const handleOpenComments = useCallback(() => {
    onOpenComments(googleBookConverted);
  }, [googleBookConverted, onOpenComments]);

  // Pages: utiliser number_of_pages_median si disponible
  const pages = book.number_of_pages_median || null;
  const pagesDisplay = pages ? `${pages} pages` : '— pages';

  return (
    <div
      className="flex flex-col rounded-2xl bg-white border border-black/5 p-2.5 shadow-[0_1px_10px_rgba(0,0,0,0.04)] overflow-hidden hover:shadow-[0_2px_15px_rgba(0,0,0,0.08)] transition-all active:scale-[0.99]"
    >
      <div
        role="button"
        tabIndex={0}
        className="relative cursor-pointer rounded-xl overflow-hidden bg-neutral-100 shadow-sm"
        onClick={handleCoverClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCoverClick();
          }
        }}
      >
        <BookCover
          title={book.title}
          author={book.authors}
          cover_i={book.cover_i || null}
          className="w-full aspect-[2/3] bg-neutral-100"
          showQuickActions={true}
          book={bookForActions}
          likes={socialCounts.likes}
          comments={socialCounts.comments}
          isLiked={socialCounts.isLiked}
          onCountsChange={handleCountsChange}
          onOpenComments={handleOpenComments}
          onShowToast={onShowToast}
        />
      </div>

      <div className="flex flex-col flex-1 mt-2.5">
        <div className="min-h-[48px] mb-2">
          <button
            type="button"
            className="text-[13px] font-semibold leading-snug line-clamp-2 cursor-pointer hover:text-primary text-left w-full pointer-events-auto mb-1"
            onClick={handleTitleClick}
          >
            {book.title}
          </button>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-black/50 line-clamp-1 flex-1">{book.authors}</p>
            {showPages && (
              <span className="text-[10px] text-black/40 font-medium whitespace-nowrap">{pagesDisplay}</span>
            )}
          </div>
        </div>

        <div className="mt-auto">
          {alreadyAdded ? (
            <button
              disabled
              className="w-full rounded-xl bg-gray-200 text-gray-600 py-2 text-[12px] font-medium disabled:opacity-60"
            >
              Déjà ajouté
            </button>
          ) : (
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddClick();
              }}
              disabled={addingBookId === book.id}
              className="w-full rounded-xl bg-black text-white py-2 text-[12px] font-medium active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
            >
              {addingBookId === book.id ? 'Ajout en cours...' : 'Ajouter'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

