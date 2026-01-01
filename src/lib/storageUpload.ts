import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export interface UploadImageToBucketOptions {
  bucket: string;
  path: string;
  fileUriOrUrl: string; // Can be a file URI (iOS) or blob URL or data URL
  contentType?: string;
  upsert?: boolean;
}

export interface UploadImageToBucketResult {
  publicUrl: string;
  objectPath: string;
}

/**
 * Upload an image to Supabase Storage bucket
 * Handles iOS file URIs by converting them to fetchable URLs using Capacitor.convertFileSrc
 * 
 * @param options - Upload options
 * @returns Object with publicUrl and objectPath
 * @throws Error if upload fails
 */
export async function uploadImageToBucket({
  bucket,
  path,
  fileUriOrUrl,
  contentType = 'image/jpeg',
  upsert = true,
}: UploadImageToBucketOptions): Promise<UploadImageToBucketResult> {
  try {
    // Step 1: Convert iOS URI to fetchable URL if needed
    let fetchableUrl: string;
    if (Capacitor.isNativePlatform()) {
      // On native platforms, convert file URI to a URL that can be fetched
      fetchableUrl = Capacitor.convertFileSrc(fileUriOrUrl);
    } else {
      // On web, use the URL directly (blob URL, data URL, or regular URL)
      fetchableUrl = fileUriOrUrl;
    }

    // Step 2: Fetch the image and convert to Blob
    const response = await fetch(fetchableUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();

    // Step 3: Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        upsert,
        contentType,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[uploadImageToBucket] Upload error:', {
        bucket,
        path,
        error: uploadError,
        message: uploadError.message,
        statusCode: uploadError.statusCode,
      });
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Step 4: Get public URL
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = publicUrlData?.publicUrl;

    if (!publicUrl) {
      throw new Error('Failed to get public URL after upload');
    }

    return {
      publicUrl,
      objectPath: path,
    };
  } catch (error: any) {
    console.error('[uploadImageToBucket] Error:', {
      bucket,
      path,
      fileUriOrUrl,
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Upload a File or Blob directly to Supabase Storage bucket
 * Use this when you already have a File/Blob object (e.g., from file input or camera)
 * 
 * @param options - Upload options
 * @returns Object with publicUrl and objectPath
 * @throws Error if upload fails
 */
export async function uploadFileToBucket({
  bucket,
  path,
  file,
  contentType = file.type || 'image/jpeg',
  upsert = true,
}: {
  bucket: string;
  path: string;
  file: File | Blob;
  contentType?: string;
  upsert?: boolean;
}): Promise<{ publicUrl: string; objectPath: string }> {
  try {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert,
      contentType,
      cacheControl: '3600',
    });

    if (error) {
      console.error('[uploadFileToBucket] Upload error:', {
        bucket,
        path,
        error,
        message: error.message,
        statusCode: error.statusCode,
      });
      throw error;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = data?.publicUrl;

    if (!publicUrl) {
      throw new Error('Failed to get public URL after upload');
    }

    return { publicUrl, objectPath: path };
  } catch (error: any) {
    console.error('[uploadFileToBucket] Error:', {
      bucket,
      path,
      error: error.message || error,
      stack: error.stack,
    });
    throw error;
  }
}
