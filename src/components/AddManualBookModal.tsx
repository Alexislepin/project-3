import { useState, useRef } from 'react';
import { X, Book, Camera, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ensureBookInDB } from '../lib/booksUpsert';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import { uploadImageToSupabase, generateBookCoverPath } from '../lib/storageUpload';

interface AddManualBookModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export function AddManualBookModal({ onClose, onAdded }: AddManualBookModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectCover = async () => {
    if (!user) return;

    try {
      // Try Capacitor Camera first (iOS/Android)
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        try {
          const result = await CapacitorCamera.pickImages({
            quality: 85,
            limit: 1,
          });

          if (result.photos && result.photos.length > 0) {
            const photo = result.photos[0];
            const response = await fetch(photo.webPath!);
            const blob = await response.blob();
            const file = new File([blob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setCoverFile(file);
            setCoverPreview(photo.webPath!);
            setCoverUrl(''); // Clear URL if file selected
          }
          return;
        } catch (error) {
          console.log('[AddManualBookModal] Capacitor Camera not available, using file input:', error);
        }
      }

      // Fallback: Web file input
      fileInputRef.current?.click();
    } catch (error) {
      console.error('[AddManualBookModal] Error selecting cover:', error);
      setError('Erreur lors de la sélection de la couverture');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image');
      return;
    }

    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setCoverUrl(''); // Clear URL if file selected

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeCover = () => {
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverFile(null);
    setCoverPreview(null);
    setCoverUrl('');
  };

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
      console.log('[AddManualBookModal] User ID:', userId);

      const isbnValue = isbn.trim() || null;
      const totalPagesValue = totalPages ? (parseInt(totalPages, 10) > 0 ? parseInt(totalPages, 10) : null) : null;
      const descriptionValue = description.trim() || null;

      // Upload cover if file selected
      let coverUrlValue = coverUrl.trim() || null;
      let customCoverPath = null;

      if (coverFile) {
        try {
          // First ensure book exists to get bookId
          const tempBookData: any = {
            title: title.trim(),
            author: author.trim(),
            total_pages: totalPagesValue,
            isbn: isbnValue,
            description: descriptionValue,
            cover_url: null, // Will be set after upload
          };

          const tempBookId = await ensureBookInDB(supabase, tempBookData);
          const path = generateBookCoverPath(userId, tempBookId);
          
          const uploadedUrl = await uploadImageToSupabase(supabase, coverFile, {
            bucket: 'book-covers',
            path,
            compress: true,
            maxWidth: 800,
            maxHeight: 1200,
            quality: 0.85,
          });

          customCoverPath = path;
          coverUrlValue = uploadedUrl;
        } catch (uploadError) {
          console.error('[AddManualBookModal] Error uploading cover:', uploadError);
          setError('Erreur lors de l\'upload de la couverture. Le livre sera ajouté sans couverture.');
          // Continue without cover
        }
      }

      setUploadingCover(false);

      // Build book object for ensureBookInDB (update with cover URL if uploaded)
      const bookData: any = {
        title: title.trim(),
        author: author.trim(),
        total_pages: totalPagesValue,
        isbn: isbnValue,
        description: descriptionValue,
        cover_url: coverUrlValue,
      };

      console.log('[AddManualBookModal] Book data for ensureBookInDB:', bookData);

      // Ensure book exists in DB
      let bookId: string;
      try {
        bookId = await ensureBookInDB(supabase, bookData);
        console.log('[AddManualBookModal] Book ID from ensureBookInDB:', bookId);
      } catch (bookError: any) {
        console.error('[AddManualBookModal] Error ensuring manual book in DB:', {
          error: bookError,
          message: bookError?.message,
          code: bookError?.code,
          details: bookError?.details,
          hint: bookError?.hint,
        });
        const errorMessage = bookError?.message || "Impossible d'ajouter le livre";
        setError(errorMessage);
        setSaving(false);
        return;
      }

      // Upsert into user_books (no progress_pct field, it doesn't exist)
      const userBookData: any = {
        user_id: userId,
        book_id: bookId,
        status: 'want_to_read',
        current_page: 0,
      };

      // Add custom_cover_path if cover was uploaded
      if (customCoverPath) {
        userBookData.custom_cover_path = customCoverPath;
      }

      console.log('[AddManualBookModal] User book data for upsert:', userBookData);

      const { data: userBookDataResult, error: userBookError } = await supabase
        .from('user_books')
        .upsert(userBookData, {
          onConflict: 'user_id,book_id',
        })
        .select();

      console.log('[AddManualBookModal] User book upsert result:', {
        data: userBookDataResult,
        error: userBookError,
        errorCode: (userBookError as any)?.code,
        errorMessage: userBookError?.message,
        errorDetails: (userBookError as any)?.details,
        errorHint: (userBookError as any)?.hint,
      });

      if (userBookError) {
        console.error('[AddManualBookModal] Error inserting manual user_book:', userBookError);
        const errorMessage = userBookError.message || "Impossible d'ajouter le livre à votre bibliothèque";
        setError(errorMessage);
        setSaving(false);
        return;
      }

      console.log('[AddManualBookModal] Successfully added book to library');
      onAdded();
      onClose();
    } catch (err) {
      console.error('[AddManualBookModal] Unexpected error:', err);
      const errorMessage = err instanceof Error ? err.message : "Une erreur inattendue est survenue";
      setError(errorMessage);
      setSaving(false);
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
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-2xl">
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                Nombre de pages
              </label>
              <input
                type="number"
                min={1}
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="Ex: 320"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Couverture (optionnel)
            </label>
            
            {/* Hidden file input for web fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

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
                <span className="text-xs mt-1">Caméra ou galerie</span>
              </button>
            )}

            {/* Fallback: URL input (optional, for backward compatibility) */}
            {!coverPreview && (
              <div className="mt-2">
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="Ou coller une URL d'image (optionnel)"
                  className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
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
              className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Ajout en cours...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


