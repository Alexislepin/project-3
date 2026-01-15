import { useState, useEffect, useRef } from 'react';
import { X, Edit3, Image as ImageIcon, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from './Toast';
import { useScrollLock } from '../hooks/useScrollLock';
import { uploadImageToSupabase } from '../lib/imageUpload';
import { useImagePicker } from '../hooks/useImagePicker';
import { UploadOverlay } from './UploadOverlay';
import { AddCoverModal } from './AddCoverModal';
import { upsertPooledCover } from '../lib/pooledCovers';
import { canonicalBookKey } from '../lib/bookSocial';
import { ModalPortal } from './ModalPortal';

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
  const [coverPreview, setCoverPreview] = useState<string | null>(initialCoverUrl ?? null);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverExt, setCoverExt] = useState<string>('jpg');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { setIsPicking, shouldBlockClose } = useImagePicker();
  const [showAddCoverModal, setShowAddCoverModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Get book_id for AddCoverModal
  const [bookIdForCover, setBookIdForCover] = useState<string | null>(null);

  // Load book_id when modal opens
  useEffect(() => {
    if (!user || !userBookId) return;
    
    supabase
      .from('user_books')
      .select('book_id')
      .eq('id', userBookId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.book_id) {
          setBookIdForCover(data.book_id);
        }
      });
  }, [user, userBookId]);

  // Trigger file input (works on web + iOS)
  const handlePickCover = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('[EditBookModal] choose cover click');
    
    if (uploadingCover || shouldBlockClose()) {
      console.log('[EditBookModal] blocked: uploading or shouldBlockClose', {
        uploadingCover,
        shouldBlockClose: shouldBlockClose(),
      });
      return;
    }
    
    console.log('[EditBookModal] opening file picker', {
      inputRef: fileInputRef.current,
    });
    
    // SYNCHRONE: pas d'await avant click()
    fileInputRef.current?.click();
  };

  // Handle file selection from input
  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    
    console.log('[EditBookModal] file selected', {
      file: file ? { type: file.type, size: file.size, name: file.name } : null,
    });
    
    if (!file) {
      console.log('[EditBookModal] canceled/no file');
      return;
    }

    // ✅ IMPORTANT: iOS Safari / WebView → reset value pour pouvoir re-choisir le même fichier
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setToast({ message: 'Le fichier sélectionné n\'est pas une image', type: 'error' });
      return;
    }

    if (!user || !bookIdForCover) {
      setToast({ message: 'Erreur: utilisateur ou livre introuvable', type: 'error' });
      return;
    }

    setError(null);
    
    // Release previous blob URL if exists
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }

    try {
      // Convert File to Blob
      const blob = file;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      
      setCoverBlob(blob);
      setCoverExt(ext);
      
      // Create preview URL from blob (NO auto-upload)
      const previewUrl = URL.createObjectURL(blob);
      setCoverPreview(previewUrl);
      
      console.log('[EditBookModal] Image selected', {
        contentType: file.type,
        size: file.size,
        ext,
      });
    } catch (err: any) {
      console.error('[EditBookModal] handleCoverFileChange error:', err);
      setToast({ message: 'Erreur lors de la sélection de l\'image', type: 'error' });
    }
  };

  // Upload cover separately (called when user clicks "Enregistrer la couverture")
  const handleUploadCover = async () => {
    if (!coverBlob || !user || !bookIdForCover || uploadingCover) return;

    setUploadingCover(true);
    setError(null);

    try {
      const { path: storagePath, publicUrl } = await uploadImageToSupabase(supabase, {
        bucket: 'book-covers',
        userId: user.id,
        kind: 'cover',
        blob: coverBlob,
        ext: coverExt,
        bookId: bookIdForCover,
      });

      // Update user_books.custom_cover_url
      const { error: updateError } = await supabase
        .from('user_books')
        .update({ custom_cover_url: publicUrl })
        .eq('id', userBookId)
        .eq('user_id', user.id);

      if (updateError) {
        throw updateError;
      }

      // ALSO update books.cover_url ONLY IF it is currently NULL
      // This ensures Explorer shows the uploaded cover too
      const { error: booksUpdateError } = await supabase
        .from('books')
        .update({ cover_url: publicUrl })
        .eq('id', bookIdForCover)
        .is('cover_url', null);

      if (booksUpdateError) {
        // Log error but don't fail the upload (non-critical)
        console.warn('[EditBookModal] Failed to update books.cover_url:', booksUpdateError);
      }

      // Upsert into public.book_covers pool (non-blocking, non-critical)
      // This allows other users to reuse this cover for the same book_key
      if (bookIdForCover) {
        try {
          // Load book to get book_key
          const { data: bookData } = await supabase
            .from('books')
            .select('id, isbn, isbn13, isbn10, google_books_id, openlibrary_work_key, openlibrary_edition_key')
            .eq('id', bookIdForCover)
            .maybeSingle();

          if (bookData) {
            // Get book_key using canonicalBookKey
            const bookKey = canonicalBookKey(bookData);

            if (bookKey && bookKey !== 'unknown') {
              // Upsert into pool (non-blocking)
              const { success, error: upsertError } = await upsertPooledCover({
                bookKey,
                storagePath,
                width: null, // Optional: can be obtained later if needed
                height: null, // Optional: can be obtained later if needed
                createdBy: user.id,
              });

              if (!success && upsertError) {
                // Log error but don't fail the upload (non-critical)
                console.warn('[EditBookModal] Failed to upsert pooled cover:', upsertError);
                // Show toast only for unexpected RLS errors (not "first upload wins" case)
                // Note: "first upload wins" case returns success: true, so this won't trigger
                if (upsertError.includes('RLS') || upsertError.includes('row-level security')) {
                  setToast({ 
                    message: '⚠️ Couverture enregistrée mais partage non disponible', 
                    type: 'error' 
                  });
                }
              } else if (success) {
                console.debug('[EditBookModal] Successfully added/updated cover in pool:', bookKey);
              }
            }
          }
        } catch (poolError: any) {
          // Non-critical error, log but don't fail upload
          console.warn('[EditBookModal] Error upserting pooled cover (non-critical):', poolError);
        }
      }

      // Cleanup blob URL and update preview
      if (coverPreview && coverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverPreview);
      }
      setCoverPreview(publicUrl);
      setCoverBlob(null); // Clear blob after successful upload

      setToast({ message: '✅ Couverture mise à jour', type: 'success' });
    } catch (err: any) {
      console.error('[EditBookModal] Upload cover error:', err);
      setToast({ 
        message: err?.message || 'Erreur lors de l\'upload de la couverture', 
        type: 'error' 
      });
    } finally {
      setUploadingCover(false);
    }
  };

  const removeCover = () => {
    if (coverPreview && coverPreview.startsWith('blob:')) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverBlob(null);
    setCoverPreview(null);
    setCoverExt('jpg');
  };

  const handleClose = () => {
    // Prevent close during picker or upload
    if (shouldBlockClose() || uploadingCover || saving) {
      return;
    }
    onClose();
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
    // Note: uploadingCover is only set in handleUploadCover, not here

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
        return;
      }

      const bookId = userBookData.book_id;

      // Upload cover if blob selected (but this should be done via handleUploadCover, not here)
      // For now, if coverBlob exists, we should have already uploaded it via handleUploadCover
      // So we use the preview URL (which is the public URL after upload)
      let coverUrlValue: string | null = null;

      if (coverBlob) {
        // Cover was selected but not uploaded yet - user must click "Enregistrer la couverture" first
        setError('Veuillez d\'abord enregistrer la couverture en cliquant sur "Enregistrer la couverture"');
        setSaving(false);
        return;
      } else if (coverPreview && coverPreview.startsWith('http') && !coverPreview.startsWith('blob:')) {
        // Cover was already uploaded (preview is public URL, not blob URL)
        coverUrlValue = coverPreview;
      } else {
        // If no new cover selected, keep existing cover URL
        coverUrlValue = initialCoverUrl || null;
      }

      // Prepare payload
      const payload: any = {
        custom_title: title.trim(),
        custom_author: author.trim(),
        custom_total_pages: totalPages ? (parseInt(totalPages, 10) > 0 ? parseInt(totalPages, 10) : null) : null,
        custom_description: description.trim() || null,
        custom_cover_url: coverUrlValue,
      };

      const { error: updateError } = await supabase
        .from('user_books')
        .update(payload)
        .eq('id', userBookId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('[EditBookModal] Error updating user_books:', updateError);
        const errorMessage = updateError.message || "Une erreur est survenue lors de l'enregistrement";
        setError(errorMessage);
        setToast({ message: errorMessage, type: 'error' });
        setSaving(false);
        return;
      }

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

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Modal] mounted EditBookModal');
    }
  }, []);

  return (
    <>
      <ModalPortal
        onBackdropClick={() => {
          // Prevent close during picker or upload
          if (shouldBlockClose() || uploadingCover || saving) {
            return;
          }
          handleClose();
        }}
        onContentClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="bg-white rounded-2xl max-w-md w-full shadow-xl max-h-[85vh] overflow-hidden flex flex-col">
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
              type="button"
              onClick={handleClose}
              disabled={shouldBlockClose() || uploadingCover || saving}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-text-main-light">
                Couverture personnalisée
              </label>
              <button
                type="button"
                onClick={handlePickCover}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={uploadingCover || shouldBlockClose()}
                className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {uploadingCover ? 'Upload...' : 'Modifier la couverture'}
              </button>
            </div>

            {/* Cover preview clickable */}
            {coverPreview ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handlePickCover}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={uploadingCover || shouldBlockClose()}
                  className="w-full rounded-2xl overflow-hidden border border-black/10 active:scale-[0.99] transition disabled:opacity-50"
                  title="Changer la couverture"
                >
                  <img
                    src={coverPreview}
                    alt="Couverture"
                    className="w-full h-auto block"
                  />
                </button>
                {coverPreview.startsWith('blob:') && coverBlob && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUploadCover();
                      }}
                      disabled={uploadingCover}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Enregistrer la couverture
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeCover();
                      }}
                      disabled={uploadingCover}
                      className="w-full px-4 py-2 bg-stone-100 text-stone-900 rounded-lg font-medium hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePickCover}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={uploadingCover || shouldBlockClose()}
                className="w-full h-40 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors text-text-sub-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ImageIcon className="w-10 h-10 mb-2" />
                <span className="text-sm font-medium">Ajouter une couverture</span>
              </button>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverFileChange}
              className="hidden"
            />
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
                onClick={handleClose}
                disabled={saving || shouldBlockClose() || uploadingCover}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="edit-book-form"
                className="flex-1 py-3 px-4 bg-primary text-black rounded-xl font-semibold hover:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving || shouldBlockClose() || uploadingCover}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* Upload overlay - blocks UI during upload */}
      <UploadOverlay open={uploadingCover} label="Importation de la couverture…" />

      {/* AddCoverModal for iOS-friendly cover selection */}
      {showAddCoverModal && bookIdForCover && (
        <AddCoverModal
          open={showAddCoverModal}
          bookId={bookIdForCover}
          onClose={() => setShowAddCoverModal(false)}
          onUploaded={(newUrl) => {
            // Update preview with new URL
            if (coverPreview && coverPreview.startsWith('blob:')) {
              URL.revokeObjectURL(coverPreview);
            }
            setCoverPreview(newUrl);
            setCoverBlob(null);
            setShowAddCoverModal(false);
            setToast({ message: '✅ Couverture mise à jour', type: 'success' });
          }}
          onShowToast={(message, type) => setToast({ message, type: type || 'info' })}
        />
      )}

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


