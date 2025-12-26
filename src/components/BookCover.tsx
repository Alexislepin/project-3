import { useState, useEffect, useRef, useMemo } from "react";
import { BookQuickActions } from "./BookQuickActions";

// Cache mémoire global pour les covers (évite de retenter les URLs qui ont échoué)
const coverCache = new Map<string, { valid: boolean; expiresAt: number }>();
const COVER_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures
const COVER_TIMEOUT_MS = 8000; // 8 secondes pour tester une URL cover (augmenté pour 4G lente)

type BookCoverProps = {
  title: string;
  author?: string;
  coverUrl?: string | null; // Initial cover URL (can be from any source)
  isbn?: string | null;
  isbn13?: string | null;
  isbn10?: string | null;
  cover_i?: number | null; // OpenLibrary cover ID (most reliable)
  googleCoverUrl?: string | null; // Google Books thumbnail/smallThumbnail
  className?: string;
  likes?: number;
  comments?: number;
  book?: any; // Full book object for quick actions
  isLiked?: boolean; // Whether current user has liked this book
  onCountsChange?: (nextLikes: number, nextComments: number, nextLiked: boolean) => void;
  onOpenComments?: () => void;
  onShowToast?: (message: string, type?: 'success' | 'info' | 'error') => void;
  showQuickActions?: boolean; // Whether to show quick actions buttons
  onCoverLoaded?: (url: string, source: CoverSource['type']) => void; // Callback when a valid cover is loaded
};

type CoverSource = 
  | { type: 'openlibrary_id'; url: string }
  | { type: 'openlibrary_isbn'; url: string }
  | { type: 'google'; url: string }
  | { type: 'initial'; url: string }
  | { type: 'placeholder'; url: string };

export function BookCover({
  title,
  author,
  coverUrl,
  className = "",
  likes = 0,
  comments = 0,
  book,
  isLiked = false,
  onCountsChange,
  onOpenComments,
  onShowToast,
  showQuickActions = false,
  isbn,
  isbn13,
  isbn10,
  cover_i,
  googleCoverUrl,
  onCoverLoaded,
}: BookCoverProps) {
  // Fallback chain with index
  const [sourceIndex, setSourceIndex] = useState(0);
  // Request ID pour éviter les race conditions (chaque nouveau chargement incrémente)
  const requestIdRef = useRef(0);
  // État "settled" : une fois qu'une image a chargé, on ne fait plus de fallback
  const [isSettled, setIsSettled] = useState(false);
  // Timeout ID pour pouvoir l'annuler
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper: vérifier si une URL contient archive.org (interdit)
  const isArchiveOrgUrl = (url: string): boolean => {
    return url.includes('archive.org');
  };

  // FIX: Build sources avec useMemo pour éviter recalcul à chaque render
  // Build fallback sources in priority order (STRICT: NO archive.org, NO archive.org/download/...zip)
  // PRIORITÉ OBLIGATOIRE: Google Books > OpenLibrary ISBN > OpenLibrary ID > Initial > Placeholder
  // Si une URL archive.org est détectée → considérer comme échec immédiat
  const sources = useMemo((): CoverSource[] => {
    const sourcesList: CoverSource[] = [];

    // Priority 1: Google Books cover (le plus fiable, jamais archive.org)
    if (googleCoverUrl && !isArchiveOrgUrl(googleCoverUrl)) {
      const cached = coverCache.get(googleCoverUrl);
      // Inclure seulement si pas dans le cache ou si valide
      if (!cached || (cached.valid && Date.now() < cached.expiresAt)) {
        sourcesList.push({
          type: 'google',
          url: googleCoverUrl,
        });
      }
    }

    // Priority 2: OpenLibrary ISBN (avec ?default=false pour éviter redirection archive.org)
    const isbnToUse = isbn13 || isbn10 || isbn;
    if (isbnToUse) {
      const cleanIsbn = isbnToUse.replace(/[-\s]/g, '');
      if (cleanIsbn.length >= 10) {
        const url = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`;
        const cached = coverCache.get(url);
        // Inclure seulement si pas dans le cache ou si valide
        if (!cached || (cached.valid && Date.now() < cached.expiresAt)) {
          sourcesList.push({
            type: 'openlibrary_isbn',
            url,
          });
        }
      }
    }

    // Priority 3: OpenLibrary cover_i (avec ?default=false pour éviter redirection archive.org)
    if (typeof cover_i === 'number' && cover_i > 0) {
      const url = `https://covers.openlibrary.org/b/id/${cover_i}-L.jpg?default=false`;
      const cached = coverCache.get(url);
      // Inclure seulement si pas dans le cache ou si valide
      if (!cached || (cached.valid && Date.now() < cached.expiresAt)) {
        sourcesList.push({
          type: 'openlibrary_id',
          url,
        });
      }
    }

    // Priority 4: Initial coverUrl (si fourni et PAS archive.org)
    if (coverUrl && !isArchiveOrgUrl(coverUrl)) {
      const isDuplicate = sourcesList.some(s => s.url === coverUrl);
      if (!isDuplicate) {
        const cached = coverCache.get(coverUrl);
        // Inclure seulement si pas dans le cache ou si valide
        if (!cached || (cached.valid && Date.now() < cached.expiresAt)) {
          sourcesList.push({
            type: 'initial',
            url: coverUrl,
          });
        }
      }
    }

    // Priority 5: Placeholder (always last, pas de fetch)
    sourcesList.push({
      type: 'placeholder',
      url: '/placeholder-cover.svg',
    });

    return sourcesList;
  }, [googleCoverUrl, isbn13, isbn10, isbn, cover_i, coverUrl]);

  const currentSource = sources[sourceIndex] || sources[sources.length - 1];

  // Reset index when props change
  useEffect(() => {
    // Nouveau chargement : incrémenter requestId et réinitialiser settled
    requestIdRef.current += 1;
    setIsSettled(false);
    setSourceIndex(0);
    
    // Annuler le timeout précédent s'il existe
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    
    if (sources.length > 0) {
      const firstSource = sources[0];
      // Log source (corriger l'URL affichée)
      const logUrl = firstSource.type === 'google' && firstSource.url.includes('openlibrary.org')
        ? 'Google Books URL'
        : firstSource.url;
      console.log(`[BookCover] ${title}: Using source ${firstSource.type} - ${logUrl}`);
    }
    
    return () => {
      // Cleanup : annuler timeout si composant démonté
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [coverUrl, cover_i, isbn13, isbn10, isbn, googleCoverUrl, title, sources]);

  // Handle image error - try next source in chain
  const handleImageError = (isRealError: boolean = true) => {
    // Si une image a déjà réussi à charger, ne plus faire de fallback
    if (isSettled) {
      return;
    }
    
    // Vérifier que c'est toujours la même "session" de chargement
    const currentRequestId = requestIdRef.current;
    
    // Vérifier requestId avant setState (éviter race condition)
    if (requestIdRef.current !== currentRequestId) {
      return; // Nouveau chargement en cours, ignorer cet échec
    }
    
    const currentUrl = currentSource.url;
    
    // FIX: Ne marquer invalid QUE sur erreur réelle (onError), PAS sur timeout
    // Timeout != erreur réseau, donc on ne pollue pas le cache
    if (isRealError) {
      // Détecter si l'URL redirige vers archive.org (même après chargement)
      // Si c'est le cas, marquer comme invalide immédiatement
      if (currentUrl && isArchiveOrgUrl(currentUrl)) {
        console.warn(`[BookCover] ${title}: Archive.org URL detected, rejecting immediately`);
        coverCache.set(currentUrl, {
          valid: false,
          expiresAt: Date.now() + COVER_CACHE_TTL_MS,
        });
      }
      
      // Marquer l'URL actuelle comme invalide dans le cache (seulement sur erreur réelle)
      if (currentUrl && currentSource.type !== 'placeholder') {
        coverCache.set(currentUrl, {
          valid: false,
          expiresAt: Date.now() + COVER_CACHE_TTL_MS,
        });
      }
    }
    
    if (sourceIndex < sources.length - 1) {
      const nextIndex = sourceIndex + 1;
      setSourceIndex(nextIndex);
      const nextSource = sources[nextIndex];
      console.log(`[BookCover] ${title}: Fallback to ${nextSource.type} - ${nextSource.url}`);
    } else {
      // Already on placeholder, stop
      console.log(`[BookCover] ${title}: All sources failed, showing placeholder`);
    }
  };

  // Timeout pour forcer le fallback si l'image ne charge pas assez vite
  useEffect(() => {
    if (currentSource.type === 'placeholder') {
      return;
    }
    
    // Si une image a déjà réussi, ne pas mettre de timeout
    if (isSettled) {
      return;
    }

    // Annuler le timeout précédent
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }

    const currentRequestId = requestIdRef.current;
    const currentSourceUrl = currentSource.url;
    
    timeoutIdRef.current = setTimeout(() => {
      // Vérifier que c'est toujours la même session et que l'image n'a pas chargé
      if (requestIdRef.current !== currentRequestId) {
        return; // Nouveau chargement en cours
      }
      
      if (isSettled) {
        return; // Image déjà chargée
      }
      
      // Vérifier que l'URL n'a pas changé
      const currentSourceNow = sources[sourceIndex] || sources[sources.length - 1];
      if (currentSourceNow.url !== currentSourceUrl) {
        return; // Source a changé
      }
      
      // FIX: Timeout n'est PAS une erreur réelle, donc on ne marque pas invalid
      // On passe juste à la source suivante sans polluer le cache
      console.log(`[BookCover] ${title}: Timeout after ${COVER_TIMEOUT_MS}ms, trying next source (not marking as invalid)`);
      handleImageError(false); // false = timeout, pas erreur réelle
    }, COVER_TIMEOUT_MS);

    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
    };
  }, [currentSource.url, sourceIndex, isSettled]);

  // Determine what to render
  const displayUrl = currentSource.url;
  const isPlaceholder = currentSource.type === 'placeholder';

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!isPlaceholder ? (
        <img
          src={displayUrl}
          alt={`${title}${author ? ` - ${author}` : ""}`}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            // Vérifier que c'est toujours la même session de chargement
            const currentRequestId = requestIdRef.current;
            
            // Vérifier que l'image chargée n'est pas une redirection vers archive.org
            const img = e.currentTarget;
            const finalUrl = img.src || displayUrl;
            
            if (isArchiveOrgUrl(finalUrl)) {
              // Si l'image a redirigé vers archive.org, considérer comme échec
              console.warn(`[BookCover] ${title}: Image redirected to archive.org, rejecting`);
              // Ne pas marquer comme settled si archive.org
              handleImageError(true); // true = erreur réelle (archive.org)
              return;
            }
            
            // Vérifier requestId avant setState (éviter race condition)
            if (requestIdRef.current !== currentRequestId) {
              return; // Nouveau chargement en cours, ignorer ce succès
            }
            
            // Annuler le timeout car l'image a chargé
            if (timeoutIdRef.current) {
              clearTimeout(timeoutIdRef.current);
              timeoutIdRef.current = null;
            }
            
            // Marquer comme settled : cette image a réussi, ne plus faire de fallback
            setIsSettled(true);
            
            // Marquer comme valide dans le cache quand l'image charge avec succès
            coverCache.set(displayUrl, {
              valid: true,
              expiresAt: Date.now() + COVER_CACHE_TTL_MS,
            });
            
            // Notifier le parent qu'une cover valide a été chargée (pour cache Supabase)
            // Seulement si ce n'est pas déjà la cover initiale (pour éviter les boucles)
            if (onCoverLoaded && currentSource.type !== 'initial') {
              onCoverLoaded(displayUrl, currentSource.type);
            }
            
            // Log source utilisée pour performance
            const logUrl = currentSource.type === 'google' && displayUrl.includes('openlibrary.org')
              ? 'Google Books URL'
              : displayUrl;
            console.log(`[BookCover] ${title}: ✓ Loaded ${currentSource.type} - ${logUrl}`);
          }}
          onError={() => {
            // Vérifier que c'est toujours la même session
            const currentRequestId = requestIdRef.current;
            
            // Si une image a déjà réussi, ne pas déclencher d'erreur
            if (isSettled) {
              return;
            }
            
            // Vérifier requestId avant setState
            if (requestIdRef.current !== currentRequestId) {
              return; // Nouveau chargement en cours
            }
            
            // Annuler le timeout car on va faire un fallback
            if (timeoutIdRef.current) {
              clearTimeout(timeoutIdRef.current);
              timeoutIdRef.current = null;
            }
            
            handleImageError(true); // true = erreur réelle (onError)
          }}
        />
      ) : (
        <div className="w-full h-full bg-neutral-200 flex items-center justify-center">
          <span className="text-xs text-black/50 px-2 text-center line-clamp-3">
            {title}
          </span>
        </div>
      )}

      {/* Quick Actions (Like/Comment buttons) */}
      {showQuickActions && book && (
        <BookQuickActions
          book={book}
          likesCount={likes}
          commentsCount={comments}
          initiallyLiked={isLiked}
          onCountsChange={onCountsChange}
          onOpenComments={onOpenComments}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
