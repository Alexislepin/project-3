/**
 * Vérifie si une URL de cover est "cassée" ou invalide.
 * Utilisé côté front et edge pour détecter les covers à remplacer.
 * 
 * @param url - URL de la cover à vérifier
 * @returns true si l'URL est considérée comme cassée/invalide
 */
export function isBadCoverUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return true;
  
  const lower = url.toLowerCase();
  
  // Détecter "image not available" (OpenLibrary placeholder)
  if (lower.includes('image not available') || lower.includes('imagenoavailable')) {
    return true;
  }
  
  // Détecter les placeholders génériques
  if (lower.includes('placeholder') || lower.includes('no-cover') || lower.includes('nocover')) {
    return true;
  }
  
  // Détecter les URLs vides ou invalides
  if (url.trim().length === 0) {
    return true;
  }
  
  // Détecter les data URLs invalides (on garde les data:image/svg+xml valides)
  if (url.startsWith('data:') && !url.startsWith('data:image/')) {
    return true;
  }
  
  return false;
}
