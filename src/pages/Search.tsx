import { useState } from 'react';
import { Search as SearchIcon, Book as BookIcon } from 'lucide-react';
import type { Book } from '../lib/googleBooks';
import { BookDetail } from '../components/BookDetail';
import { BookCover } from '../components/BookCover';
import { supabase } from '../lib/supabase';
import { debugLog, fatalError } from '../utils/logger';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('books')
        .select('id, title, author, description, total_pages, isbn, openlibrary_cover_id')
        .or(`title.ilike.%${trimmedQuery}%,author.ilike.%${trimmedQuery}%`)
        .limit(20);

      if (error) {
        fatalError('Error searching books in Supabase (Search page):', error);
        setResults([]);
      } else {
        const mapped: Book[] = (data || []).map((row: any) => {
          const coverId = row.openlibrary_cover_id;
          const thumbnail =
            typeof coverId === 'number'
              ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`
              : undefined;

          return {
            id: row.id,
            title: row.title || '',
            authors: row.author || '',
            category: undefined,
            pageCount: row.total_pages || undefined,
            publisher: undefined,
            isbn: row.isbn || undefined,
            description: row.description || undefined,
            thumbnail,
            isbn13: null,
            isbn10: null,
          };
        });
        setResults(mapped);
      }
    } catch (error) {
      fatalError('Unexpected error searching books in Supabase (Search page):', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBook = async (book: Book) => {
    setAdding(book.id);

    try {
      // Get user_id from auth
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        fatalError('Error getting user:', authError);
        setAdding(null);
        return;
      }
      const userId = authData.user.id;

      const bookId = book.id;

      // Check if already in user_books for this user and book
      const { data: existingUserBook, error: checkError } = await supabase
        .from('user_books')
        .select('id')
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .maybeSingle();

      if (checkError) {
        fatalError('Error checking user_books:', checkError);
        setAdding(null);
        return;
      }

      if (existingUserBook) {
        debugLog('Book already in user library');
        setAdding(null);
        return;
      }

      // Insert into user_books (handle UNIQUE constraint violation gracefully)
      const { data: insertedData, error: insertError } = await supabase
        .from('user_books')
        .insert({
          user_id: userId,
          book_id: bookId,
          status: 'want_to_read',
          current_page: 0,
          progress_pct: 0,
        })
        .select();

      if (insertError) {
        // Handle UNIQUE constraint violation (23505) gracefully
        if (insertError.code === '23505') {
          // Book already exists - silently ignore
          setAdding(null);
          return;
        }
        
        fatalError('Error inserting into user_books:', insertError);
        setAdding(null);
        return;
      }

      debugLog('Book successfully added to library:', insertedData);
      setAdding(null);
    } catch (error) {
      fatalError('Unexpected error in handleAddBook:', error);
      setAdding(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div 
        className="sticky bg-background-light z-10 border-b border-gray-200"
        style={{ 
          top: 'var(--sat)',
          paddingTop: '1rem',
        }}
      >
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">Rechercher un livre</h1>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-sub-light" />
            <input
              type="text"
              placeholder="Titre, auteur, ISBN..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="p-4">
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="mt-4 text-text-sub-light">Recherche en cours...</p>
          </div>
        )}

        {!loading && query.trim().length >= 3 && results.length === 0 && (
          <div className="text-center py-12 text-text-sub-light">
            <BookIcon className="w-16 h-16 mx-auto mb-4 text-text-sub-light" />
            <p className="text-lg font-medium">Aucun livre trouvé</p>
            <p className="text-sm mt-2">Essayez une autre recherche</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map((book) => (
              <div
                key={book.id}
                className="flex gap-4 p-4 bg-card-light rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div
                  className="cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setSelectedBook(book)}
                >
                  <BookCover
                    coverUrl={book.thumbnail}
                    title={book.title}
                    author={book.authors || 'Auteur inconnu'}
                    className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-md"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3
                    className="font-bold text-text-main-light mb-1 line-clamp-2 cursor-pointer hover:text-primary"
                    onClick={() => setSelectedBook(book)}
                  >
                    {book.title}
                  </h3>
                  <p className="text-sm text-text-sub-light mb-2 truncate">{book.authors}</p>

                  <div className="flex flex-wrap gap-2">
                    {book.category && (
                      <span className="inline-block text-xs bg-primary/20 text-primary px-2 py-1 rounded-full font-medium">
                        {book.category}
                      </span>
                    )}
                    {book.pageCount ? (
                      <span className="inline-block text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">
                        {book.pageCount} pages
                      </span>
                    ) : (
                      <span className="inline-block text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium">
                        Pages inconnues
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleAddBook(book)}
                  disabled={adding === book.id}
                  className="shrink-0 h-10 px-4 bg-primary text-black rounded-lg font-bold hover:brightness-95 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding === book.id ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
            ))}
          </div>
        )}

        {query.length === 0 && (
          <div className="text-center py-12 text-text-sub-light">
            <SearchIcon className="w-16 h-16 mx-auto mb-4 text-text-sub-light" />
            <p className="text-lg font-medium">Recherchez un livre</p>
            <p className="text-sm mt-2">Tapez un titre, un auteur ou un ISBN</p>
          </div>
        )}
      </div>

      {selectedBook && (
        <BookDetail book={selectedBook} onClose={() => setSelectedBook(null)} onAdd={handleAddBook} />
      )}
    </div>
  );
}
