import { useState, useEffect, useRef } from 'react';
import { X, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pickImageBlob } from '../lib/pickImage';
import { UploadOverlay } from './UploadOverlay';
import { Capacitor } from '@capacitor/core';

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
  bookTitle = 'ce livre',
  onUploaded,
  onClose,
  onShowToast,
}: AddCoverModalProps) {
  const { user } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverExt, setCoverExt] = useState<string>('jpg');
  const ignoreBackdropRef = useRef(false);
  const [uploadToast, setUploadToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Reset state when modal closes
  const handleClose = () => {
    // Prevent close during upload
    if (uploading) {
      if (import.meta.env.DEV) {
        console.log('[AddCoverModal] Prevented close during upload');
      }
      return;
    }
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

  const handleSelectCover = async () => {
    if (uploading) return;

    // Release previous blob URL if exists
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    // Prevent backdrop close during picker (iOS bug fix)
    ignoreBackdropRef.current = true;
    setTimeout(() => {
      ignoreBackdropRef.current = false;
    }, 800);

    if (import.meta.env.DEV) {
      console.log('[AddCoverModal] Opening image picker');
    }

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

    // Auto-upload immediately after selection (iOS-friendly)
    handleUpload(blob, contentType, ext);
  };

  // Upload image to Supabase Storage
  const handleUpload = async (blobToUpload?: Blob, contentTypeOverride?: string, extOverride?: string) => {
    const blob = blobToUpload || coverBlob;
    const contentType = contentTypeOverride || `image/${coverExt === 'jpg' ? 'jpeg' : coverExt}`;
    const ext = extOverride || coverExt;

    if (!blob || !bookId || uploading || !user) return;

    setUploading(true);

    try {
      const path = `${user.id}/${bookId}/cover_${Date.now()}.${ext}`;

      if (import.meta.env.DEV) {
        console.log('[AddCoverModal] Uploading', {
          platform: Capacitor.getPlatform(),
          bucket: 'book-covers',
          path,
          userId: user.id,
          bookId,
          contentType,
          blobSize: blob.size,
        });
      }

      // Upload directly to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('book-covers')
        .upload(path, blob, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('[AddCoverModal] Upload error', {
          bucket: 'book-covers',
          path,
          error: uploadError,
          code: uploadError.statusCode,
          message: uploadError.message,
        });
        throw uploadError;
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage.from('book-covers').getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error('Failed to get public URL');
      }

      if (import.meta.env.DEV) {
        console.log('[AddCoverModal] Upload OK', { path, publicUrl });
      }

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (ignoreBackdropRef.current) {
        if (import.meta.env.DEV) {
          console.log('[AddCoverModal] Ignoring backdrop click during picker');
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
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={handleModalContentClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h2 className="text-xl font-semibold text-stone-900">Ajouter une couverture</h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-stone-400 hover:text-stone-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom) + 16px)' }}>
          {/* Preview */}
          {previewUrl && (
            <div className="relative w-full aspect-[2/3] bg-stone-100 rounded-xl overflow-hidden">
              <img
                src={previewUrl}
                alt="Aperçu"
                className="w-full h-full object-cover"
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
              onClick={handleSelectCover}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ImageIcon className="w-5 h-5" />
              Choisir une image
            </button>
          ) : (
            <div className="space-y-3">
              <button
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

