import { SupabaseClient } from '@supabase/supabase-js';

export interface UploadImageOptions {
  bucket: string;
  path: string;
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Check if a storage bucket exists
 */
async function checkBucketExists(supabase: SupabaseClient, bucket: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1 });
    // If we can list (even empty), bucket exists
    return !error;
  } catch (error) {
    return false;
  }
}

/**
 * Upload an image file to Supabase Storage
 * @param supabase - Supabase client instance
 * @param file - File or Blob to upload
 * @param options - Upload options
 * @returns Storage path (not URL) - format: "userId/filename.jpg"
 * @throws Error if bucket doesn't exist or upload fails
 */
export async function uploadImageToSupabase(
  supabase: SupabaseClient,
  file: File | Blob,
  options: UploadImageOptions
): Promise<string> {
  const { bucket, path, compress = false, maxWidth = 1920, maxHeight = 1920, quality = 0.8 } = options;

  // Check if bucket exists before attempting upload
  const bucketExists = await checkBucketExists(supabase, bucket);
  if (!bucketExists) {
    throw new Error(`Bucket "${bucket}" not found. Please create it in Supabase Storage.`);
  }

  let fileToUpload: File | Blob = file;

  // Compress image if requested (web only, Capacitor handles compression)
  if (compress && typeof window !== 'undefined' && file instanceof File) {
    try {
      const compressed = await compressImage(file, maxWidth, maxHeight, quality);
      fileToUpload = compressed;
    } catch (error) {
      console.warn('[uploadImageToSupabase] Compression failed, using original:', error);
      // Continue with original file if compression fails
    }
  }

  // Determine content type
  const contentType = file instanceof File 
    ? file.type || 'image/jpeg'
    : 'image/jpeg';

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, fileToUpload, {
      upsert: true,
      contentType,
      cacheControl: '3600',
    });

  if (error) {
    console.error('[uploadImageToSupabase] Upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Return the PATH (not URL) for storage in database
  // The path will be converted to URL at display time using getPublicUrl()
  return path;
}

/**
 * Compress an image file (web only)
 */
async function compressImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          file.type || 'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a unique path for an activity photo
 * Format: {userId}/{index}.jpg
 * Must start with userId/ for proper RLS policies
 */
export function generateActivityPhotoPath(userId: string, index: number): string {
  return `${userId}/${index}.jpg`;
}

/**
 * Generate a unique path for a book cover
 */
export function generateBookCoverPath(userId: string, bookId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `book-covers/${userId}/${bookId}/${timestamp}_${random}.jpg`;
}

