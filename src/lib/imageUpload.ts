import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Pick an image using Capacitor Camera (iOS/Android) or fallback to file input (web)
 * @returns Object with blob, extension, and mime type, or null if cancelled/error
 */
export async function pickImage(): Promise<{ blob: Blob; ext: string; mime: string } | null> {
  try {
    // Web: use file input
    if (!Capacitor.isNativePlatform()) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            resolve(null);
            return;
          }

          if (!file.type.startsWith('image/')) {
            resolve(null);
            return;
          }

          const blob = file as Blob;
          const mime = blob.type || 'image/jpeg';
          const ext = getExtensionFromMime(mime);

          resolve({ blob, ext, mime });
        };
        input.oncancel = () => resolve(null);
        input.click();
      });
    }

    // Native: use Capacitor Camera
    const photo = await Camera.getPhoto({
      quality: 75,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Photos,
      width: 1024,
    });

    if (!photo.webPath) {
      return null;
    }

    // Convert webPath to Blob
    const response = await fetch(photo.webPath);
    const blob = await response.blob();

    // Determine mime type and extension from blob
    const mime = blob.type || 'image/jpeg';
    const ext = getExtensionFromMime(mime);

    return { blob, ext, mime };
  } catch (error: any) {
    // User cancelled - return null silently
    if (error?.message?.includes('cancel') || error?.message?.includes('User cancelled')) {
      return null;
    }
    
    // Other errors - log and return null
    console.error('[pickImage] Error:', error);
    return null;
  }
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mime: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return mimeMap[mime.toLowerCase()] || 'jpg';
}

/**
 * Upload an image blob to Supabase Storage
 * @param supabase - Supabase client instance
 * @param bucket - Storage bucket name
 * @param path - Storage path (e.g., "userId/avatar.jpg")
 * @param blob - Image blob to upload
 * @param mime - MIME type (e.g., "image/jpeg")
 * @returns Object with path and public URL
 */
export async function uploadImageToSupabase(
  supabase: SupabaseClient,
  params: {
    bucket: string;
    path: string;
    blob: Blob;
    mime: string;
  }
): Promise<{ path: string; url: string }> {
  const { bucket, path, blob, mime } = params;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: mime,
      upsert: true,
    });

  if (uploadError) {
    console.error('[uploadImageToSupabase] Upload error:', uploadError);
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // Get public URL
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = data?.publicUrl;

  if (!url) {
    throw new Error('Failed to get public URL');
  }

  return { path, url };
}

