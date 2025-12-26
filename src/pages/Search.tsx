import { useState } from 'react';
import { Search as SearchIcon, Book as BookIcon } from 'lucide-react';
import type { Book } from '../lib/googleBooks';
import { searchBooks as searchGoogleBooks } from '../lib/googleBooks';
import { searchBooks as searchOpenLibraryBooks, fetchByIsbn as fetchOpenLibraryByIsbn, fetchWorkDescription, fetchEditionDescription, generateFallbackSummary } from '../services/openLibrary';
import { ensureBookInDB } from '../lib/booksUpsert';
import { getTranslatedDescription } from '../lib/translate';
import { useTranslation } from 'react-i18next';
import { BookDetailsModal } from '../components/BookDetailsModal';
import { BookCover } from '../components/BookCover';
import { supabase } from '../lib/supabase';
import { debugLog, fatalError } from '../utils/logger';

export function Search() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDbBook, setSelectedDbBook] = useState<any>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
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
      let results: Book[] = [];

      // Priority 1: Try Google Books API (if API key available)
      try {
        const googleResults = await searchGoogleBooks(trimmedQuery, undefined, 0, 20);
        if (googleResults && googleResults.length > 0) {
          results = googleResults;
          debugLog(`[Search] Found ${googleResults.length} results from Google Books`);
        }
      } catch (googleError: any) {
        // If API key missing or error, continue to OpenLibrary
        if (googleError?.message?.includes('API key')) {
          debugLog('[Search] Google Books API key missing, trying OpenLibrary');
        } else {
          debugLog('[Search] Google Books error, trying OpenLibrary:', googleError);
        }
      }

      // Priority 2: Fallback to OpenLibrary if Google returned 0 results or error
      if (results.length === 0) {
        try {
          const olResults = await searchOpenLibraryBooks(trimmedQuery, 1);
          if (olResults && olResults.length > 0) {
            // Convert OpenLibraryBook to Book format
            results = olResults.map((olBook) => ({
              id: olBook.openLibraryKey || olBook.isbn || `ol-${olBook.title}`,
              title: olBook.title,
              authors: olBook.author,
              category: undefined,
              pageCount: olBook.pages || undefined,
              publisher: undefined,
              isbn: olBook.isbn || undefined,
              isbn13: olBook.isbn13 || undefined,
              isbn10: olBook.isbn10 || undefined,
              description: undefined,
              thumbnail: olBook.coverUrl || undefined,
              cover_i: olBook.cover_i,
            }));
            debugLog(`[Search] Found ${olResults.length} results from OpenLibrary`);
          }
        } catch (olError) {
          debugLog('[Search] OpenLibrary error:', olError);
        }
      }

      setResults(results);
    } catch (error) {
      fatalError('Unexpected error searching books:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const openDetails = async (book: Book) => {
    console.log('[Search] openDetails click', book.title);
    setLoadingSelected(true);
    try {
      // Step 1: Ensure book exists in DB and get UUID
      const dbBookId = await ensureBookInDB(supabase, book);

      // Step 2: Fetch the book row from books table
      const { data: dbBook, error: fetchError } = await supabase
        .from('books')
        .select('id, title, author, isbn, cover_url, total_pages, description, google_books_id, openlibrary_work_key, openlibrary_edition_key')
        .eq('id', dbBookId)
        .single();

      if (fetchError) {
        console.error('[Search openDetails] Error fetching book from DB:', fetchError);
        fatalError('Error fetching book from DB:', fetchError);
        setLoadingSelected(false);
        return;
      }

      if (!dbBook) {
        console.error('[Search openDetails] Book not found in DB after ensureBookInDB');
        setLoadingSelected(false);
        return;
      }

      // BONUS: If description is null/empty, try to fetch fallback description from multiple sources
      if (!dbBook.description || dbBook.description.trim().length === 0) {
        let foundDescription: string | null = null;

        // Priority 1: Try to get description from original book object (Google Books)
        if (book.description && book.description.trim().length > 0) {
          foundDescription = book.description.trim();
        }
        
        // Priority 2: Try OpenLibrary Work API if we have work key
        if (!foundDescription && dbBook.openlibrary_work_key) {
          try {
            const olDesc = await fetchWorkDescription(dbBook.openlibrary_work_key);
            if (olDesc && olDesc.length > 0) {
              foundDescription = olDesc;
            }
          } catch (error) {
            console.log('[Search openDetails] Could not fetch OpenLibrary work description:', error);
          }
        }

        // Priority 3: Try OpenLibrary Edition API if we have edition key
        if (!foundDescription && dbBook.openlibrary_edition_key) {
          try {
            const olDesc = await fetchEditionDescription(dbBook.openlibrary_edition_key);
            if (olDesc && olDesc.length > 0) {
              foundDescription = olDesc;
            }
          } catch (error) {
            console.log('[Search openDetails] Could not fetch OpenLibrary edition description:', error);
          }
        }

        // Priority 4: Try to fetch from Google Books API if we have google_books_id
        if (!foundDescription && dbBook.google_books_id) {
          try {
            const googleBook = await searchGoogleBooks(dbBook.title, undefined, 0, 1);
            if (googleBook && googleBook.length > 0 && googleBook[0].description) {
              const desc = googleBook[0].description.trim();
              if (desc.length > 0) {
                foundDescription = desc;
              }
            }
          } catch (error) {
            console.log('[Search openDetails] Could not fetch Google Books description:', error);
          }
        }

        // Priority 5: Try OpenLibrary by ISBN if we have ISBN but no work key
        if (!foundDescription && dbBook.isbn && !dbBook.openlibrary_work_key) {
          try {
            const olBook = await fetchOpenLibraryByIsbn(dbBook.isbn);
            if (olBook?.openLibraryWorkKey) {
              // Save work key for future use
              await supabase
                .from('books')
                .update({ openlibrary_work_key: olBook.openLibraryWorkKey.startsWith('/') ? olBook.openLibraryWorkKey : `/works/${olBook.openLibraryWorkKey}` })
                .eq('id', dbBookId);
              
              // Try to fetch description from work
              if (olBook.openLibraryWorkKey) {
                const olDesc = await fetchWorkDescription(olBook.openLibraryWorkKey);
                if (olDesc && olDesc.length > 0) {
                  foundDescription = olDesc;
                }
              }
            }
          } catch (error) {
            console.log('[Search openDetails] Could not fetch OpenLibrary by ISBN:', error);
          }
        }

        // Update DB if we found a description
        if (foundDescription && foundDescription.length > 0) {
          await supabase
            .from('books')
            .update({ description: foundDescription })
            .eq('id', dbBookId);
          dbBook.description = foundDescription;
        } else {
          // Fallback: Generate mini-summary
          const fallback = generateFallbackSummary({
            title: dbBook.title,
            author: dbBook.author,
            total_pages: dbBook.total_pages,
            category: (book as any).category,
            genre: (book as any).genre,
          });
          dbBook.description = fallback;
        }
      }

      // Step 3: Translate description if needed
      if (dbBook.description && dbBook.description.trim().length > 0) {
        // Pass the full dbBook object to getTranslatedDescription so it can extract stable book_key
        const translated = await getTranslatedDescription(dbBook, dbBook.description);
        if (translated) {
          dbBook.description = translated;
        }
      }

      // Step 4: Open BookDetailsModal with DB book data
      setSelectedDbBook(dbBook);
      setLoadingSelected(false);
    } catch (error: any) {
      console.error('[Search openDetails] Unexpected error:', error);
      fatalError('Error opening book details:', error);
      setLoadingSelected(false);
    }
  };

  const addDbBookToLibrary = async (bookId: string) => {
    try {
      // Get user_id from auth
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        fatalError('Error getting user:', authError);
        return;
      }
      const userId = authData.user.id;

      // Check if already in user_books
      const { data: existingUserBook, error: checkError } = await supabase
        .from('user_books')
        .select('id')
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .maybeSingle();

      if (checkError) {
        fatalError('Error checking user_books:', checkError);
        return;
      }

      if (existingUserBook) {
        debugLog('Book already in user library');
        return;
      }

      // Insert into user_books with UUID
      const { data: insertedData, error: insertError } = await supabase
        .from('user_books')
        .insert({
          user_id: userId,
          book_id: bookId, // Use UUID directly
          status: 'want_to_read',
          current_page: 0,
          progress_pct: 0,
        })
        .select();

      if (insertError) {
        // Handle UNIQUE constraint violation (23505) gracefully
        if (insertError.code === '23505') {
          debugLog('Book already in user library (23505)');
          return;
        }
        
        fatalError('Error inserting into user_books:', insertError);
        return;
      }

      debugLog('Book successfully added to library:', insertedData);
    } catch (error) {
      fatalError('Unexpected error in addDbBookToLibrary:', error);
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

      // Step 1: Ensure book exists in DB and get UUID (CRITICAL: never use external book.id as book_id)
      let bookUuid: string;
      try {
        bookUuid = await ensureBookInDB(supabase, book);
      } catch (error: any) {
        console.error('[Search handleAddBook] Error ensuring book in DB:', error);
        fatalError('Error ensuring book in DB:', error);
        setAdding(null);
        return;
      }

      // Step 2: Check if already in user_books with the UUID
      const { data: existingUserBook, error: checkError } = await supabase
        .from('user_books')
        .select('id')
        .eq('user_id', userId)
        .eq('book_id', bookUuid)
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

      // Step 3: Insert into user_books with UUID (handle UNIQUE constraint violation gracefully)
      const { data: insertedData, error: insertError } = await supabase
        .from('user_books')
        .insert({
          user_id: userId,
          book_id: bookUuid, // Use UUID from ensureBookInDB, not external book.id
          status: 'want_to_read',
          current_page: 0,
          progress_pct: 0,
        })
        .select();

      if (insertError) {
        // Handle UNIQUE constraint violation (23505) gracefully
        if (insertError.code === '23505') {
          // Book already exists - silently ignore (no UI feedback needed)
          debugLog('Book already in user library (23505)');
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
                <button
                  type="button"
                  className="cursor-pointer hover:scale-105 transition-transform pointer-events-auto"
                  onClick={() => openDetails(book)}
                >
                  <BookCover
                    coverUrl={book.thumbnail}
                    title={book.title}
                    author={book.authors || 'Auteur inconnu'}
                    className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden shadow-md"
                  />
                </button>

                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    className="font-bold text-text-main-light mb-1 line-clamp-2 cursor-pointer hover:text-primary text-left w-full pointer-events-auto"
                    onClick={() => openDetails(book)}
                  >
                    {book.title}
                  </button>
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

      {loadingSelected && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center">
          <div className="bg-background-light rounded-2xl p-8">
            <div className="text-text-sub-light">{t('common.loading')}</div>
          </div>
        </div>
      )}

      {selectedDbBook && (
        <BookDetailsModal
          book={selectedDbBook}
          onClose={() => setSelectedDbBook(null)}
          showAddButton={true}
          onAddToLibrary={async (dbBook) => {
            await addDbBookToLibrary(dbBook.id);
            setSelectedDbBook(null);
          }}
        />
      )}
    </div>
  );
}
