/**
 * Helper pour valider qu'une URL d'image charge réellement
 * Utilise new Image() avec timeout pour éviter les 404
 */
export async function validateImageUrl(url: string, timeoutMs: number = 3000): Promise<boolean> {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Rejeter immédiatement les URLs archive.org
  if (url.includes('archive.org')) {
    return false;
  }

  return new Promise((resolve) => {
    const img = new Image();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        // Vérifier que l'image a une taille valide (pas un placeholder 1x1)
        if (img.naturalWidth > 50 && img.naturalHeight > 50) {
          resolve(true);
        } else {
          resolve(false);
        }
      }
    };

    img.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(false);
      }
    };

    img.src = url;
  });
}

