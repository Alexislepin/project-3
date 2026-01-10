import { useState, useEffect, useRef } from 'react';
import { X, Book, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ensureBookInDB } from '../lib/booksUpsert';
import { pickImageBlob } from '../lib/pickImage';
import { uploadImageToSupabase } from '../lib/imageUpload';
import { useImagePicker } from '../hooks/useImagePicker';
import { searchBooks as searchGoogleBooks, Book as GoogleBook } from '../lib/googleBooks';
import { searchBooks as searchOpenLibraryBooks } from '../services/openLibrary';

// Protection contre double submit (React StrictMode)
const isSubmittingRef = { current: false };

interface AddManualBookModalProps {
  onClose: () => void;
  onAdded: (book: {
    id: string;
    title: string;
    author: string;
    total_pages: number | null;
    cover_url: string | null;
    isbn?: string | null;
    google_books_id?: string | null;
    openlibrary_work_key?: string | null;
    openlibrary_edition_key?: string | null;
    openlibrary_cover_id?: number | null;
  }) => void;
}

export function AddManualBookModal({ onClose, onAdded }: AddManualBookModalProps) {
  const { user } = useAuth();
  const { setIsPicking, shouldBlockClose } = useImagePicker();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [description, setDescription] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverExt, setCoverExt] = useState<string>('jpg');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Suggestion states
  const [suggestions, setSuggestions] = useState<GoogleBook[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [titleBeforeApply, setTitleBeforeApply] = useState<string>('');
  const suggestTimeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSelectCover = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!user || shouldBlockClose()) return;

    setError(null);
    
    // Release previous blob URL if exists
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }
    
    // Set global picking state (prevents modal closure)
    setIsPicking(true);
    
    try {
      const result = await pickImageBlob();
    
    if (!result) {
      return; // User cancelled
    }

      const { blob, ext, contentType } = result;
    setCoverBlob(blob);
    setCoverExt(ext);
    
    // Create preview URL from blob
    const previewUrl = URL.createObjectURL(blob);
    setCoverPreview(previewUrl);
    } catch (err: any) {
      console.error('[AddManualBookModal] pick error', err);
      setError('Erreur lors de la sélection de l\'image');
    } finally {
      // Reset picking state after a delay (iOS needs time to settle)
      setTimeout(() => {
        setIsPicking(false);
      }, 500);
    }
  };

  const removeCover = () => {
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverBlob(null);
    setCoverPreview(null);
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (coverPreview && coverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [coverPreview]);

  // Fonction "chercher des suggestions" (top 3)
  const fetchSuggestions = async (q: string) => {
    setSuggesting(true);
    setSuggestError(null);

    // Cancel previous
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      let results: GoogleBook[] = [];

      try {
        // Google Books d'abord (meilleure qualité)
        // Signature: searchBooks(query: string, signal?: AbortSignal, startIndex: number = 0, maxResults: number = 10)
        results = await searchGoogleBooks(q, ac.signal, 0, 5);
      } catch (e) {
        // Ignore, fallback OpenLibrary
        if (!ac.signal.aborted) {
          console.warn('[AddManualBookModal] Google Books search failed, trying OpenLibrary:', e);
        }
      }

      if ((!results || results.length === 0) && !ac.signal.aborted) {
        // OpenLibrary en fallback
        try {
          const ol = await searchOpenLibraryBooks(q, 1);
          results = (ol || []).slice(0, 5).map((b) => ({
            id: b.openLibraryKey || b.isbn || `ol-${b.title}`,
            title: b.title,
            authors: b.author,
            isbn: b.isbn || undefined,
            isbn13: b.isbn13 || undefined,
            isbn10: b.isbn10 || undefined,
            thumbnail: b.coverUrl || undefined,
            pageCount: undefined,
            category: undefined,
            publisher: undefined,
            description: undefined,
            publishedDate: undefined,
          }));
        } catch (olErr) {
          // Ignore OpenLibrary errors too
          if (!ac.signal.aborted) {
            console.warn('[AddManualBookModal] OpenLibrary search also failed:', olErr);
          }
        }
      }

      if (ac.signal.aborted) return;

      // Prendre les 3 meilleurs résultats
      const top3 = (results || []).slice(0, 3);
      setSuggestions(top3);
    } catch (err: any) {
      if (ac.signal.aborted) return;
      setSuggestions([]);
      setSuggestError('Suggestion indisponible');
    } finally {
      if (!ac.signal.aborted) setSuggesting(false);
    }
  };

  // Déclenchement debounce quand l'utilisateur tape
  useEffect(() => {
    const cleanTitle = title.trim();
    
    // Si title < 3 caractères → clear suggestions
    if (cleanTitle.length < 3) {
      setSuggestions([]);
      setSuggestionApplied(false);
      return;
    }

    // Si suggestionApplied=true ET que l'utilisateur n'a pas modifié le title à la main → ne pas relancer
    if (suggestionApplied && title === titleBeforeApply) {
      return;
    }

    // Si l'utilisateur modifie title après apply → repasser suggestionApplied=false
    if (suggestionApplied && title !== titleBeforeApply) {
      setSuggestionApplied(false);
    }
    
    // Bonus "pro": ne proposer que si l'utilisateur n'a pas déjà rempli ISBN/pages/cover
    const hasManualData = isbn.trim().length > 0 || totalPages.trim().length > 0 || coverPreview !== null;
    
    if (hasManualData && !suggestionApplied) {
      setSuggestions([]);
      return;
    }

    // Debounce
    if (suggestTimeoutRef.current) {
      window.clearTimeout(suggestTimeoutRef.current);
    }

    suggestTimeoutRef.current = window.setTimeout(() => {
      const q = author.trim().length >= 2 ? `${cleanTitle} ${author.trim()}` : cleanTitle;
      fetchSuggestions(q);
    }, 400);

    return () => {
      if (suggestTimeoutRef.current) {
        window.clearTimeout(suggestTimeoutRef.current);
        suggestTimeoutRef.current = null;
      }
      // Annuler la requête en cours si le composant se démonte ou les dépendances changent
      abortRef.current?.abort();
    };
  }, [title, author, isbn, totalPages, coverPreview, suggestionApplied, titleBeforeApply]);

  // Fonction de reset complète
  const handleReset = () => {
    // Annuler requête en cours
    abortRef.current?.abort();
    abortRef.current = null;
    
    // Clear timeout
    if (suggestTimeoutRef.current) {
      window.clearTimeout(suggestTimeoutRef.current);
      suggestTimeoutRef.current = null;
    }

    // Reset tous les states
    setTitle('');
    setAuthor('');
    setIsbn('');
    setTotalPages('');
    setDescription('');
    
    // Cleanup cover preview blob URL
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverPreview(null);
    setCoverBlob(null);
    setCoverExt('jpg');
    
    // Reset suggestions
    setSuggestions([]);
    setSuggesting(false);
    setSuggestError(null);
    setSuggestionApplied(false);
    setTitleBeforeApply('');
    
    // Reset errors
    setError(null);
  };

  // Bouton "Appliquer" qui remplit les champs (et laisse éditable)
  const applySuggestion = (b: GoogleBook) => {
    // Sauvegarder le titre avant application pour détecter les modifications
    setTitleBeforeApply(b.title || title);
    
    if (b.title) setTitle(b.title);
    if (b.authors) setAuthor(b.authors);

    const foundIsbn = b.isbn13 || b.isbn10 || b.isbn || '';
    if (foundIsbn) setIsbn(foundIsbn);

    if (b.pageCount && b.pageCount > 0) {
      setTotalPages(String(b.pageCount));
    }
    if (b.thumbnail) {
      setCoverPreview(b.thumbnail);
      // Note: on ne stocke pas le blob, juste l'URL de preview
      // L'utilisateur peut toujours changer la couverture après
    }

    // Marquer comme appliqué et clear suggestions
    setSuggestionApplied(true);
    setSuggestions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent parent handlers

    // Protection contre double submit (React StrictMode)
    if (isSubmittingRef.current) {
      console.warn('[AddManualBookModal] ⚠️ Submit already in progress, ignoring duplicate call');
      return;
    }

    console.log('[AddManualBookModal] 🔵 handleSubmit called', {
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim(),
      totalPages: totalPages.trim(),
      hasCover: !!coverBlob,
    });

    if (!user) {
      console.error('[AddManualBookModal] ❌ No user');
      setError('Vous devez être connecté pour ajouter un livre');
      return;
    }

    // Validate champs (title obligatoire)
    if (!title.trim() || !author.trim()) {
      console.error('[AddManualBookModal] ❌ Missing required fields', {
        hasTitle: !!title.trim(),
        hasAuthor: !!author.trim(),
      });
      setError("Le titre et l'auteur sont obligatoires");
      return;
    }

    // Total pages is REQUIRED in this modal
    if (!totalPages.trim() || parseInt(totalPages, 10) <= 0) {
      console.error('[AddManualBookModal] ❌ Invalid total pages', {
        totalPages: totalPages.trim(),
        parsed: parseInt(totalPages, 10),
      });
      setError("Le nombre de pages est obligatoire et doit être supérieur à 0");
      return;
    }

    // Set submitting flag
    isSubmittingRef.current = true;
    setSaving(true);
    setError(null);
    setUploadingCover(true);

    try {
      // Get user id via auth (extra safety check)
      console.log('[AddManualBookModal] 🔵 Getting user...');
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error('[AddManualBookModal] ❌ auth.getUser error:', authError);
        setError('Erreur d\'authentification');
        setSaving(false);
        setUploadingCover(false);
        isSubmittingRef.current = false;
        return;
      }

      const userId = authData.user.id;
      console.log('[AddManualBookModal] ✅ User ID:', userId);

      const isbnValue = isbn.trim() || null;
      const totalPagesValue = parseInt(totalPages, 10); // Already validated as > 0
      const descriptionValue = description.trim() || null;

      // First ensure book exists to get bookId
      // ✅ Marquer comme livre manuel avec book_key unique
      const manualBookKey = `manual:${crypto.randomUUID()}`;
      const tempBookData: any = {
        title: title.trim(),
        author: author.trim(),
        total_pages: totalPagesValue,
        isbn: isbnValue,
        description: descriptionValue,
        cover_url: null, // Will be set after upload if needed
        book_key: manualBookKey, // ✅ Identifiant unique pour livre manuel
        source: 'manual', // ✅ Marquer comme source manuelle
      };

      // Supabase insert avec await
      console.log('[AddManualBookModal] 🔵 Ensuring book in DB...', tempBookData);
      let bookId: string;
      try {
        bookId = await ensureBookInDB(supabase, tempBookData);
        console.log('[AddManualBookModal] ✅ Book ensured in DB, bookId:', bookId);
      } catch (bookError: any) {
        console.error('[AddManualBookModal] ❌ Error ensuring book in DB:', {
          error: bookError,
          errorString: JSON.stringify(bookError),
          message: bookError?.message,
          stack: bookError?.stack,
        });
        const errorMessage = bookError?.message || "Impossible d'ajouter le livre";
        setError(errorMessage);
        setSaving(false);
        setUploadingCover(false);
        isSubmittingRef.current = false;
        return;
      }

      // Upload cover if blob selected
      let coverUrlValue: string | null = null;

      if (coverBlob) {
        console.log('[AddManualBookModal] 🔵 Uploading cover...');
        setUploadingCover(true);
        try {
          const ext = coverExt === 'jpg' ? 'jpg' : coverExt;
          const { publicUrl } = await uploadImageToSupabase(supabase, {
            bucket: 'book-covers',
            userId: userId,
            kind: 'cover',
            blob: coverBlob,
            ext: ext,
            bookId: bookId,
          });
          // Store the public URL
          coverUrlValue = publicUrl;
          console.log('[AddManualBookModal] ✅ Cover uploaded:', publicUrl);
          setUploadingCover(false);
        } catch (uploadError: any) {
          console.error('[AddManualBookModal] ❌ Error uploading cover:', {
            error: uploadError,
            errorString: JSON.stringify(uploadError),
            message: uploadError?.message,
            stack: uploadError?.stack,
          });
          setUploadingCover(false);
          setError("Impossible d'importer l'image, le livre sera ajouté sans couverture.");
          // Continue without cover
        }
      } else {
        console.log('[AddManualBookModal] ℹ️ No cover to upload');
      }

      // Update book with cover URL if uploaded
      if (coverUrlValue) {
        // Update book with cover URL ONLY IF it is currently NULL
        // This ensures Explorer shows the uploaded cover too
        const { error: booksUpdateError } = await supabase
          .from('books')
          .update({ cover_url: coverUrlValue })
          .eq('id', bookId)
          .is('cover_url', null);

        if (booksUpdateError) {
          // Log error but don't fail the upload (non-critical)
          console.warn('[AddManualBookModal] Failed to update books.cover_url:', booksUpdateError);
        }
      }

      // Fetch the created book to return it
      console.log('[AddManualBookModal] 🔵 Fetching created book...');
      const { data: createdBook, error: fetchError } = await supabase
        .from('books')
        .select('id, title, author, total_pages, cover_url, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key, openlibrary_cover_id')
        .eq('id', bookId)
        .single();

      if (fetchError || !createdBook) {
        console.error('[AddManualBookModal] ❌ Error fetching created book:', {
          error: fetchError,
          errorString: JSON.stringify(fetchError),
          message: fetchError?.message,
          bookId,
        });
        setError("Livre créé mais erreur lors de la récupération");
        setSaving(false);
        setUploadingCover(false);
        isSubmittingRef.current = false;
        return;
      }

      // Return the book object to parent (will trigger AddBookStatusModal flow)
      // Format compatible with GoogleBook | UiBook expected by handleAddBookToLibrary
      const dbBook = {
        id: createdBook.id,
        title: createdBook.title,
        author: createdBook.author,
        total_pages: createdBook.total_pages,
        pageCount: createdBook.total_pages, // Also provide pageCount for compatibility
        cover_url: createdBook.cover_url,
        thumbnail: createdBook.cover_url, // Also provide thumbnail for compatibility
        isbn: createdBook.isbn || null,
        google_books_id: createdBook.google_books_id || null,
        openlibrary_work_key: createdBook.openlibrary_work_key || null,
        openlibrary_edition_key: createdBook.openlibrary_edition_key || null,
        openlibrary_cover_id: createdBook.openlibrary_cover_id || null,
      };

      console.log('[AddManualBookModal] ✅ Book created successfully, calling onAdded:', dbBook);
      
      // Si succès: close modal + refresh liste
      isSubmittingRef.current = false;
      onAdded(dbBook);
      onClose();
    } catch (err) {
      console.error('[AddManualBookModal] ❌ Unexpected error:', {
        error: err,
        errorString: JSON.stringify(err),
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
      });
      const errorMessage = err instanceof Error ? err.message : "Une erreur inattendue est survenue";
      setError(errorMessage);
      setSaving(false);
      setUploadingCover(false);
      isSubmittingRef.current = false;
    }
  };

  const handleBackdropPointerDown = (e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      // Prevent close during picking or uploading
      if (shouldBlockClose() || uploadingCover || saving) {
        if (import.meta.env.DEV) {
          console.log('[AddManualBookModal] Prevented close during picker/upload');
        }
        return;
      }
      onClose();
    }
  };

  const handleModalContentClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onPointerDown={handleBackdropPointerDown}
    >
      {/* Backdrop - absolute pour bloquer les touches derrière */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget && !shouldBlockClose() && !uploadingCover && !saving) {
            onClose();
          }
        }}
      />
      
      {/* Contenu modal - pointer-events-auto pour être cliquable */}
      <div 
        className="relative bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto pointer-events-auto"
        onClick={handleModalContentClick}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Bouton Recommencer */}
            {(suggestionApplied || title.trim().length > 0 || author.trim().length > 0 || isbn.trim().length > 0 || totalPages.trim().length > 0 || coverPreview) && (
              <button
                type="button"
                onClick={handleReset}
                disabled={shouldBlockClose() || uploadingCover || saving}
                className={`shrink-0 p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  suggestionApplied
                    ? 'bg-primary/20 text-primary hover:bg-primary/30'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title="Recommencer"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Book className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-text-main-light">Ajouter un livre manuellement</h2>
              <p className="text-sm text-text-sub-light">
                Remplissez les informations de votre livre personnalisé
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={shouldBlockClose() || uploadingCover || saving}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form 
          onSubmit={handleSubmit} 
          className="p-6 space-y-4"
          style={{
            paddingBottom: 'calc(48px + env(safe-area-inset-bottom))',
          }}
        >
          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Mon livre personnalisé"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Auteur <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Nom de l'auteur"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
          </div>

          {/* Bloc suggestion ou bandeau pré-rempli */}
          {suggestionApplied ? (
            <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm font-semibold text-text-main-light">Infos pré-remplies ✅</span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-semibold text-black/70 hover:bg-gray-50 transition-colors shrink-0"
              >
                Modifier la recherche
              </button>
            </div>
          ) : title.trim().length >= 3 && !isbn.trim() && !totalPages.trim() && !coverPreview && (
            <div className="mt-3 rounded-2xl border border-black/10 bg-white p-3 space-y-2">
              {suggesting ? (
                <div className="text-sm text-black/50 py-2">Recherche de suggestions…</div>
              ) : suggestions.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-black/60">Suggestions</span>
                    <button
                      type="button"
                      onClick={() => setSuggestions([])}
                      className="text-xs text-black/50 hover:text-black/70 transition-colors"
                    >
                      Masquer
                    </button>
                  </div>
                  {suggestions.map((suggestion, idx) => {
                    const foundIsbn = suggestion.isbn13 || suggestion.isbn10 || suggestion.isbn;
                    const editionInfo = [];
                    if (suggestion.publisher) editionInfo.push(suggestion.publisher);
                    if (suggestion.publishedDate) {
                      const year = suggestion.publishedDate.match(/\d{4}/)?.[0];
                      if (year) editionInfo.push(year);
                    }
                    const editionText = editionInfo.length > 0 ? editionInfo.join(' • ') : null;

                    return (
                      <div
                        key={suggestion.id || idx}
                        onClick={() => applySuggestion(suggestion)}
                        className="flex items-start gap-3 p-2.5 rounded-xl border border-black/5 hover:border-black/20 hover:bg-gray-50 transition-all cursor-pointer"
                      >
                        {suggestion.thumbnail && (
                          <div className="w-12 h-16 shrink-0 rounded overflow-hidden border border-black/10">
                            <img
                              src={suggestion.thumbnail}
                              alt={suggestion.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold line-clamp-1 text-text-main-light mb-0.5">
                            {suggestion.title}
                          </div>
                          <div className="text-xs text-black/60 line-clamp-1 mb-1">
                            {suggestion.authors || 'Auteur inconnu'}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-black/50">
                            {suggestion.pageCount ? (
                              <span>{suggestion.pageCount} pages</span>
                            ) : (
                              <span>Pages inconnues</span>
                            )}
                            {foundIsbn && <span>• ISBN: {foundIsbn}</span>}
                            {editionText && <span>• {editionText}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            applySuggestion(suggestion);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold hover:bg-gray-800 transition-colors shrink-0"
                        >
                          Appliquer
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : suggestError ? (
                <div className="text-sm text-black/50 py-2">{suggestError}</div>
              ) : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                ISBN (optionnel)
              </label>
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="Ex: 9782070360024"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                Nombre de pages <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="Ex: 320"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Couverture (optionnel)
            </label>
            
            {coverPreview ? (
              <div className="relative">
                <div 
                  className="relative w-full aspect-[2/3] rounded-xl overflow-hidden border-2 border-gray-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={coverPreview}
                    alt="Couverture"
                    className="w-full h-full object-cover"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={removeCover}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {uploadingCover && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
                    <div className="text-white text-sm">Upload...</div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSelectCover}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={shouldBlockClose() || uploadingCover}
                className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors text-text-sub-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ImageIcon className="w-10 h-10 mb-2" />
                <span className="text-sm font-medium">Ajouter une couverture</span>
              </button>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Description (optionnel)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Résumé du livre..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              disabled={saving}
            >
              Annuler
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                console.log('[ManualAdd] submit button clicked');
                e.preventDefault();
                e.stopPropagation();
                
                // Vérifier les validations avant de soumettre
                if (saving || isSubmittingRef.current || !title.trim() || !author.trim() || !totalPages.trim() || parseInt(totalPages, 10) <= 0) {
                  console.log('[ManualAdd] submit blocked:', { saving, isSubmitting: isSubmittingRef.current, title: title.trim(), author: author.trim(), totalPages: totalPages.trim() });
                  return;
                }
                
                // Appeler handleSubmit directement
                const fakeEvent = {
                  preventDefault: () => {},
                  stopPropagation: () => {},
                } as React.FormEvent<HTMLFormElement>;
                handleSubmit(fakeEvent);
              }}
              className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed pointer-events-auto"
              disabled={saving || isSubmittingRef.current || !title.trim() || !author.trim() || !totalPages.trim() || parseInt(totalPages, 10) <= 0}
            >
              {saving ? 'Ajout en cours...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


