import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Book, ArrowLeft } from 'lucide-react';
import { BookCover } from './BookCover';
import { BookDetailsModal } from './BookDetailsModal';
import { resolveBookCover } from '../lib/bookCover';

interface UserLibraryViewProps {
  userId: string;
  userName: string;
  onClose: () => void;
  mode?: 'all' | 'liked' | 'reading';
}

type BookStatus = 'reading' | 'completed' | 'want_to_read';

export function UserLibraryView({ userId, userName, onClose, mode = 'all' }: UserLibraryViewProps) {
  const [userBooks, setUserBooks] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | BookStatus>(mode === 'reading' ? 'reading' : 'all');
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

    const baseSelect = `
      id,
      status,
      current_page,
      book_id,
      created_at,
      updated_at,
      custom_cover_url,
      book:books (
        id,
        title,
        author,
        cover_url,
        total_pages,
        description,
        isbn,
        google_books_id,
        edition,
        openlibrary_cover_id
      )
    `;

    let query = supabase
      .from('user_books')
      .select(baseSelect)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

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

    try {
      // ✅ Utiliser book_likes avec JOIN books via book_uuid (comme Profile.tsx)
      // ✅ SOFT DELETE: Filtrer seulement les likes actifs (deleted_at IS NULL)
      const { data: likesData, error: likesError } = await supabase
        .from('book_likes')
        .select(`
          id,
          created_at,
          book_uuid,
          book_key,
          book:books!book_likes_book_uuid_fkey (
            id,
            title,
            author,
            cover_url,
            isbn,
            openlibrary_cover_id,
            google_books_id,
            openlibrary_work_key,
            total_pages,
            description
          )
        `)
        .eq('user_id', userId)
        .is('deleted_at', null) // ✅ Seulement les likes actifs
        .not('book_uuid', 'is', null) // ✅ Cache les likes legacy (sans book_uuid)
        .order('created_at', { ascending: false });

      if (likesError) {
        console.error('[loadLikedBooks] Error fetching book_likes:', likesError);
        setUserBooks([]);
        setLoading(false);
        return;
      }

      if (!likesData || likesData.length === 0) {
        setUserBooks([]);
        setLoading(false);
        return;
      }

      // ✅ Charger les covers custom depuis book_covers OU user_books.custom_cover_url
      const bookIds = (likesData ?? [])
        .map(x => x.book_uuid)
        .filter((id: string | null): id is string => !!id);

      // Essayer book_covers d'abord
      const { data: coversData, error: coversError } = await supabase
        .from('book_covers')
        .select('book_id, cover_url')
        .eq('user_id', userId)
        .in('book_id', bookIds);

      // Si book_covers n'existe pas ou est vide, essayer user_books.custom_cover_url
      let coverMap = new Map<string, string | null>();
      if (!coversError && coversData && coversData.length > 0) {
        coverMap = new Map((coversData ?? []).map((c: any) => [c.book_id, c.cover_url]));
      } else {
        // Fallback: charger depuis user_books.custom_cover_url
        const { data: userBooksData } = await supabase
          .from('user_books')
          .select('book_id, custom_cover_url')
          .eq('user_id', userId)
          .in('book_id', bookIds);

        if (userBooksData) {
          coverMap = new Map((userBooksData ?? []).map((ub: any) => [ub.book_id, ub.custom_cover_url]));
        }
      }

      // ✅ Formater comme user_books avec toutes les infos nécessaires + covers custom
      const formattedBooks = (likesData || [])
        .filter((x: any) => x.book && x.book_uuid)
        .map((x: any) => ({
          id: x.id,
          book: x.book,
          status: 'liked' as const,
          current_page: 0,
          book_id: x.book_uuid,
          created_at: x.created_at,
          updated_at: x.created_at,
          custom_cover_url: coverMap.get(x.book_uuid) ?? null,
        }));

      setUserBooks(formattedBooks);
    } catch (error) {
      console.error('[loadLikedBooks] Unexpected error:', error);
      setUserBooks([]);
    } finally {
      setLoading(false);
    }
  };

  const getProgress = (currentPage: number, totalPages: number | null) => {
    if (!totalPages || totalPages === 0) return 0;
    return Math.round((currentPage / totalPages) * 100);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="sticky top-0 bg-background-light z-10 border-b border-gray-200" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-black/5 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-text-sub-light" />
            </button>
            <h1 className="text-xl font-bold">
              {mode === 'liked'
                ? `Livres likés de ${userName}`
                : mode === 'reading'
                  ? `Livres en cours de ${userName}`
                  : `Bibliothèque de ${userName}`}
            </h1>
          </div>

          {mode !== 'liked' && (
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setFilter('all')}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                  filter === 'all'
                    ? 'bg-primary text-black shadow-sm'
                    : 'bg-gray-100 text-text-sub-light hover:bg-gray-200'
                }`}
              >
                Tous
              </button>
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

      <div
        className="p-4"
        style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
      >
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
          <div className="space-y-3 pb-8">
            {userBooks.map((userBook) => {
              const book = userBook.book;
              if (!book) {
                console.warn('UserBook without book data:', userBook);
                return null;
              }
              const progress = getProgress(userBook.current_page, book.total_pages ?? null);

              return (
                <div
                  key={userBook.id}
                  className="flex gap-4 p-4 bg-card-light rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => {
                    const b = userBook.book;
                    if (!b) return;

                    setSelectedBook({
                      id: b.id ?? userBook.book_id ?? userBook.id,
                      title: b.title ?? 'Titre inconnu',
                      author: b.author ?? 'Auteur inconnu',
                      cover_url: userBook.custom_cover_url ?? b.cover_url ?? null,
                      thumbnail: userBook.custom_cover_url ?? b.cover_url ?? null,
                      total_pages: b.total_pages ?? null,
                      description: b.description ?? null,
                      isbn: b.isbn ?? null,
                      google_books_id: b.google_books_id ?? null,
                      edition: b.edition ?? null,
                      openlibrary_cover_id: b.openlibrary_cover_id ?? null,
                    });
                  }}
                >
                  {(() => {
                    // ✅ Utiliser resolveBookCover (fonction canonique)
                    const coverUrl = resolveBookCover({
                      customCoverUrl: userBook.custom_cover_url || null,
                      coverUrl: book?.cover_url || null,
                    });
                    return (
                      <BookCover
                        coverUrl={coverUrl}
                        custom_cover_url={userBook.custom_cover_url || null}
                        title={book.title || 'Livre'}
                        author={book.author || ''}
                        className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-md"
                      />
                    );
                  })()}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-text-main-light mb-1 line-clamp-2">{book.title}</h3>
                    <p className="text-sm text-text-sub-light mb-2 truncate">{book.author}</p>

                    {filter === 'reading' && book.total_pages && (
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
                      {book.total_pages ? (
                        <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
                          {book.total_pages} pages
                        </span>
                      ) : (
                        <span className="inline-block text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
                          Pages inconnues
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

