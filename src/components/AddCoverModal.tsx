import { useState, useRef } from 'react';
import { X, Camera, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { compressImage } from '../utils/imageCompression';

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [source, setSource] = useState<'camera' | 'gallery' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal closes
  const handleClose = () => {
    if (!uploading) {
      setPreviewUrl(null);
      setSelectedFile(null);
      setSource(null);
      onClose();
    }
  };

  // Handle Capacitor Camera (mobile) or file input (web)
  const handleCameraSource = async (cameraSource: CameraSource) => {
    try {
      if (!Capacitor.isNativePlatform()) {
        // Web: use file input
        fileInputRef.current?.click();
        return;
      }

      // Mobile: use Capacitor Camera
      const image = await CapacitorCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: cameraSource,
      });

      if (!image.webPath) {
        onShowToast?.('Aucune image sélectionnée', 'error');
        return;
      }

      // Fetch the image as blob
      const response = await fetch(image.webPath);
      const blob = await response.blob();
      const file = new File([blob], 'cover.jpg', { type: 'image/jpeg' });

      setSelectedFile(file);
      setSource(cameraSource === CameraSource.Camera ? 'camera' : 'gallery');
      setPreviewUrl(image.webPath);
    } catch (error: any) {
      if (error.message?.includes('cancel') || error.message?.includes('User cancelled')) {
        // User cancelled, do nothing
        return;
      }
      console.error('[AddCoverModal] Camera error:', error);
      onShowToast?.('Erreur lors de la prise de photo', 'error');
    }
  };

  // Handle file input (web fallback)
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onShowToast?.('Le fichier doit être une image', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      onShowToast?.('L\'image ne doit pas dépasser 10 Mo', 'error');
      return;
    }

    setSelectedFile(file);
    setSource('gallery');
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Upload compressed image to Supabase Storage
  const handleUpload = async () => {
    if (!selectedFile || !user || !bookId || uploading) return;

    setUploading(true);

    try {
      // Check if bucket exists
      const { data: bucketList, error: bucketError } = await supabase.storage
        .from('book-covers')
        .list('', { limit: 1 });

      if (bucketError) {
        console.error('[AddCoverModal] Bucket check error:', bucketError);
        if (bucketError.message?.includes('not found') || bucketError.message?.includes('Bucket')) {
          onShowToast?.('Le bucket de stockage n\'existe pas. Veuillez le créer dans Supabase.', 'error');
          return;
        }
        throw bucketError;
      }

      // Compress image
      const compressedBlob = await compressImage(selectedFile, 1200, 0.75);
      
      // Generate unique filename (UUID + timestamp)
      const timestamp = Date.now();
      const uuid = crypto.randomUUID();
      const filename = `${uuid}-${timestamp}.jpg`;
      const storagePath = `user_covers/${user.id}/${bookId}/${filename}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('book-covers')
        .upload(storagePath, compressedBlob, {
          contentType: 'image/jpeg',
          upsert: false, // Don't overwrite, create new file
        });

      if (uploadError) {
        console.error('[AddCoverModal] Upload error:', uploadError);
        // Provide more specific error message
        if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
          onShowToast?.('Le bucket de stockage n\'existe pas. Veuillez le créer dans Supabase.', 'error');
        } else if (uploadError.message?.includes('permission') || uploadError.message?.includes('policy')) {
          onShowToast?.('Permission refusée. Vérifiez les politiques RLS du bucket.', 'error');
        } else {
          onShowToast?.(`Erreur d'upload: ${uploadError.message || 'Erreur inconnue'}`, 'error');
        }
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('book-covers')
        .getPublicUrl(storagePath);

      if (!publicUrl) {
        throw new Error('Failed to get public URL');
      }

      // Update user_books with custom_cover_url
      // First, try to update only custom_cover_url (simplest approach)
      const { error: updateError, data: updateData } = await supabase
        .from('user_books')
        .update({ custom_cover_url: publicUrl })
        .eq('user_id', user.id)
        .eq('book_id', bookId)
        .select('id');
      
      // If update found no rows, the book might not be in user_books yet
      if (!updateError && (!updateData || updateData.length === 0)) {
        console.warn('[AddCoverModal] No user_books row found for book_id:', bookId);
        onShowToast?.('Le livre n\'est pas dans votre bibliothèque. Ajoutez-le d\'abord.', 'error');
        // Try to delete uploaded file
        try {
          await supabase.storage.from('book-covers').remove([storagePath]);
        } catch (deleteError) {
          console.error('[AddCoverModal] Failed to delete uploaded file:', deleteError);
        }
        return;
      }

      if (updateError) {
        console.error('[AddCoverModal] Update error:', updateError);
        console.error('[AddCoverModal] Update error details:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        });
        
        // Try to delete uploaded file if DB update fails
        try {
          await supabase.storage
            .from('book-covers')
            .remove([storagePath]);
        } catch (deleteError) {
          console.error('[AddCoverModal] Failed to delete uploaded file:', deleteError);
        }
        
        // Provide specific error message
        if (updateError.message?.includes('permission') || updateError.message?.includes('policy') || updateError.code === '42501') {
          onShowToast?.('Permission refusée pour mettre à jour le livre. Vérifiez les politiques RLS.', 'error');
        } else if (updateError.message?.includes('column') || updateError.code === '42703') {
          onShowToast?.('Erreur de schéma de base de données. Contactez le support.', 'error');
        } else if (updateError.code === 'PGRST116') {
          onShowToast?.('Le livre n\'est pas dans votre bibliothèque. Ajoutez-le d\'abord.', 'error');
        } else {
          onShowToast?.(`Erreur lors de la mise à jour: ${updateError.message || 'Erreur inconnue'}`, 'error');
        }
        throw updateError;
      }
      
      // Optionally update metadata fields if they exist (non-blocking)
      if (source) {
        try {
          await supabase
            .from('user_books')
            .update({
              custom_cover_source: source,
              custom_cover_updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('book_id', bookId);
        } catch (metadataError) {
          // Non-critical, just log it
          console.warn('[AddCoverModal] Failed to update metadata (non-critical):', metadataError);
        }
      }

      onShowToast?.('Couverture ajoutée avec succès', 'success');
      onUploaded(publicUrl);
      handleClose();
    } catch (error: any) {
      console.error('[AddCoverModal] Upload failed:', error);
      console.error('[AddCoverModal] Error details:', {
        message: error?.message,
        statusCode: error?.statusCode,
        error: error?.error,
      });
      
      // Only show generic error if no specific error was already shown
      if (!error?.message || (!error.message.includes('not found') && !error.message.includes('Bucket') && !error.message.includes('permission') && !error.message.includes('policy') && !error.message.includes('Permission'))) {
        const errorMessage = error?.message || error?.error?.message || 'Erreur inconnue';
        onShowToast?.(`Impossible d'ajouter la couverture: ${errorMessage}`, 'error');
      }
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h2 className="text-xl font-semibold text-stone-900">Ajouter une couverture</h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-stone-400 hover:text-stone-600 disabled:opacity-50"
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
          {!previewUrl ? (
            <div className="space-y-3">
              <button
                onClick={() => handleCameraSource(CameraSource.Camera)}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Camera className="w-5 h-5" />
                Prendre une photo
              </button>

              <button
                onClick={() => handleCameraSource(CameraSource.Photos)}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-stone-100 text-stone-900 rounded-xl font-medium hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ImageIcon className="w-5 h-5" />
                Choisir dans la galerie
              </button>

              {/* Hidden file input for web */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Upload en cours...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Ajouter cette couverture
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setPreviewUrl(null);
                  setSelectedFile(null);
                  setSource(null);
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
    </div>
  );
}

