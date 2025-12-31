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
 * @returns Object with blob, contentType, and ext, or null if cancelled/error
 */
export async function pickImageBlob(): Promise<{ blob: Blob; contentType: string; ext: string } | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      // Native: use Capacitor Camera
      const photo = await Camera.getPhoto({
        source: CameraSource.Photos,
        resultType: CameraResultType.Uri,
        quality: 85,
      });

      if (!photo.webPath) {
        if (import.meta.env.DEV) {
          console.log('[pickImageBlob] User cancelled or no webPath');
        }
        return null;
      }

      // Convert webPath to Blob
      const response = await fetch(photo.webPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      const blob = await response.blob();
      
      const contentType = blob.type || 'image/jpeg';
      const ext = getExtensionFromMime(contentType);

      if (import.meta.env.DEV) {
        console.log('[pickImageBlob] Native pick success', {
          platform: Capacitor.getPlatform(),
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
    console.error('[pickImageBlob] Error:', error);
    return null;
  }
}

