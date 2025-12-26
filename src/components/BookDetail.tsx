import { X } from 'lucide-react';
import { type Book } from '../lib/googleBooks';
import { BookCover } from './BookCover';

interface BookDetailProps {
  book: Book;
  onClose: () => void;
  onAdd: (book: Book) => void;
}

export function BookDetail({ book, onClose, onAdd }: BookDetailProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background-light rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background-light border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Détail du livre</h2>
          <button
            onClick={onClose}
            className="text-text-sub-light hover:text-text-main-light transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-6 mb-6">
            <BookCover
              coverUrl={book.thumbnail}
              title={book.title}
              author={book.authors || 'Auteur inconnu'}
              className="w-32 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-lg"
            />

            <div className="flex-1">
              <h1 className="text-2xl font-bold text-text-main-light mb-2">{book.title}</h1>
              <p className="text-lg text-text-sub-light mb-4">{book.authors}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {book.category && (
                  <div className="flex items-center gap-1.5 bg-primary/20 text-primary px-3 py-1.5 rounded-lg">
                    <span className="text-sm font-medium">{book.category}</span>
                  </div>
                )}
                {book.pageCount && (
                  <div className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg">
                    <span className="text-sm font-medium">{book.pageCount} pages</span>
                  </div>
                )}
                {book.publisher && (
                  <div className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg">
                    <span className="text-sm font-medium">{book.publisher}</span>
                  </div>
                )}
              </div>

              {book.isbn && (
                <div className="mb-4">
                  <p className="text-sm text-text-sub-light">
                    <span className="font-semibold">ISBN:</span> {book.isbn}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-text-main-light mb-3">Résumé</h3>
            <div className="prose prose-sm max-w-none text-text-sub-light">
              {book.description ? (
                <p className="leading-relaxed whitespace-pre-line">{book.description}</p>
              ) : (
                <p className="text-text-sub-light italic">Pas de résumé disponible.</p>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              onAdd(book);
              onClose();
            }}
            className="w-full py-4 bg-primary text-black rounded-xl font-bold text-lg hover:brightness-95 transition-all shadow-md"
          >
            Ajouter à ma bibliothèque
          </button>
        </div>
      </div>
    </div>
  );
}
