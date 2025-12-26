import { useEffect, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ManageBookModal } from './ManageBookModal';
import { AddBookStatusModal } from './AddBookStatusModal';
import { BookCover } from './BookCover';
import { smartFormatDescription } from '../utils/descriptionFormatter';
import { debugLog, fatalError } from '../utils/logger';

interface BookDetailsWithManagementProps {
  bookId: string;
  onClose: () => void;
}

export function BookDetailsWithManagement({ bookId, onClose }: BookDetailsWithManagementProps) {
  const { user } = useAuth();
  const [book, setBook] = useState<any>(null);
  const [userBook, setUserBook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

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
          .select('*')
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
    setShowAddModal(true);
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

  const handleAddComplete = async (status: 'reading' | 'completed' | 'want_to_read') => {
    if (!book) return;

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
        .eq('book_id', book.id)
        .maybeSingle();

      if (checkError) {
        fatalError('Error checking user_books:', checkError);
        return;
      }

      if (existingUserBook) {
        debugLog('Book already in library');
        setShowAddModal(false);
        onClose();
        return;
      }

      // Insert into user_books (book already exists in global catalog)
      // Handle UNIQUE constraint violation gracefully
      const { data: insertedData, error: insertError } = await supabase
        .from('user_books')
        .insert({
          user_id: userId,
          book_id: book.id,
          status: status,
          current_page: 0,
        })
        .select();

      if (insertError) {
        // Handle UNIQUE constraint violation (23505) gracefully
        if (insertError.code === '23505') {
          // Book already exists - treat as success
          debugLog('Book already in library');
          setShowAddModal(false);
          onClose();
          return;
        }
        
        fatalError('Error inserting into user_books:', insertError);
        return;
      }

      debugLog('Book successfully added to library:', insertedData);
      setShowAddModal(false);
      onClose();
    } catch (error) {
      fatalError('Unexpected error in handleAddComplete:', error);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center">
        <div className="bg-background-light rounded-2xl p-8">
          <div className="text-text-sub-light">Chargement...</div>
        </div>
      </div>
    );
  }

  // Si pas de livre après le chargement, afficher un message d'erreur mais permettre de fermer
  if (!book) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center" onClick={onClose}>
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
        className={`fixed inset-0 bg-black/60 z-[100] flex items-end ${showAddModal ? 'hidden' : ''}`}
        onClick={onClose}
      >
        <div
          className="bg-background-light rounded-t-3xl w-full max-w-lg mx-auto max-h-[85vh] overflow-y-auto animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-background-light/95 backdrop-blur-sm z-10 px-6 pt-4 pb-3 border-b border-gray-200">
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

          <div className="px-6 py-6">
            <div className="flex gap-4 mb-6">
              <BookCover
                coverUrl={book.cover_url}
                title={book.title}
                author={book.author || 'Auteur inconnu'}
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

            {!userBook && (
              <button
                onClick={handleAddToLibrary}
                className="w-full bg-primary text-black py-4 rounded-xl font-bold hover:brightness-95 transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Ajouter à ma bibliothèque
              </button>
            )}
          </div>
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

      {showAddModal && book && (
        <AddBookStatusModal
          bookTitle={book.title}
          onClose={() => setShowAddModal(false)}
          onSelect={handleAddComplete}
        />
      )}
    </>
  );
}
