import { useState, useRef } from 'react';
import { X, Edit3, Camera, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from './Toast';
import { useScrollLock } from '../hooks/useScrollLock';
import { Camera as CapacitorCamera } from '@capacitor/camera';
import { uploadImageToSupabase, generateBookCoverPath } from '../lib/storageUpload';

interface EditBookModalProps {
  userBookId: string;
  initialTitle: string;
  initialAuthor: string;
  initialTotalPages?: number | null;
  initialDescription?: string | null;
  initialCoverUrl?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditBookModal({
  userBookId,
  initialTitle,
  initialAuthor,
  initialTotalPages,
  initialDescription,
  initialCoverUrl,
  onClose,
  onSaved,
}: EditBookModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState(initialTitle ?? '');
  const [author, setAuthor] = useState(initialAuthor ?? '');
  const [totalPages, setTotalPages] = useState(
    initialTotalPages && initialTotalPages > 0 ? String(initialTotalPages) : '',
  );
  const [description, setDescription] = useState(initialDescription ?? '');
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl ?? '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
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
          console.log('[EditBookModal] Capacitor Camera not available, using file input:', error);
        }
      }

      // Fallback: Web file input
      fileInputRef.current?.click();
    } catch (error) {
      console.error('[EditBookModal] Error selecting cover:', error);
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

    if (!title.trim() || !author.trim()) {
      setError("Le titre et l'auteur sont obligatoires");
      return;
    }

    if (!user) {
      setError("Vous devez être connecté pour modifier un livre");
      return;
    }

    setSaving(true);
    setError(null);
    setUploadingCover(true);

    try {
      // Get book_id from user_books
      const { data: userBookData } = await supabase
        .from('user_books')
        .select('book_id')
        .eq('id', userBookId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!userBookData) {
        setError('Livre introuvable');
        setSaving(false);
        setUploadingCover(false);
        return;
      }

      const bookId = userBookData.book_id;

      // Upload cover if file selected
      let coverUrlValue = coverUrl.trim() || null;
      let customCoverPath = null;

      if (coverFile) {
        try {
          const path = generateBookCoverPath(user.id, bookId);
          await uploadImageToSupabase(supabase, coverFile, {
            bucket: 'book-covers',
            path,
            compress: true,
            maxWidth: 800,
            maxHeight: 1200,
            quality: 0.85,
          });

          // Generate public URL from the path
          const { data: { publicUrl } } = supabase.storage
            .from('book-covers')
            .getPublicUrl(path);

          if (!publicUrl) {
            throw new Error('Failed to get public URL');
          }

          customCoverPath = path;
          coverUrlValue = publicUrl;
        } catch (uploadError) {
          console.error('[EditBookModal] Error uploading cover:', uploadError);
          setError('Erreur lors de l\'upload de la couverture. Les autres modifications seront sauvegardées.');
          // Continue without cover
        }
      }

      setUploadingCover(false);

      // Prepare payload
      const payload: any = {
        custom_title: title.trim(),
        custom_author: author.trim(),
        custom_total_pages: totalPages ? (parseInt(totalPages, 10) > 0 ? parseInt(totalPages, 10) : null) : null,
        custom_description: description.trim() || null,
        custom_cover_url: coverUrlValue,
      };

      // Add custom_cover_path if cover was uploaded
      if (customCoverPath) {
        payload.custom_cover_path = customCoverPath;
      }

      console.log('[EditBookModal] Saving custom fields:', {
        userBookId,
        userId: user.id,
        payload,
      });

      const { data, error: updateError } = await supabase
        .from('user_books')
        .update(payload)
        .eq('id', userBookId)
        .eq('user_id', user.id) // Extra safety: ensure user owns this user_book
        .select()
        .single();

      console.log('[EditBookModal] Update result:', {
        data,
        error: updateError,
        errorCode: (updateError as any)?.code,
        errorMessage: updateError?.message,
        errorDetails: (updateError as any)?.details,
        errorHint: (updateError as any)?.hint,
      });

      if (updateError) {
        console.error('[EditBookModal] Error updating user_books custom fields:', updateError);
        const errorMessage = updateError.message || "Une erreur est survenue lors de l'enregistrement";
        setError(errorMessage);
        setToast({ message: errorMessage, type: 'error' });
        setSaving(false);
        return;
      }

      console.log('[EditBookModal] Successfully updated user_books');
      setToast({ message: 'Livre modifié avec succès', type: 'success' });
      
      // Call onSaved callback to refresh UI
      onSaved();
      
      // Close modal after a short delay to show success message
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error('[EditBookModal] Unexpected error:', err);
      const errorMessage = err instanceof Error ? err.message : "Une erreur inattendue est survenue";
      setError(errorMessage);
      setToast({ message: errorMessage, type: 'error' });
      setSaving(false);
    }
  };

  useScrollLock(true);

  return (
    <>
      <div
        className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4"
        data-modal-overlay
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        onTouchMove={(e) => {
          // Prevent scroll on overlay
          const target = e.target as HTMLElement;
          if (!target.closest('[data-modal-content]')) {
            e.preventDefault();
          }
        }}
      >
        <div 
          data-modal-content
          className="bg-white rounded-2xl max-w-md w-full shadow-xl max-h-[85vh] overflow-hidden flex flex-col z-[400]"
        >
          <div className="shrink-0 border-b border-gray-200 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Edit3 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-main-light">Modifier le livre</h2>
                <p className="text-sm text-text-sub-light">
                  Ces modifications sont propres à votre bibliothèque
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

          <div 
            className="flex-1 overflow-y-auto min-h-0 px-4" 
            style={{ 
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)'
            }}
          >
            <form id="edit-book-form" onSubmit={handleSubmit} className="space-y-4 py-4">
              <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Titre personnalisé
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Mon édition préférée"
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Auteur personnalisé
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Nom de l'auteur"
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-main-light mb-2">
                Nombre de pages personnalisé
              </label>
              <input
                type="number"
                min={1}
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="Ex: 320"
                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Description personnalisée
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Votre résumé, vos notes..."
              rows={4}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main-light mb-2">
              Couverture personnalisée
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
            ) : initialCoverUrl ? (
              <div className="relative">
                <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden border-2 border-gray-200">
                  <img
                    src={initialCoverUrl}
                    alt="Couverture actuelle"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSelectCover}
                  className="mt-2 w-full py-2 px-4 bg-primary/10 hover:bg-primary/20 text-black rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Changer la couverture
                </button>
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
            {!coverPreview && !initialCoverUrl && (
              <div className="mt-2">
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="Ou coller une URL d'image (optionnel)"
                  className="w-full px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            )}
          </div>

              {error && (
                <p className="text-sm text-red-600">
                  {error}
                </p>
              )}
            </form>
          </div>

          <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-b-2xl flex-shrink-0 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] z-10">
            <div 
              className="px-4 py-3 flex gap-3"
              style={{ 
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)'
              }}
            >
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
                form="edit-book-form"
                className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}


