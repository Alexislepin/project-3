import { useState, useEffect } from 'react';
import { X, Book, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ensureBookInDB } from '../lib/booksUpsert';
import { pickImage, uploadImageToSupabase } from '../lib/imageUpload';

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

  const handleSelectCover = async () => {
    if (!user) return;

    setError(null);
    
    // Release previous blob URL if exists
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }
    
    const result = await pickImage();
    
    if (!result) {
      return; // User cancelled
    }

    const { blob, ext } = result;
    setCoverBlob(blob);
    setCoverExt(ext);
    
    // Create preview URL from blob
    const previewUrl = URL.createObjectURL(blob);
    setCoverPreview(previewUrl);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError('Vous devez être connecté pour ajouter un livre');
      return;
    }

    if (!title.trim() || !author.trim()) {
      setError("Le titre et l'auteur sont obligatoires");
      return;
    }

    // Total pages is REQUIRED in this modal
    if (!totalPages.trim() || parseInt(totalPages, 10) <= 0) {
      setError("Le nombre de pages est obligatoire et doit être supérieur à 0");
      return;
    }

    setSaving(true);
    setError(null);
    setUploadingCover(true);

    try {
      // Get user id via auth (extra safety check)
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        console.error('[AddManualBookModal] auth.getUser error:', authError);
        setError('Erreur d\'authentification');
        setSaving(false);
        setUploadingCover(false);
        return;
      }

      const userId = authData.user.id;

      const isbnValue = isbn.trim() || null;
      const totalPagesValue = parseInt(totalPages, 10); // Already validated as > 0
      const descriptionValue = description.trim() || null;

      // First ensure book exists to get bookId
      const tempBookData: any = {
        title: title.trim(),
        author: author.trim(),
        total_pages: totalPagesValue,
        isbn: isbnValue,
        description: descriptionValue,
        cover_url: null, // Will be set after upload if needed
      };

      let bookId: string;
      try {
        bookId = await ensureBookInDB(supabase, tempBookData);
      } catch (bookError: any) {
        console.error('[AddManualBookModal] Error ensuring book in DB:', bookError);
        const errorMessage = bookError?.message || "Impossible d'ajouter le livre";
        setError(errorMessage);
        setSaving(false);
        return;
      }

      // Upload cover if blob selected
      let coverUrlValue: string | null = null;

      if (coverBlob) {
        setUploadingCover(true);
        try {
          const ext = coverExt === 'jpg' ? 'jpg' : coverExt;
          const path = `${userId}/${bookId}/cover.${ext}`;
          const { path: uploadedPath } = await uploadImageToSupabase(supabase, {
            bucket: 'book-covers',
            path,
            blob: coverBlob,
            mime: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          });
          // Store the path (more robust than URL)
          coverUrlValue = uploadedPath;
          setUploadingCover(false);
        } catch (uploadError: any) {
          console.error('[AddManualBookModal] Error uploading cover:', uploadError);
          setUploadingCover(false);
          setError("Impossible d'importer l'image, le livre sera ajouté sans couverture.");
          // Continue without cover
        }
      }

      // Update book with cover URL if uploaded
      if (coverUrlValue) {
        // Get public URL for the cover
        const { data: publicUrlData } = supabase.storage.from('book-covers').getPublicUrl(coverUrlValue);
        const publicCoverUrl = publicUrlData?.publicUrl;
        
        if (publicCoverUrl) {
          // Update book with cover URL
          await supabase
            .from('books')
            .update({ cover_url: publicCoverUrl })
            .eq('id', bookId);
        }
      }

      // Fetch the created book to return it
      const { data: createdBook, error: fetchError } = await supabase
        .from('books')
        .select('id, title, author, total_pages, cover_url, isbn, google_books_id, openlibrary_work_key, openlibrary_edition_key, openlibrary_cover_id')
        .eq('id', bookId)
        .single();

      if (fetchError || !createdBook) {
        console.error('[AddManualBookModal] Error fetching created book:', fetchError);
        setError("Livre créé mais erreur lors de la récupération");
        setSaving(false);
        setUploadingCover(false);
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

      console.log('[AddManualBookModal] Book created successfully, calling onAdded:', dbBook);
      onAdded(dbBook);
      onClose();
    } catch (err) {
      console.error('[AddManualBookModal] Unexpected error:', err);
      const errorMessage = err instanceof Error ? err.message : "Une erreur inattendue est survenue";
      setError(errorMessage);
      setSaving(false);
      setUploadingCover(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Book className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main-light">Ajouter un livre manuellement</h2>
              <p className="text-sm text-text-sub-light">
                Remplissez les informations de votre livre personnalisé
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
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
                <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden border-2 border-gray-200">
                  <img
                    src={coverPreview}
                    alt="Couverture"
                    className="w-full h-full object-cover"
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
                className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors text-text-sub-light"
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
              type="submit"
              className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving || !title.trim() || !author.trim() || !totalPages.trim() || parseInt(totalPages, 10) <= 0}
            >
              {saving ? 'Ajout en cours...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


