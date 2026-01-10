import { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pickImageBlob } from '../lib/pickImage';
import { UploadOverlay } from './UploadOverlay';
import { useImagePicker } from '../hooks/useImagePicker';
import { uploadImageToSupabase } from '../lib/imageUpload';

interface AddCoverModalProps {
  open: boolean;
  bookId: string; // UUID of the book
  bookTitle?: string;
  onUploaded: (newUrl: string) => void;
  onClose: () => void;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export function AddCoverModal({
  open,
  bookId,
  onUploaded,
  onClose,
  onShowToast,
}: AddCoverModalProps) {
  const { user } = useAuth();
  const { setIsPicking, shouldBlockClose } = useImagePicker();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverExt, setCoverExt] = useState<string>('jpg');
  const [uploadToast, setUploadToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Reset state when modal closes
  const handleClose = () => {
    // CRITICAL: Prevent close during upload or picking
    if (uploading || shouldBlockClose()) {
      if (import.meta.env.DEV) {
        console.log('[AddCoverModal] Prevented close during upload/picking');
      }
      return;
    }
    // Cleanup blob URLs
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setCoverBlob(null);
    setUploadToast(null);
    onClose();
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleSelectCover = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (uploading || shouldBlockClose()) return;

    // Release previous blob URL if exists
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    // Set global picking state (prevents modal closure)
    setIsPicking(true);

    if (import.meta.env.DEV) {
      console.log('[AddCoverModal] Opening image picker');
    }

    try {
      const result = await pickImageBlob();
    
    if (!result) {
        if (import.meta.env.DEV) {
          console.log('[AddCoverModal] User cancelled image selection');
        }
      return; // User cancelled
    }

      const { blob, contentType, ext } = result;
    setCoverBlob(blob);
    setCoverExt(ext);
    
    // Create preview URL from blob
    const preview = URL.createObjectURL(blob);
    setPreviewUrl(preview);

      if (import.meta.env.DEV) {
        console.log('[AddCoverModal] Image selected', {
          contentType,
          size: blob.size,
          ext,
        });
      }

      // Don't auto-upload - user must click "Enregistrer"
    } finally {
      // Reset picking state after a delay (iOS needs time to settle)
      setTimeout(() => {
        setIsPicking(false);
      }, 500);
    }
  };

  // Upload image to Supabase Storage
  const handleUpload = async () => {
    if (!coverBlob || !bookId || uploading || !user) return;

    setUploading(true);

    try {
      // Use unified upload helper
      const { publicUrl } = await uploadImageToSupabase(supabase, {
        bucket: 'book-covers',
        userId: user.id,
        kind: 'cover',
        blob: coverBlob,
        ext: coverExt,
        bookId,
      });

      // Update user_books.custom_cover_url with public URL (not path)
      const { error: updateError } = await supabase
        .from('user_books')
        .update({ custom_cover_url: publicUrl })
        .eq('user_id', user.id)
        .eq('book_id', bookId);

      if (updateError) {
        console.error('[AddCoverModal] DB update error', {
          code: updateError.code,
          message: updateError.message,
          details: (updateError as any).details,
        });
        const errorMsg = `Erreur DB: ${updateError.code || 'unknown'} - ${updateError.message}`;
        onShowToast?.(errorMsg, 'error');
        setUploading(false);
        return;
      }

      // ALSO update books.cover_url ONLY IF it is currently NULL
      // This ensures Explorer shows the uploaded cover too
      const { error: booksUpdateError } = await supabase
        .from('books')
        .update({ cover_url: publicUrl })
        .eq('id', bookId)
        .is('cover_url', null);

      if (booksUpdateError) {
        // Log error but don't fail the upload (non-critical)
        console.warn('[AddCoverModal] Failed to update books.cover_url:', booksUpdateError);
      }

      if (import.meta.env.DEV) {
        console.log('[AddCoverModal] DB update OK');
      }

      // Update preview with public URL
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(publicUrl);

      // Show success toast (auto-dismiss after 1.2s)
      setUploadToast({ type: 'success', msg: '✅ Couverture mise à jour' });
      setTimeout(() => {
        setUploadToast(null);
      }, 1200);

      // Pass the public URL to onUploaded (but don't close modal automatically)
      onUploaded(publicUrl);
      
      // Don't close automatically - let user decide
    } catch (error: any) {
      console.error('[AddCoverModal] Upload failed:', error);
      const errorMsg = error?.message 
        ? `Échec de l'import: ${error.message}`
        : "Échec de l'import";
      setUploadToast({ type: 'error', msg: errorMsg });
      setTimeout(() => {
        setUploadToast(null);
      }, 3000);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  const handleBackdropPointerDown = (e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      // Prevent close during picking or uploading
      if (shouldBlockClose() || uploading) {
        if (import.meta.env.DEV) {
          console.log('[AddCoverModal] Ignoring backdrop click during picker/upload');
        }
        return;
      }
      handleClose();
    }
  };

  const handleModalContentClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onPointerDown={handleBackdropPointerDown}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={handleModalContentClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h2 className="text-xl font-semibold text-stone-900">Ajouter une couverture</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading || shouldBlockClose()}
            className="text-stone-400 hover:text-stone-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom) + 16px)' }}>
          {/* Preview */}
          {previewUrl && (
            <div 
              className="relative w-full aspect-[2/3] bg-stone-100 rounded-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewUrl}
                alt="Aperçu"
                className="w-full h-full object-cover"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {/* Actions */}
          {uploading ? (
            <div className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-stone-100 rounded-xl">
              <Loader2 className="w-5 h-5 animate-spin text-stone-600" />
              <span className="text-stone-600 font-medium">Upload en cours...</span>
            </div>
          ) : !previewUrl ? (
            <button
              type="button"
              onClick={handleSelectCover}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={uploading || shouldBlockClose()}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ImageIcon className="w-5 h-5" />
              Choisir une image
            </button>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !coverBlob}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-5 h-5" />
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => {
                  if (previewUrl && previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(previewUrl);
                  }
                  setPreviewUrl(null);
                  setCoverBlob(null);
                }}
                disabled={uploading}
                className="w-full px-4 py-3 bg-stone-100 text-stone-900 rounded-xl font-medium hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Choisir une autre image
              </button>
            </div>
          )}

          {/* Info text */}
          <p className="text-xs text-stone-500 text-center">
            Format recommandé : JPEG. L'image sera compressée automatiquement.
          </p>
        </div>
      </div>

      {/* Upload overlay - blocks UI during upload */}
      <UploadOverlay open={uploading} label="Importation de la couverture…" />

      {/* Toast for upload result */}
      {uploadToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-5"
          style={{
            backgroundColor: uploadToast.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white',
            maxWidth: 'calc(100vw - 2rem)',
          }}
        >
          <span className="text-sm font-medium">{uploadToast.msg}</span>
        </div>
      )}
    </div>
  );
}

