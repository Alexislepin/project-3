import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

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
 * Pick an image and return as Blob with metadata
 * Uses Capacitor Camera on native (iOS/Android), file input on web
 * 
 * FIX iOS: Uses Base64 on iOS for better reliability, Uri on Android
 * 
 * @returns Object with blob, contentType, and ext, or null if cancelled/error
 */
export async function pickImageBlob(): Promise<{ blob: Blob; contentType: string; ext: string } | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform();
      
      // Log start
      if (import.meta.env.DEV || platform === 'ios') {
        console.log('[pickImageBlob] Opening image picker', { platform });
      }

      // iOS: Use Base64 for better reliability (Uri can fail on some iOS versions)
      // Android: Use Uri (faster)
      const resultType = platform === 'ios' ? CameraResultType.Base64 : CameraResultType.Uri;

      const photo = await Camera.getPhoto({
        source: CameraSource.Photos,
        resultType,
        quality: 85,
        allowEditing: false,
      });

      let blob: Blob;
      let contentType: string;

      if (resultType === CameraResultType.Base64 && photo.base64String) {
        // iOS: Convert Base64 to Blob
        const base64Data = photo.base64String;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        // Determine content type from format or default to JPEG
        contentType = photo.format === 'png' ? 'image/png' : 'image/jpeg';
        blob = new Blob([byteArray], { type: contentType });

        if (import.meta.env.DEV || platform === 'ios') {
          console.log('[pickImageBlob] iOS Base64 conversion success', {
            format: photo.format,
            contentType,
            size: blob.size,
          });
        }
      } else if (photo.webPath) {
        // Android: Convert webPath to Blob
        const response = await fetch(photo.webPath);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        blob = await response.blob();
        contentType = blob.type || 'image/jpeg';

        if (import.meta.env.DEV) {
          console.log('[pickImageBlob] Android Uri fetch success', {
            contentType,
            size: blob.size,
          });
        }
      } else {
        // User cancelled or no data
        if (import.meta.env.DEV || platform === 'ios') {
          console.log('[pickImageBlob] User cancelled or no data');
        }
        return null;
      }

      const ext = getExtensionFromMime(contentType);

      if (import.meta.env.DEV || platform === 'ios') {
        console.log('[pickImageBlob] Native pick success', {
          platform,
          resultType,
          contentType,
          size: blob.size,
          ext,
        });
      }

      return { blob, contentType, ext };
    } else {
      // Web: use file input
      const file = await new Promise<File | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          resolve(file || null);
        };
        input.oncancel = () => resolve(null);
        input.click();
      });

      if (!file) {
        if (import.meta.env.DEV) {
          console.log('[pickImageBlob] User cancelled file selection');
        }
        return null;
      }

      if (!file.type.startsWith('image/')) {
        if (import.meta.env.DEV) {
          console.warn('[pickImageBlob] Selected file is not an image:', file.type);
        }
        return null;
      }

      const contentType = file.type || 'image/jpeg';
      const ext = getExtensionFromMime(contentType);

      if (import.meta.env.DEV) {
        console.log('[pickImageBlob] Web pick success', {
          fileName: file.name,
          contentType,
          size: file.size,
          ext,
        });
      }

      return { blob: file, contentType, ext };
    }
  } catch (error: any) {
    // User cancelled - return null silently
    if (error?.message?.includes('cancel') || error?.message?.includes('User cancelled')) {
      if (import.meta.env.DEV) {
        console.log('[pickImageBlob] User cancelled');
      }
      return null;
    }
    
    // Other errors - log and return null
    console.error('[pickImageBlob] Error:', {
      message: error?.message,
      stack: error?.stack,
      platform: Capacitor.getPlatform(),
    });
    return null;
  }
}

