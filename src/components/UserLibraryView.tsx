import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Book, ArrowLeft } from 'lucide-react';
import { BookCover } from './BookCover';
import { BookDetailsModal } from './BookDetailsModal';

interface UserLibraryViewProps {
  userId: string;
  userName: string;
  onClose: () => void;
  mode?: 'all' | 'liked' | 'reading';
}

type BookStatus = 'reading' | 'completed' | 'want_to_read';

export function UserLibraryView({ userId, userName, onClose, mode = 'all' }: UserLibraryViewProps) {
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [filter, setFilter] = useState<BookStatus>('reading');
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<any>(null);

  useEffect(() => {
    if (mode === 'liked') {
      loadLikedBooks();
    } else {
      loadUserBooks();
    }
  }, [filter, userId, mode]);

  const loadUserBooks = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('user_books')
      .select(`
        id,
        status,
        current_page,
        book_id,
        created_at,
        updated_at,
        book:books (
          id,
          title,
          author,
          cover_url,
          total_pages,
          description,
          description_clean,
          isbn,
          google_books_id,
          edition
        )
      `)
      .eq('user_id', userId)
      .eq('status', filter)
      .order('updated_at', { ascending: false });

    console.log('[user_books fetch UserLibraryView]', { statusFilter: filter, userId, data, error });

    if (error) {
      console.error('ERROR DETAILS:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    }

    if (data) {
      console.log('[user_books fetch UserLibraryView] Data received:', data.length, 'books');
      setUserBooks(data);
    } else {
      setUserBooks([]);
    }

    setLoading(false);
  };

  const loadLikedBooks = async () => {
    setLoading(true);

    // 1) Fetch liked book_keys from activity_events
    const { data: likedEvents, error: eventsError } = await supabase
      .from('activity_events')
      .select('book_key, created_at')
      .eq('actor_id', userId)
      .eq('event_type', 'book_like')
      .order('created_at', { ascending: false });

    if (eventsError) {
      console.error('[loadLikedBooks] Error fetching activity_events:', eventsError);
      setUserBooks([]);
      setLoading(false);
      return;
    }

    if (!likedEvents || likedEvents.length === 0) {
      setUserBooks([]);
      setLoading(false);
      return;
    }

    const bookKeys = likedEvents.map(e => e.book_key).filter(Boolean);

    if (bookKeys.length === 0) {
      setUserBooks([]);
      setLoading(false);
      return;
    }

    // 2) Fetch book details from books_cache
    const { data: booksData, error: booksError } = await supabase
      .from('books_cache')
      .select('book_key, title, author, cover_url')
      .in('book_key', bookKeys);

    if (booksError) {
      console.error('[loadLikedBooks] Error fetching books_cache:', booksError);
      setUserBooks([]);
      setLoading(false);
      return;
    }

    // 3) Combine data and format like user_books for consistency
    const formattedBooks = (booksData || []).map((book) => ({
      id: book.book_key,
      book: {
        id: book.book_key,
        title: book.title || 'Titre inconnu',
        author: book.author || 'Auteur inconnu',
        cover_url: book.cover_url || null,
        total_pages: null,
        description: null,
        description_clean: null,
        isbn: null,
        google_books_id: null,
        edition: null,
      },
      status: 'liked' as const,
      current_page: 0,
      book_id: book.book_key,
      created_at: likedEvents.find(e => e.book_key === book.book_key)?.created_at || new Date().toISOString(),
      updated_at: likedEvents.find(e => e.book_key === book.book_key)?.created_at || new Date().toISOString(),
    }));

    setUserBooks(formattedBooks);
    setLoading(false);
  };

  const getProgress = (currentPage: number, totalPages: number) => {
    if (!totalPages) return 0;
    return Math.round((currentPage / totalPages) * 100);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 bg-background-light z-10 border-b border-gray-200">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-text-sub-light" />
            </button>
            <h1 className="text-xl font-bold">
              {mode === 'liked' ? `Livres likés de ${userName}` : `Bibliothèque de ${userName}`}
            </h1>
          </div>

          {mode !== 'liked' && (
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setFilter('reading')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                  filter === 'reading'
                    ? 'bg-primary text-black shadow-sm'
                    : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
                }`}
              >
                En cours
              </button>
              <button
                onClick={() => setFilter('want_to_read')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                  filter === 'want_to_read'
                    ? 'bg-primary text-black shadow-sm'
                    : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
                }`}
              >
                À lire
              </button>
              <button
                onClick={() => setFilter('completed')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                  filter === 'completed'
                    ? 'bg-primary text-black shadow-sm'
                    : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
                }`}
              >
                Terminé
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-center py-12 text-text-sub-light">Chargement...</div>
        ) : userBooks.length === 0 ? (
          <div className="text-center py-12">
            <Book className="w-16 h-16 mx-auto mb-4 text-text-sub-light" />
            <p className="text-lg font-medium text-text-main-light mb-2">
              {mode === 'liked' && 'Aucun livre liké'}
              {mode !== 'liked' && filter === 'reading' && 'Aucun livre en cours'}
              {mode !== 'liked' && filter === 'want_to_read' && 'Aucun livre à lire'}
              {mode !== 'liked' && filter === 'completed' && 'Aucun livre terminé'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {userBooks.map((userBook) => {
              const book = userBook.book;
              if (!book) {
                console.warn('UserBook without book data:', userBook);
                return null;
              }
              const progress = getProgress(userBook.current_page, book.total_pages || 0);

              return (
                <div
                  key={userBook.id}
                  className="flex gap-4 p-4 bg-card-light rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => setSelectedBook(book)}
                >
                  <BookCover
                    coverUrl={book.cover_url}
                    title={book.title}
                    author={book.author || 'Auteur inconnu'}
                    className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-md"
                  />

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-text-main-light mb-1 line-clamp-2">{book.title}</h3>
                    <p className="text-sm text-text-sub-light mb-2 truncate">{book.author}</p>

                    {filter === 'reading' && book.total_pages > 0 && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs text-text-sub-light mb-1">
                          <span>
                            {userBook.current_page} / {book.total_pages} pages
                          </span>
                          <span className="font-semibold">{progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {book.genre && (
                        <span className="inline-block text-xs bg-primary/20 text-primary px-2 py-1 rounded-full font-medium">
                          {book.genre}
                        </span>
                      )}
                      {book.total_pages > 0 && (
                        <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
                          {book.total_pages} pages
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedBook && (
        <BookDetailsModal
          book={{
            id: selectedBook.id,
            title: selectedBook.title,
            author: selectedBook.author,
            cover_url: selectedBook.cover_url,
            genre: selectedBook.genre,
            total_pages: selectedBook.total_pages,
            description: selectedBook.description,
            description_clean: selectedBook.description_clean,
            publisher: selectedBook.publisher,
            isbn: selectedBook.isbn,
          }}
          onClose={() => setSelectedBook(null)}
          showAddButton={true}
          onAddToLibrary={() => {
            // Cette fonctionnalité sera gérée par le modal BookDetailsModal
            setSelectedBook(null);
          }}
        />
      )}
    </div>
  );
}

