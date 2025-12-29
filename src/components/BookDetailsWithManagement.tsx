import { useEffect, useState } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ensureBookInDB } from '../lib/booksUpsert';
import { ManageBookModal } from './ManageBookModal';
import { AddBookStatusModal } from './AddBookStatusModal';
import { BookCover } from './BookCover';
import { smartFormatDescription } from '../utils/descriptionFormatter';
import { debugLog, fatalError } from '../utils/logger';
import { ReadingSetupModal } from './ReadingSetupModal';
import { normalizeReadingState } from '../lib/readingState';

interface BookDetailsWithManagementProps {
  bookId: string;
  userBookId?: string;
  currentPage?: number;
  onClose: () => void;
  onEditRequested?: () => void; // Callback to open EditBookModal
  onOpenRecap?: () => void; // Callback to open BookRecapModal
}

export function BookDetailsWithManagement({ bookId, userBookId, currentPage, onClose, onEditRequested, onOpenRecap }: BookDetailsWithManagementProps) {
  const { user } = useAuth();
  const [book, setBook] = useState<any>(null);
  const [userBook, setUserBook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showReadingSetup, setShowReadingSetup] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<'reading' | 'completed' | 'want_to_read' | null>(null);

  useEffect(() => {
    loadBookDetails();
  }, [bookId]);

  const loadBookDetails = async () => {
    try {
      // Requête corrigée : ne pas sélectionner description_clean qui n'existe plus
      const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookError) {
        console.error('Error loading book:', {
          message: bookError.message,
          details: bookError.details,
          hint: bookError.hint,
          code: bookError.code,
          status: (bookError as any).status,
        });
        console.error('Query:', `books?select=*&id=eq.${bookId}`);
        // Continuer même en cas d'erreur pour afficher ce qu'on peut
      }

      if (bookData) {
        setBook(bookData);
      }

      if (user) {
        const { data: userBookData, error: userBookError } = await supabase
        .from('user_books')
        .select('*, custom_cover_url')
        .eq('user_id', user.id)
        .eq('book_id', bookId)
        .maybeSingle();

        if (userBookError) {
          console.error('Error loading user_book:', {
            message: userBookError.message,
            details: userBookError.details,
            hint: userBookError.hint,
            code: userBookError.code,
            status: (userBookError as any).status,
          });
          // Continuer même en cas d'erreur
        }

        if (userBookData) {
          setUserBook(userBookData);
        }
      }
    } catch (error: any) {
      console.error('Exception loading book details:', error);
    } finally {
      // IMPORTANT: Toujours arrêter le loading, même en cas d'erreur
      setLoading(false);
    }
  };

  const handleAddToLibrary = () => {
    // This will be handled by AddBookStatusModal -> ReadingSetupModal flow
    // The button triggers AddBookStatusModal which then calls handleAddComplete
  };

  const handleStatusChange = async (status: 'reading' | 'completed' | 'want_to_read') => {
    if (!user || !userBook) return;

    await supabase
      .from('user_books')
      .update({ status })
      .eq('id', userBook.id);

    setShowManageModal(false);
    loadBookDetails();
  };

  const handleDelete = async () => {
    if (!user || !userBook) return;

    await supabase
      .from('user_books')
      .delete()
      .eq('id', userBook.id);

    setShowManageModal(false);
    onClose();
  };

  const handleAddComplete = async (
    status: 'reading' | 'completed' | 'want_to_read',
    totalPages: number | null,
    currentPage: number
  ) => {
    if (!book) return;

    try {
      // Get user_id from auth
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        fatalError('Error getting user:', authError);
        return;
      }
      const userId = authData.user.id;

      // Step 1: Ensure book exists in DB and get UUID (CRITICAL: never use external book.id as book_id)
      let bookUuid: string;
      try {
        // Convert book to format expected by ensureBookInDB
        const bookForUpsert: any = {
          title: book.title,
          author: book.author || book.authors,
          pageCount: book.total_pages || book.pageCount,
          description: book.description,
          cover_url: book.cover_url || book.thumbnail,
          isbn: book.isbn,
          isbn13: book.isbn13,
          isbn10: book.isbn10,
          google_books_id: book.google_books_id,
          openLibraryKey: book.openLibraryKey,
        };
        bookUuid = await ensureBookInDB(supabase, bookForUpsert);
      } catch (error: any) {
        console.error('[BookDetailsWithManagement handleAddComplete] Error ensuring book in DB:', error);
        fatalError('Error ensuring book in DB:', error);
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
        return;
      }

      if (existingUserBook) {
        debugLog('Book already in library');
        setShowReadingSetup(false);
        setPendingStatus(null);
        onClose();
        return;
      }

      // Step 3: Normalize reading state
      const normalizedState = normalizeReadingState({
        status,
        total_pages: totalPages,
        current_page: currentPage,
      });

      // Step 4: Update books.total_pages if provided
      if (normalizedState.total_pages && normalizedState.total_pages > 0) {
        const { data: bookData } = await supabase
          .from('books')
          .select('total_pages')
          .eq('id', bookUuid)
          .maybeSingle();
        
        if (!bookData?.total_pages) {
          await supabase
            .from('books')
            .update({ total_pages: normalizedState.total_pages })
            .eq('id', bookUuid);
        }
      }

      // Step 5: Insert into user_books with normalized state
      const insertData: any = {
        user_id: userId,
        book_id: bookUuid,
        status: normalizedState.status,
        current_page: normalizedState.current_page,
      };

      if (normalizedState.started_at) {
        insertData.started_at = normalizedState.started_at;
      }

      if (normalizedState.completed_at) {
        insertData.completed_at = normalizedState.completed_at;
      }

      const { data: insertedData, error: insertError } = await supabase
        .from('user_books')
        .insert(insertData)
        .select();

      if (insertError) {
        // Handle UNIQUE constraint violation (23505) gracefully
        if (insertError.code === '23505') {
          // Book already exists - treat as success
          debugLog('Book already in library');
          setShowReadingSetup(false);
          setPendingStatus(null);
          onClose();
          return;
        }
        
        fatalError('Error inserting into user_books:', insertError);
        return;
      }

      debugLog('Book successfully added to library:', insertedData);
      setShowReadingSetup(false);
      setPendingStatus(null);
      onClose();
    } catch (error) {
      fatalError('Unexpected error in handleAddComplete:', error);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center">
        <div className="bg-background-light rounded-2xl p-8">
          <div className="text-text-sub-light">Chargement...</div>
        </div>
      </div>
    );
  }

  // Si pas de livre après le chargement, afficher un message d'erreur mais permettre de fermer
  if (!book) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center" onClick={onClose}>
        <div className="bg-background-light rounded-2xl p-8 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-text-main-light mb-2">Erreur</h3>
          <p className="text-text-sub-light mb-4">Impossible de charger les détails du livre.</p>
          <button
            onClick={onClose}
            className="w-full bg-primary text-black py-3 rounded-xl font-bold hover:brightness-95 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-background-light rounded-3xl w-full max-w-lg flex flex-col overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: '85vh' }}
        >
          <div className="sticky top-0 bg-background-light z-10 px-6 pt-4 pb-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-main-light">Détails du livre</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Fermer"
              >
                <X className="w-5 h-5 text-text-sub-light" />
              </button>
            </div>
          </div>

          <div 
            className="flex-1 overflow-y-auto min-h-0 px-6 py-6" 
            style={{ 
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)'
            }}
          >
            <div className="flex gap-4 mb-6">
              <BookCover
                custom_cover_url={userBook?.custom_cover_url || null}
                coverUrl={book.cover_url || null}
                title={book.title}
                author={book.author || 'Auteur inconnu'}
                isbn={book.isbn || null}
                isbn13={book.isbn13 || null}
                isbn10={book.isbn10 || null}
                cover_i={book.openlibrary_cover_id || null}
                openlibrary_cover_id={book.openlibrary_cover_id || null}
                googleCoverUrl={book.google_books_id ? `https://books.google.com/books/content?id=${book.google_books_id}&printsec=frontcover&img=1&zoom=1&source=gbs_api` : null}
                className="w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-lg"
              />

              <div className="flex-1">
                <h3 className="text-2xl font-bold text-text-main-light mb-2 leading-tight">
                  {book.title}
                </h3>
                <p className="text-lg text-text-sub-light font-medium mb-3">
                  {book.author}
                </p>

                <div className="flex flex-wrap gap-2">
                  {book.genre && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {book.genre}
                    </span>
                  )}
                  {book.total_pages ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
                      {book.total_pages} pages
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">
                      Pages inconnues
                    </span>
                  )}
                  {book.edition && book.edition !== 'Standard Edition' && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                      {book.edition}
                    </span>
                  )}
                </div>

                {typeof currentPage === 'number' && book?.total_pages ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-text-sub-light font-medium mb-2">
                      <span>Progression</span>
                      <span>
                        {currentPage} / {book.total_pages} ({Math.round((currentPage / book.total_pages) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, Math.round((currentPage / book.total_pages) * 100))}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {(book.publisher || book.isbn) && (
              <div className="mb-6 px-4 py-3 bg-gray-50 rounded-xl">
                <div className="space-y-1">
                  {book.publisher && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-text-sub-light min-w-[70px]">Éditeur:</span>
                      <span className="text-xs text-text-main-light font-medium">{book.publisher}</span>
                    </div>
                  )}
                  {book.isbn && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-text-sub-light min-w-[70px]">ISBN:</span>
                      <span className="text-xs text-text-main-light font-medium">{book.isbn}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {book.description && (
              <div className="mb-6">
                <h4 className="text-sm font-bold text-text-main-light mb-3 uppercase tracking-wide">
                  Résumé
                </h4>
                <p className="text-text-main-light leading-relaxed text-base">
                  {smartFormatDescription(book.description, 350)}
                </p>
              </div>
            )}

            {!userBook && !showReadingSetup && !pendingStatus && (
              <AddBookStatusModal
                bookTitle={book.title}
                onClose={() => {}}
                onSelect={async (status) => {
                  // Get total_pages from book if available
                  const bookTotalPages = book.total_pages || null;
                  
                  // Open ReadingSetupModal with the selected status
                  setPendingStatus(status);
                  setShowReadingSetup(true);
                }}
              />
            )}
          </div>

          {/* Footer with actions */}
          {(userBookId || onOpenRecap) && (
            <div className="sticky bottom-0 bg-background-light border-t border-gray-200 rounded-b-3xl flex-shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10">
              <div 
                className="px-6 py-3 flex gap-3"
                style={{ 
                  paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)'
                }}
              >
                {userBookId && onEditRequested && (
                  <button
                    onClick={onEditRequested}
                    className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-colors"
                  >
                    Modifier
                  </button>
                )}
                {onOpenRecap && (
                  <button
                    onClick={onOpenRecap}
                    className="flex-1 py-3 px-4 bg-stone-900 text-white rounded-xl font-semibold hover:brightness-95 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    IA
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showManageModal && userBook && (
        <ManageBookModal
          bookTitle={book.title}
          currentStatus={userBook.status}
          onClose={() => setShowManageModal(false)}
          onChangeStatus={handleStatusChange}
          onDelete={handleDelete}
        />
      )}

      {showReadingSetup && pendingStatus && book && (
        <ReadingSetupModal
          open={showReadingSetup}
          bookTitle={book.title}
          initialStatus={pendingStatus}
          initialTotalPages={book.total_pages || null}
          initialCurrentPage={null}
          onCancel={() => {
            setShowReadingSetup(false);
            setPendingStatus(null);
          }}
          onConfirm={async (data) => {
            try {
              await handleAddComplete(data.status, data.total_pages, data.current_page);
              setShowReadingSetup(false);
              setPendingStatus(null);
            } catch (error) {
              fatalError('Error adding book:', error);
            }
          }}
        />
      )}
    </>
  );
}
