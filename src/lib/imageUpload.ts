import { SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { pickImageBlob } from './pickImage';

/**
 * Upload an image blob to Supabase Storage
 * Normalizes path, handles errors, and returns public URL
 * 
 * @param supabase - Supabase client instance
 * @param params - Upload parameters
 * @returns Object with path and publicUrl
 */
export async function uploadImageToSupabase(
  supabase: SupabaseClient,
  params: {
    bucket: string;
    userId: string;
    kind: 'avatar' | 'cover';
    blob: Blob;
    ext: string;
    bookId?: string; // Optional, for book covers
  }
): Promise<{ path: string; publicUrl: string }> {
  const { bucket, userId, kind, blob, ext, bookId } = params;

  // Normalize path: ${userId}/${kind}/${timestamp}.${ext}
  // For covers: ${userId}/${bookId}/cover_${timestamp}.${ext}
  const timestamp = Date.now();
  const path = bookId
    ? `${userId}/${bookId}/cover_${timestamp}.${ext}`
    : `${userId}/${kind}/${timestamp}.${ext}`;

  // Determine content type
  const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  // Log for iOS debug
  if (import.meta.env.DEV || Capacitor.isNativePlatform()) {
    console.log('[uploadImageToSupabase] Starting upload', {
      platform: Capacitor.getPlatform(),
      bucket,
      path,
      userId,
      kind,
      bookId: bookId || 'N/A',
      contentType,
      blobSize: blob.size,
    });
  }

  try {
    // Upload to Supabase Storage with upsert
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('[uploadImageToSupabase] Upload error', {
        bucket,
        path,
        error: uploadError,
        message: uploadError.message,
      });
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = publicUrlData?.publicUrl;

    if (!publicUrl) {
      throw new Error('Failed to get public URL');
    }

    // Log success
    if (import.meta.env.DEV || Capacitor.isNativePlatform()) {
      console.log('[uploadImageToSupabase] Upload success', {
        path,
        publicUrl: publicUrl.substring(0, 100) + '...',
      });
    }

    return { path, publicUrl };
  } catch (error: any) {
    console.error('[uploadImageToSupabase] Upload failed', {
      bucket,
      path,
      error: error?.message || String(error),
    });
    throw error;
  }
}

/**
 * Pick an image and return as Blob with metadata
 * Wrapper around pickImageBlob for compatibility
 * 
 * @returns Object with blob, ext, and mime, or null if cancelled/error
 */
export async function pickImage(): Promise<{ blob: Blob; ext: string; mime: string } | null> {
  const result = await pickImageBlob();
  if (!result) {
    return null;
  }
  return {
    blob: result.blob,
    ext: result.ext,
    mime: result.contentType,
  };
}
